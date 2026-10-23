const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlags,
} = require('discord.js');
const { getGameData, formatSkillName, formatCardDisplayName } = require('../../utils/gameData');

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
                    return {
                        name: `${label} [${count} Cards]`.slice(0, 100),
                        value: String(s.id),
                    };
                })
            );
        },

        async execute(interaction) {
            await interaction.deferReply();
            const skillQuery = interaction.options.getString('skill')?.trim();
            const rarityFilter = interaction.options.getString('rarity');
            const typeFilter = interaction.options.getString('type');
            const serverFilter = interaction.options.getString('server') || 'all';
            const { skills, skillById, cards } = await getGameData();

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
                        hintCards.push(`${flag} **${name}** ${badge}`);
                    }
                    if (events.includes(targetId)) {
                        eventCards.push(`${flag} **${name}** ${badge}`);
                    }
                } else {
                    generalCards.push(`${flag} **${name}** ${badge}`);
                }
            }

            const totalFound = targetId ? (hintCards.length + eventCards.length) : generalCards.length;
            const container = new ContainerBuilder().setAccentColor(0x5865F2);

            const filterSummary = [
                rarityFilter ? `Rarity: ${rarityFilter}` : 'All Rarities',
                typeFilter ? `Type: ${typeFilter}` : 'All Types',
                serverFilter === 'gl' ? '🌐 Global' : serverFilter === 'jp' ? '🇯🇵 JP Only' : '🌍 Global + JP',
            ].join('  •  ');

            const titleText = skill ? `### 🃏 Card Search: ${formatSkillName(skill)}` : `### 🃏 Support Card Search`;

            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `${titleText}\n` +
                    `-# **Found:** ${totalFound} result(s)  •  **Filters:** ${filterSummary}`
                )
            );

            container.addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            );

            const sections = [];
            if (targetId) {
                if (hintCards.length > 0) {
                    const shown = hintCards.slice(0, 20).join('\n');
                    const extra = hintCards.length > 20 ? `\n-# *...and ${hintCards.length - 20} more*` : '';
                    sections.push(`**💡 Training Hints (${hintCards.length})**\n${shown}${extra}`);
                }
                if (eventCards.length > 0) {
                    const shown = eventCards.slice(0, 20).join('\n');
                    const extra = eventCards.length > 20 ? `\n-# *...and ${eventCards.length - 20} more*` : '';
                    sections.push(`**✨ Chain / Card Events (${eventCards.length})**\n${shown}${extra}`);
                }
            } else if (generalCards.length > 0) {
                const shown = generalCards.slice(0, 30).join('\n');
                const extra = generalCards.length > 30 ? `\n-# *...and ${generalCards.length - 30} more*` : '';
                sections.push(shown + extra);
            }

            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    sections.length > 0 ? sections.join('\n\n') : '*No Support Cards found matching these filters.*'
                )
            );

            await interaction.editReply({
                components: [container],
                flags: MessageFlags.IsComponentsV2,
            });
        },
    };
}

module.exports = createCardSearchCommand('cardsearch', 'Search for Support Cards by filters');
module.exports.createCardSearchCommand = createCardSearchCommand;
