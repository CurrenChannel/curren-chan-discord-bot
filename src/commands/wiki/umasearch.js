// commands/utility/umasearch.js
const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlags,
} = require('discord.js');
const { getGameData, formatSkillName, formatUmaDisplayName } = require('../../utils/gamedata.js');
const { buildPaginationRow } = require('../../utils/pagination');
const { stars } = require('../../utils/emoji.js');

const ITEMS_PER_PAGE = 15;

async function buildUmaSearchPayload({ skillQuery, rarityFilter, serverFilter = 'all', page = 0 }) {
    const { skills, skillById, characters } = await getGameData();

    let skill = null;
    if (skillQuery) {
        skill = skillById.get(Number(skillQuery));
        if (!skill) {
            const qLower = skillQuery.toLowerCase();
            skill = skills.find(
                s => (s.name_en && s.name_en.toLowerCase() === qLower) ||
                     (s.name_jp && s.name_jp.toLowerCase() === qLower)
            ) || skills.find(
                s => (s.name_en && s.name_en.toLowerCase().includes(qLower)) ||
                     (s.name_jp && s.name_jp.toLowerCase().includes(qLower))
            );
        }
        if (!skill) {
            return {
                components: [new TextDisplayBuilder().setContent(`❌ Could not find any skill matching **"${skillQuery}"**.`)],
                flags: MessageFlags.IsComponentsV2,
            };
        }
    }

    const targetId = skill ? Number(skill.id) : null;
    const results = [];

    for (const u of characters) {
        if (serverFilter === 'gl' && !u.released_gl) continue;
        if (serverFilter === 'jp' && u.released_gl) continue;

        const umaRarity = Number(u.rarity || u.default_rarity || 3);
        if (rarityFilter && umaRarity !== Number(rarityFilter)) continue;

        const rarityStars = stars(umaRarity);
        const name = formatUmaDisplayName(u);

        if (targetId) {
            const sources = [];
            if (Number(u.skills?.unique) === targetId) sources.push('Unique');
            if ((u.skills?.innate || []).map(Number).includes(targetId)) sources.push('Innate');
            for (const awk of u.skills?.awakening || []) {
                if (Number(awk.skill_id) === targetId) sources.push(`Lv.${awk.awakening_lv}`);
            }
            for (const evo of u.skills?.evolved || []) {
                if (Number(evo.evolved_skill_id) === targetId || Number(evo.base_skill_id) === targetId) {
                    sources.push('Evolved');
                }
            }
            if (sources.length > 0) {
                results.push(`${rarityStars} **${name}** *(${sources.join(', ')})*`);
            }
        } else {
            results.push(`${rarityStars} **${name}**`);
        }
    }

    const totalPages = Math.max(1, Math.ceil(results.length / ITEMS_PER_PAGE));
    const safePage = Math.max(0, Math.min(page, totalPages - 1));
    const pageItems = results.slice(safePage * ITEMS_PER_PAGE, (safePage + 1) * ITEMS_PER_PAGE);

    const filterBadges = [
        rarityFilter ? `${rarityFilter}★ Only` : 'All Rarities',
        serverFilter === 'gl' ? 'Global' : serverFilter === 'jp' ? 'JP' : 'Global + JP',
    ].join('  •  ');

    const titleText = skill ? `### Uma Search: ${formatSkillName(skill)}` : `### Uma Search`;

    const container = new ContainerBuilder().setAccentColor(0xFF77B7);
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `${titleText}\n` +
            `-# **Found:** ${results.length} Uma(s)  •  **Filters:** ${filterBadges}`
        )
    );

    container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            pageItems.length > 0 ? pageItems.join('\n') : '*No Umas found matching these filters.*'
        )
    );

    const navRow = buildPaginationRow('us_page', safePage, totalPages, [
        targetId || '',
        rarityFilter || '',
        serverFilter || 'all',
    ]);

    if (navRow) {
        container.addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        );
        container.addActionRowComponents(navRow);
    }

    return {
        components: [container],
        flags: MessageFlags.IsComponentsV2,
    };
}

function createUmaSearchCommand(commandName, description) {
    return {
        data: new SlashCommandBuilder()
            .setName(commandName)
            .setDescription(description)
            .addStringOption(option =>
                option
                    .setName('skill')
                    .setDescription('Find Umas that have this skill (Innate, Awakening, or Evolved)')
                    .setRequired(false)
                    .setAutocomplete(true)
            )
            .addIntegerOption(option =>
                option
                    .setName('rarity')
                    .setDescription('Filter by base star rarity (1★, 2★, or 3★)')
                    .setRequired(false)
                    .addChoices(
                        { name: '⭐⭐⭐', value: 3 },
                        { name: '⭐⭐', value: 2 },
                        { name: '⭐', value: 1 }
                    )
            )
            .addStringOption(option =>
                option
                    .setName('server')
                    .setDescription('Filter by server release status')
                    .setRequired(false)
                    .addChoices(
                        { name: 'Global', value: 'gl' },
                        { name: 'JP', value: 'jp' },
                    )
            ),

        async autocomplete(interaction) {
            const focused = interaction.options.getFocused().toLowerCase().trim();
            const { skills, skillToUmas } = await getGameData();

            const matches = skills.filter(s => {
                if (!skillToUmas.has(Number(s.id))) return false;
                const en = (s.name_en || '').toLowerCase();
                const jp = (s.name_jp || '').toLowerCase();
                return !focused || en.includes(focused) || jp.includes(focused) || String(s.id) === focused;
            });

            matches.sort((a, b) => {
                const aStarts = (a.name_en || '').toLowerCase().startsWith(focused) ? 1 : 0;
                const bStarts = (b.name_en || '').toLowerCase().startsWith(focused) ? 1 : 0;
                if (aStarts !== bStarts) return bStarts - aStarts;
                return (b.released_gl ? 1 : 0) - (a.released_gl ? 1 : 0);
            });

            await interaction.respond(
                matches.slice(0, 25).map(s => {
                    const label = s.name_en ? s.name_en : s.name_jp;
                    return { name: `${label}`.slice(0, 100), value: String(s.id) };
                })
            );
        },

        async execute(interaction) {
            await interaction.deferReply();
            const skillQuery = interaction.options.getString('skill')?.trim();
            const rarityFilter = interaction.options.getInteger('rarity');
            const serverFilter = interaction.options.getString('server') || 'all';

            if (!skillQuery && !rarityFilter && serverFilter === 'all') {
                return interaction.editReply({
                    components: [
                        new TextDisplayBuilder().setContent(
                            `❌ Please specify at least one filter (\`skill\`, \`rarity\`, or \`server\`).`
                        ),
                    ],
                    flags: MessageFlags.IsComponentsV2,
                });
            }

            const payload = await buildUmaSearchPayload({
                skillQuery,
                rarityFilter,
                serverFilter,
                page: 0,
            });
            await interaction.editReply(payload);
        },
    };
}

async function handleUmaSearchButton(interaction) {
    // customId format: us_page:<page>:<skillId>:<rarity>:<server>:<dir>
    const [, pageStr, skillId, rarity, server] = interaction.customId.split(':');
    const payload = await buildUmaSearchPayload({
        skillQuery: skillId || null,
        rarityFilter: rarity ? Number(rarity) : null,
        serverFilter: server || 'all',
        page: Number(pageStr) || 0,
    });
    await interaction.update(payload);
}

module.exports = createUmaSearchCommand('umasearch', 'Search for Playable Umas by skill, star rarity, or server');
module.exports.createUmaSearchCommand = createUmaSearchCommand;
module.exports.handleUmaSearchButton = handleUmaSearchButton;
