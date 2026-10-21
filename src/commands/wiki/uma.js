const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getGameData, formatUmaDisplayName } = require('../../utils/gamedata.js');

const RUNNING_STYLE_NAMES = {
    0: 'Front Runner (Runner)',
    1: 'Pace Chaser (Leader)',
    2: 'Late Surger (Betweener)',
    3: 'End Closer (Chaser)',
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('uma')
        .setDescription('Look up a playable Umamusume outfit, stat bonuses, and skill kit')
        .addStringOption(option =>
            option
                .setName('query')
                .setDescription('Character name, outfit title, or nickname')
                .setRequired(true)
                .setAutocomplete(true)
        ),

    async autocomplete(interaction) {
        const focused = interaction.options.getFocused().toLowerCase().trim();
        const { characters, baseUmaById } = await getGameData();

        const matches = characters.filter(c => {
            if (!focused) return true;
            const baseUma = baseUmaById.get(Number(c.chara_id));
            const nicknames = (baseUma?.search_names || '').toLowerCase();
            const display = formatUmaDisplayName(c).toLowerCase();
            const jpName = (c.full_name_jp || '').toLowerCase();

            return (
                display.includes(focused) ||
                jpName.includes(focused) ||
                nicknames.includes(focused)
            );
        });

        matches.sort((a, b) => {
            if (a.released_gl !== b.released_gl) return (b.released_gl ? 1 : 0) - (a.released_gl ? 1 : 0);
            return a.id - b.id;
        });

        await interaction.respond(
            matches.slice(0, 25).map(c => {
                const tag = c.released_gl ? '🌐' : '🇯🇵';
                return {
                    name: `${tag}${formatUmaDisplayName(c)}`.slice(0, 100),
                    value: String(c.id),
                };
            })
        );
    },

    async execute(interaction) {
        await interaction.deferReply();
        const query = interaction.options.getString('query').trim();
        const { characters, baseUmaById, skillById } = await getGameData();

        let chara = characters.find(c => String(c.id) === query);
        if (!chara) {
            const qLower = query.toLowerCase();
            chara = characters.find(c => formatUmaDisplayName(c).toLowerCase().includes(qLower)) ||
                    characters.find(c => {
                        const base = baseUmaById.get(Number(c.chara_id));
                        return base?.search_names?.toLowerCase().includes(qLower);
                    });
        }

        if (!chara) {
            return interaction.editReply(`❌ Could not find any playable Umamusume matching **"${query}"**.`);
        }

        const baseUma = baseUmaById.get(Number(chara.chara_id));
        const embedColor = baseUma?.color_main || '#F86669';

        const resolveSkill = (sid) => {
            const s = skillById.get(Number(sid));
            if (!s) return `Skill #${sid}`;
            return s.name_en ? `**${s.name_en}** *(${s.name_jp})*` : `**${s.name_jp}**`;
        };

        // Format Stat Bonuses
        const sb = chara.stat_bonuses || {};
        const bonusParts = [
            sb.speed ? `⚡ SPD **+${sb.speed}%**` : null,
            sb.stamina ? `❤️ STA **+${sb.stamina}%**` : null,
            sb.power ? `💪 POW **+${sb.power}%**` : null,
            sb.guts ? `🔥 GUT **+${sb.guts}%**` : null,
            sb.wit ? `🎓 WIT **+${sb.wit}%**` : null,
        ].filter(Boolean).join('  •  ') || 'None';

        const uniqueUpgraded = (chara.skills?.unique_upgraded || []).map(resolveSkill).join('\n') || 'None';
        const uniqueBase = (chara.skills?.unique_base || []).map(resolveSkill).join('\n');

        const innateList = (chara.skills?.innate || []).map(sid => `• ${resolveSkill(sid)}`).join('\n') || 'None';
        const awakeningList = (chara.skills?.awakening || [])
            .map(a => `• **Lv.${a.awakening_lv}:**${resolveSkill(a.skill_id)}`)
            .join('\n') || 'None';

        const embed = new EmbedBuilder()
            .setTitle(`${'⭐'.repeat(chara.default_rarity)}${formatUmaDisplayName(chara)}`)
            .setColor(embedColor)
            .setDescription(
                `${chara.full_name_jp ? `**JP:** ${chara.full_name_jp}\n` : ''}` +
                `**Status:** ${chara.released_gl ? '🌐 Released on Global' : '🇯🇵 JP Only'}` +
                (baseUma ? `  •  **Style:** ${RUNNING_STYLE_NAMES[baseUma.running_style] || 'Unknown'}` : '')
            )
            .addFields(
                { name: '📈 Stat Growth Bonuses', value: bonusParts, inline: false },
                {
                    name: '🌈 Unique Skill (3★+)',
                    value: uniqueBase && uniqueBase !== uniqueUpgraded
                        ? `${uniqueUpgraded}\n*(1★–2★ Base: ${uniqueBase})*`
                        : uniqueUpgraded,
                    inline: false,
                },
                { name: '📘 Innate Skills (Lv.1)', value: innateList.slice(0, 1024), inline: true },
                { name: '🔓 Potential Awakening (Lv.2–5)', value: awakeningList.slice(0, 1024), inline: true }
            )
            .setFooter({ text: `Outfit ID: ${chara.id} • Chara ID: ${chara.chara_id}` });

        await interaction.editReply({ embeds: [embed] });
    },
};
