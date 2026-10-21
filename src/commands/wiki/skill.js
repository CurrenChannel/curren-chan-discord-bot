// commands/utility/skill.js
const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlags,
} = require('discord.js');
const { getGameData, RARITY_LABELS, formatSkillName, formatAbility } = require('../../utils/gamedata.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skill')
        .setDescription('Look up an Umamusume skill, its mechanics, and where to obtain it')
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

        const matches = [];
        for (const s of skills) {
            const en = (s.name_en || '').toLowerCase();
            const jp = (s.name_jp || '').toLowerCase();

            if (!focused || en.includes(focused) || jp.includes(focused) || String(s.id) === focused) {
                matches.push(s);
            }
        }

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
                return {
                    name: `${label}${tag}`.slice(0, 100),
                    value: String(s.id),
                };
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
            const errText = new TextDisplayBuilder().setContent(`❌ Could not find any skill matching **"${query}"**.`);
            return interaction.editReply({
                components: [errText],
                flags: MessageFlags.IsComponentsV2,
            });
        }

        const accentHex = skill.rarity === 2 ? 0xF5C542 : skill.rarity >= 3 ? 0xFF77B7 : 0xA8B5C2;
        const container = new ContainerBuilder().setAccentColor(accentHex);

        const rarityText = RARITY_LABELS[skill.rarity] || `Tier ${skill.rarity}`;
        const spText = skill.sp_cost ? `${skill.sp_cost} SP` : 'Innate / Unique';
        const statusText = skill.released_gl ? '🌐 Global' : '🇯🇵 JP Only';

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `# ${formatSkillName(skill)}\n` +
                `**Rarity:** ${rarityText}  •  **Cost:** ${spText}  •  **Server:** ${statusText}\n\n` +
                `${skill.desc_en ? `> ${skill.desc_en}\n` : ''}` +
                `${skill.desc_jp ? `> *${skill.desc_jp}*` : ''}`
            )
        );

        const effectList = skill.effects || [];
        effectList.forEach((effect, idx) => {
            container.addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            );

            const effectDuration = effect.duration > 0 ? `${effect.duration}s` : 'Instant / Passive';
            const effectCooldown = effect.cooldown > 0 && effect.cooldown < 500 ? `${effect.cooldown}s CD` : '';

            const activationCondition = effect.condition
                ? `\`\`\`\n${effect.condition.replace(/&/g, '\n& ').replace(/@/g, '\n@ ')}\n\`\`\``
                : '`None (Always Active)`';

            const abilitiesList = (effect.abilities || []).map(formatAbility);
            const effectText = abilitiesList.length > 0
                ? abilitiesList.map((ability, i) => `• **Effect ${i + 1}:** ${ability}`).join('\n')
                : 'N/A';

            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `## Trigger ${idx + 1}\n` +
                    `### ⏱️ Duration\n` +
                    `${effectDuration}${effectCooldown ? ` | ${effectCooldown}` : ''}\n` +
                    `### 📋 Conditions\n` +
                    `${activationCondition}\n` +
                    `### ✨ Effects\n` +
                    `${effectText}`
                )
            );
        });

        const umaSources = skillToUmas.get(skill.id) || [];
        const cardSources = skillToCards.get(skill.id) || [];

        if (umaSources.length > 0 || cardSources.length > 0) {
            container.addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            );

            const sourceParts = [];
            if (umaSources.length > 0) {
                const shownUmas = umaSources.slice(0, 6).join('\n');
                const extra = umaSources.length > 6 ? `\n*...and ${umaSources.length - 6} more*` : '';
                sourceParts.push(`### 🥕 Playable Umas (${umaSources.length})\n${shownUmas}${extra}`);
            }
            if (cardSources.length > 0) {
                const shownCards = cardSources.slice(0, 6).join('\n');
                const extra = cardSources.length > 6 ? `\n*...and ${cardSources.length - 6} more*` : '';
                sourceParts.push(`### 🃏 Support Cards (${cardSources.length})\n${shownCards}${extra}`);
            }

            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(sourceParts.join('\n\n'))
            );
        }

        container.addSeparatorComponents(
            new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small)
        );
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# Skill ID: ${skill.id} • Grade Value: ${skill.grade_value || 0}`)
        );

        await interaction.editReply({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        });
    },
};
