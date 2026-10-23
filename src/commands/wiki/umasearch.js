const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlags,
} = require('discord.js');
const { getGameData, formatSkillName, formatUmaDisplayName } = require('../../utils/gameData');

function createUmaSearchCommand(commandName, description) {
    return {
        data: new SlashCommandBuilder()
            .setName(commandName)
            .setDescription(description)
            .addStringOption(option =>
                option
                    .setName('skill')
                    .setDescription('Find Playable Umas that have this skill (Innate, Awakening, or Evolved)')
                    .setRequired(false)
                    .setAutocomplete(true)
            )
            .addIntegerOption(option =>
                option
                    .setName('rarity')
                    .setDescription('Filter by base star rarity (1★, 2★, or 3★)')
                    .setRequired(false)
                    .addChoices(
                        { name: '⭐⭐⭐ (3★)', value: 3 },
                        { name: '⭐⭐ (2★)', value: 2 },
                        { name: '⭐ (1★)', value: 1 }
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
                    const count = (skillToUmas.get(Number(s.id)) || []).length;
                    const label = s.name_en ? `${s.name_en} (${s.name_jp})` : s.name_jp;
                    return {
                        name: `${label} [${count} Umas]`.slice(0, 100),
                        value: String(s.id),
                    };
                })
            );
        },

        async execute(interaction) {
            await interaction.deferReply();
            const skillQuery = interaction.options.getString('skill')?.trim();
            const rarityFilter = interaction.options.getInteger('rarity');
            const serverFilter = interaction.options.getString('server') || 'all';
            const { skills, skillById, umas } = await getGameData();

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
                    return interaction.editReply({
                        components: [new TextDisplayBuilder().setContent(`❌ Could not find any skill matching **"${skillQuery}"**.`)],
                        flags: MessageFlags.IsComponentsV2,
                    });
                }
            }

            const targetId = skill ? Number(skill.id) : null;
            const results = [];

            for (const u of umas) {
                if (serverFilter === 'gl' && !u.released_gl) continue;
                if (serverFilter === 'jp' && u.released_gl) continue;

                const umaRarity = Number(u.rarity || u.default_rarity || 3);
                if (rarityFilter && umaRarity !== rarityFilter) continue;

                const flag = u.released_gl ? '🌐' : '🇯🇵';
                const stars = '⭐'.repeat(umaRarity);
                const name = formatUmaDisplayName(u);

                if (targetId) {
                    const sources = [];
                    if (Number(u.skills?.unique) === targetId) sources.push('Unique');
                    if ((u.skills?.innate || []).map(Number).includes(targetId)) sources.push('Innate');
                    for (const awk of u.skills?.awakening || []) {
                        if (Number(awk.skill_id) === targetId) sources.push(`Lv.${awk.level}`);
                    }
                    for (const evo of u.skills?.evolved || []) {
                        if (Number(evo.evolved_skill_id) === targetId || Number(evo.base_skill_id) === targetId) {
                            sources.push('Evolved');
                        }
                    }

                    if (sources.length > 0) {
                        results.push(`${flag} ${stars} **${name}** *(${sources.join(', ')})*`);
                    }
                } else {
                    results.push(`${flag} ${stars} **${name}**`);
                }
            }

            const filterBadges = [
                rarityFilter ? `${rarityFilter}★ Only` : 'All Rarities',
                serverFilter === 'gl' ? '🌐 Global' : serverFilter === 'jp' ? '🇯🇵 JP Only' : '🌍 Global + JP',
            ].join('  •  ');

            const titleText = skill ? `### 🥕 Uma Search: ${formatSkillName(skill)}` : `### 🥕 Playable Uma Search`;

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

            const bodyText = results.length > 0
                ? results.slice(0, 35).join('\n') + (results.length > 35 ? `\n-# *...and ${results.length - 35} more*` : '')
                : '*No Playable Umas found matching these filters.*';

            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(bodyText)
            );

            await interaction.editReply({
                components: [container],
                flags: MessageFlags.IsComponentsV2,
            });
        },
    };
}

module.exports = createUmaSearchCommand('umasearch', 'Search for Playable Umas by skill, star rarity, or server');
module.exports.createUmaSearchCommand = createUmaSearchCommand;
