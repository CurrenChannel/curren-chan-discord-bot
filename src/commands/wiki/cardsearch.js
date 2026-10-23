// commands/utility/cardsearch.js
const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlags,
} = require('discord.js');
const { getGameData, formatSkillName, formatCardDisplayName } = require('../../utils/gamedata.js');
const { buildPaginationRow } = require('../../utils/pagination');

const ITEMS_PER_PAGE = 15;

async function buildCardSearchPayload({ skillQuery, rarityFilter, typeFilter, serverFilter = 'all', page = 0 }) {
    const { skills, skillById, cards } = await getGameData();

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
    const hintCards = [];
    const eventCards = [];
    const generalCards = [];

    for (const card of cards) {
        if (serverFilter === 'gl' && !card.released_gl) continue;
        if (serverFilter === 'jp' && card.released_gl) continue;
        if (rarityFilter && card.rarity !== rarityFilter) continue;

        if (typeFilter) {
            if (typeFilter === 'Friend' && !['Friend', 'Group'].includes(card.type)) continue;
            else if (typeFilter !== 'Friend' && card.type !== typeFilter) continue;
        }

        const flag = card.released_gl ? '🌐' : '🇯🇵';
        const name = formatCardDisplayName(card);
        const badge = `*(${card.rarity} ${card.type})*`;

        if (targetId) {
            const hints = (card.skills?.hints || []).map(Number);
            const events = (card.skills?.events || []).map(Number);

            if (hints.includes(targetId)) {
                hintCards.push(`${flag} 💡 **${name}** ${badge} — *Hint*`);
            }
            if (events.includes(targetId)) {
                eventCards.push(`${flag} ✨ **${name}** ${badge} — *Event*`);
            }
        } else {
            generalCards.push(`${flag} **${name}** ${badge}`);
        }
    }

    const allResults = targetId ? [...hintCards, ...eventCards] : generalCards;
    const totalPages = Math.max(1, Math.ceil(allResults.length / ITEMS_PER_PAGE));
    const safePage = Math.max(0, Math.min(page, totalPages - 1));
    const pageItems = allResults.slice(safePage * ITEMS_PER_PAGE, (safePage + 1) * ITEMS_PER_PAGE);

    const container = new ContainerBuilder().setAccentColor(0x5865F2);

    const filterSummary = [
        rarityFilter ? `Rarity: ${rarityFilter}` : 'All Rarities',
        typeFilter ? `Type: ${typeFilter}` : 'All Types',
        serverFilter === 'gl' ? '🌐 Global' : serverFilter === 'jp' ? '🇯🇵 JP Only' : '🌍 Global + JP',
    ].join('  •  ');

    const titleText = skill ? `### 🃏 Card Search: ${formatSkillName(skill)}` : `### 🃏 Support Card Search`;
    const countBreakdown = targetId
        ? `**Found:** ${allResults.length} (${hintCards.length} Hints, ${eventCards.length} Events)`
        : `**Found:** ${allResults.length} Card(s)`;

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `${titleText}\n` +
            `-# ${countBreakdown}  •  **Filters:** ${filterSummary}`
        )
    );

    container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            pageItems.length > 0 ? pageItems.join('\n') : '*No Support Cards found matching these filters.*'
        )
    );

    const navRow = buildPaginationRow('cs_page', safePage, totalPages, [
        targetId || '',
        rarityFilter || '',
        typeFilter || '',
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

function createCardSearchCommand(commandName, description) {
    return {
        data: new SlashCommandBuilder()
            .setName(commandName)
            .setDescription(description)
            .addStringOption(option =>
                option
                    .setName('skill')
                    .setDescription('Find Support Cards that grant this skill via Hints or Events')
                    .setRequired(false)
                    .setAutocomplete(true)
            )
            .addStringOption(option =>
                option
                    .setName('rarity')
                    .setDescription('Filter by Support Card rarity (R, SR, or SSR)')
                    .setRequired(false)
                    .addChoices(
                        { name: '🌈 SSR', value: 'SSR' },
                        { name: '🟨 SR', value: 'SR' },
                        { name: '⬜ R', value: 'R' }
                    )
            )
            .addStringOption(option =>
                option
                    .setName('type')
                    .setDescription('Filter by Support Card type (Speed, Stamina, etc.)')
                    .setRequired(false)
                    .addChoices(
                        { name: '👟 Speed', value: 'Speed' },
                        { name: '❤️ Stamina', value: 'Stamina' },
                        { name: '💪 Power', value: 'Power' },
                        { name: '🔥 Guts', value: 'Guts' },
                        { name: '🎓 Wit', value: 'Wit' },
                        { name: '🤝 Friend / Group', value: 'Friend' }
                    )
            )
            .addStringOption(option =>
                option
                    .setName('server')
                    .setDescription('Filter by server release status')
                    .setRequired(false)
                    .addChoices(
                        { name: '🌐 Global', value: 'gl' },
                        { name: '🇯🇵 JP Only', value: 'jp' },
                        { name: '🌍 All (Global + JP)', value: 'all' }
                    )
            ),

        async autocomplete(interaction) {
            const focused = interaction.options.getFocused().toLowerCase().trim();
            const { skills, skillToCards } = await getGameData();

            const matches = skills.filter(s => {
                if (!skillToCards.has(Number(s.id))) return false;
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
                    const count = (skillToCards.get(Number(s.id)) || []).length;
                    const label = s.name_en ? `${s.name_en} (${s.name_jp})` : s.name_jp;
                    return { name: `${label} [${count} Cards]`.slice(0, 100), value: String(s.id) };
                })
            );
        },

        async execute(interaction) {
            await interaction.deferReply();
            const skillQuery = interaction.options.getString('skill')?.trim();
            const rarityFilter = interaction.options.getString('rarity');
            const typeFilter = interaction.options.getString('type');
            const serverFilter = interaction.options.getString('server') || 'all';

            if (!skillQuery && !rarityFilter && !typeFilter && serverFilter === 'all') {
                return interaction.editReply({
                    components: [
                        new TextDisplayBuilder().setContent(
                            `❌ Please specify at least one filter (\`skill\`, \`rarity\`, \`type\`, or \`server\`).`
                        ),
                    ],
                    flags: MessageFlags.IsComponentsV2,
                });
            }

            const payload = await buildCardSearchPayload({
                skillQuery,
                rarityFilter,
                typeFilter,
                serverFilter,
                page: 0,
            });
            await interaction.editReply(payload);
        },
    };
}

async function handleCardSearchButton(interaction) {
    // customId format: cs_page:<page>:<skillId>:<rarity>:<type>:<server>:<dir>
    const [, pageStr, skillId, rarity, type, server] = interaction.customId.split(':');
    const payload = await buildCardSearchPayload({
        skillQuery: skillId || null,
        rarityFilter: rarity || null,
        typeFilter: type || null,
        serverFilter: server || 'all',
        page: Number(pageStr) || 0,
    });
    await interaction.update(payload);
}

module.exports = createCardSearchCommand('cardsearch', 'Search for Support Cards by skill, rarity, type, or server');
module.exports.createCardSearchCommand = createCardSearchCommand;
module.exports.handleCardSearchButton = handleCardSearchButton;
