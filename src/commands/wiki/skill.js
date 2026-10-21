const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getGameData, RARITY_LABELS, formatSkillName, formatAbility } = require('../../utils/gamedata.js');

module.exports = {
    guildOnly: true,
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
            return interaction.editReply(`❌ Could not find any skill matching **"${query}"**.`);
        }

        const embedColor = skill.rarity === 2 ? '#F5C542' : skill.rarity >= 3 ? '#FF77B7' : '#A8B5C2';
        const embed = new EmbedBuilder()
            .setTitle(formatSkillName(skill))
            .setColor(embedColor)
            .setDescription(
                `${skill.desc_en ? `**EN:** ${skill.desc_en}\n` : ''}` +
                `${skill.desc_jp ? `**JP:** ${skill.desc_jp}` : ''}`
            )
            .addFields(
                { name: 'Rarity', value: RARITY_LABELS[skill.rarity] || `Tier ${skill.rarity}`, inline: true },
                { name: 'SP Cost', value: skill.sp_cost ? `${skill.sp_cost} SP` : 'Innate / Unique', inline: true },
                { name: 'Server Status', value: skill.released_gl ? '🌐 Released on Global' : '🇯🇵 JP Only', inline: true }
            );

        const effect = skill.effect;

        const effectDuration = effect.duration > 0 ? `${effect.duration}s` : 'Instant / Passive';
        const effectCooldown = effect.cooldown > 0 && effect.cooldown < 500 ? ` (CD: ${effect.cooldown}s)` : '';


        if (effectDuration) {
            embed.addFields({ name: '⏱️ Duration', value: `${effectDuration}s` + ((effectCooldown) ? ` | ${effectCooldown}` : '') });
        }
        
        const activationCondition = effect.condition.replace(/&/g, '\n&');

        if (activationCondition) {
            embed.addFields({ name: '📋 Conditions', value: activationCondition });
        }


        const abilitiesList = (effect.abilities || []).map(formatAbility);

        const effectText = (abilitiesList || []).map((ability, idx) => {
                return(`**Effect ${idx + 1}:**${ability}\n\n`);
        });

        if (effectText) {
            embed.addFields({ name: '✨ Effects', value: effectsText.slice(0, 1024) });
        }

        const umaSources = skillToUmas.get(skill.id) || [];
        if (umaSources.length > 0) {
            const shownUmas = umaSources.slice(0, 8).join('\n');
            const extra = umaSources.length > 8 ? `\n*...and ${umaSources.length - 8} more*` : '';
            embed.addFields({ name: `🥕 Playable Umas (${umaSources.length})`, value: (shownUmas + extra).slice(0, 1024) });
        }

        const cardSources = skillToCards.get(skill.id) || [];
        if (cardSources.length > 0) {
            const shownCards = cardSources.slice(0, 8).join('\n');
            const extra = cardSources.length > 8 ? `\n*...and ${cardSources.length - 8} more*` : '';
            embed.addFields({ name: `🃏 Support Cards (${cardSources.length})`, value: (shownCards + extra).slice(0, 1024) });
        }

        embed.setFooter({ text: `Skill ID: ${skill.id} • Grade Value: ${skill.grade_value || 0}` });

        await interaction.editReply({ embeds: [embed] });
    },
};
