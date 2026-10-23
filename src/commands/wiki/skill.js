// commands/utility/skill.js
const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlags,
} = require('discord.js');
const { getGameData, RARITY_LABELS, formatSkillName, formatAbility } = require('../../utils/gameData');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skill')
        .setDescription('Look up an Umamusume skill and its exact mechanics')
        .addStringOption(option =>
            option
                .setName('query')
                .setDescription('Skill name (EN or JP)')
                .setRequired(true)
                .setAutocomplete(true)
        ),

    async autocomplete(interaction) {
        const focused = interaction.options.getFocused().toLowerCase().trim();
        const { skills } = await getGameData();

        const matches = skills.filter(s => {
            const en = (s.name_en || '').toLowerCase();
            const jp = (s.name_jp || '').toLowerCase();
            return !focused || en.includes(focused) || jp.includes(focused) || String(s.id) === focused;
        });

        matches.sort((a, b) => {
            const aStarts = (a.name_en || '').toLowerCase().startsWith(focused) ? 1 : 0;
            const bStarts = (b.name_en || '').toLowerCase().startsWith(focused) ? 1 : 0;
            if (aStarts !== bStarts) return bStarts - aStarts;
            if (a.released_gl !== b.released_gl) return (b.released_gl ? 1 : 0) - (a.released_gl ? 1 : 0);
            return a.id - b.id;
        });

        await interaction.respond(
            matches.slice(0, 25).map(s => {
                const label = s.name_en ? `${s.name_en} (${s.name_jp})` : s.name_jp;
                const tag = s.released_gl ? '' : ' [JP]';
                return { name: `${label}${tag}`.slice(0, 100), value: String(s.id) };
            })
        );
    },

    async execute(interaction) {
        await interaction.deferReply();
        const query = interaction.options.getString('query').trim();
        const { skills, skillById, skillToUmas, skillToCards } = await getGameData();

        let skill = skillById.get(Number(query));
        if (!skill) {
            const qLower = query.toLowerCase();
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
                components: [new TextDisplayBuilder().setContent(`❌ Could not find any skill matching **"${query}"**.`)],
                flags: MessageFlags.IsComponentsV2,
            });
        }

        const accentHex = skill.rarity === 2 ? 0xF5C542 : skill.rarity >= 3 ? 0xFF77B7 : 0xA8B5C2;
        const container = new ContainerBuilder().setAccentColor(accentHex);

        const rarityText = RARITY_LABELS[skill.rarity] || `Tier ${skill.rarity}`;
        const spText = skill.sp_cost ? `${skill.sp_cost} SP` : 'Unique';
        const statusText = skill.released_gl ? 'Global' : 'JP Only';

        const descLines = [
            skill.desc_en ? `> ${skill.desc_en}` : null,
            skill.desc_jp ? `> -# *${skill.desc_jp}*` : null,
        ].filter(Boolean).join('\n');

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `### ${formatSkillName(skill)}\n` +
                `-# ${rarityText}  •  **Cost:** ${spText}  •  ${statusText}\n` +
                (descLines ? `${descLines}` : '')
            )
        );

        const effectList = skill.effects || [];
        if (effectList.length > 0) {
            container.addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            );

            const triggersFormatted = effectList.map((effect, idx) => {
                const triggerLabel = effectList.length > 1 ? `**Trigger ${idx + 1}**  •  ` : '';
                const durText = effect.duration > 0 ? `\`${effect.duration}s\`` : '`Instant / Passive`';
                const cdText = effect.cooldown > 0 && effect.cooldown < 500 ? ` *(${effect.cooldown}s CD)*` : '';

                const rawCond = (effect.condition || '').trim();
                const condBlock = rawCond
                    ? `\`\`\`\n${rawCond.replace(/&/g, '\n& ').replace(/@/g, '\n@ ')}\n\`\`\``
                    : '`None (Always Active)`';

                const abilitiesList = (effect.abilities || []).map(formatAbility);
                const effectsInline = abilitiesList.length > 0 ? abilitiesList.join('  •  ') : 'N/A';

                return (
                    `${triggerLabel}**Duration:** ${durText}${cdText}\n` +
                    `**Effects:** ${effectsInline}\n` +
                    `**Conditions:**\n${condBlock}`
                );
            }).join('\n\n');

            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(triggersFormatted)
            );
        }

        const umaCount = (skillToUmas.get(Number(skill.id)) || []).length;
        const cardCount = (skillToCards.get(Number(skill.id)) || []).length;

        const skillName = skill.name_en || skill.name_jp;
        container.addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        );
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `-# ID: ${skill.id} • Grade: ${skill.grade_value || 0} • Sources: ${umaCount} Umas. \`/us skill:${skillName}\` to view them | ${cardCount} Cards. \`/cs skill:${skillName}\` to view them`
            )
        );

        await interaction.editReply({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        });
    },
};
