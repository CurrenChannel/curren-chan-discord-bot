// commands/utility/card.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getGameData, formatCardDisplayName } = require('../../utils/gamedata.js');

const TYPE_EMOJI = {
    Speed: '⚡',
    Stamina: '❤️',
    Power: '💪',
    Guts: '🔥',
    Wit: '🎓',
    Friend: '💛',
    Group: '👥',
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('card')
        .setDescription('Look up a Support Card and its training hint skills')
        .addStringOption(option =>
            option
                .setName('query')
                .setDescription('Support Card character name or title')
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addStringOption(option =>
            option
                .setName('type')
                .setDescription('Optional filter by Support Card stat type')
                .addChoices(
                    { name: '⚡ Speed', value: 'Speed' },
                    { name: '❤️ Stamina', value: 'Stamina' },
                    { name: '💪 Power', value: 'Power' },
                    { name: '🔥 Guts', value: 'Guts' },
                    { name: '🎓 Wit', value: 'Wit' },
                    { name: '💛 Friend / Group', value: 'Friend' }
                )
        )
        .addStringOption(option =>
            option
                .setName('rarity')
                .setDescription('Optional filter by Rarity (SSR, SR, R)')
                .addChoices(
                    { name: 'SSR', value: 'SSR' },
                    { name: 'SR', value: 'SR' },
                    { name: 'R', value: 'R' }
                )
        ),

    async autocomplete(interaction) {
        const focused = interaction.options.getFocused().toLowerCase().trim();
        const typeFilter = interaction.options.getString('type');
        const rarityFilter = interaction.options.getString('rarity');
        const { cards, baseUmaById } = await getGameData();

        const matches = cards.filter(card => {
            if (typeFilter && !card.type.includes(typeFilter)) return false;
            if (rarityFilter && card.rarity !== rarityFilter) return false;
            if (!focused) return true;

            const baseUma = baseUmaById.get(Number(card.chara_id));
            const nicknames = (baseUma?.search_names || '').toLowerCase();
            const display = formatCardDisplayName(card).toLowerCase();
            const jpName = (card.full_name_jp || '').toLowerCase();

            return (
                display.includes(focused) ||
                jpName.includes(focused) ||
                nicknames.includes(focused)
            );
        });

        // Sort SSRs & Global-released cards first
        const rarityOrder = { SSR: 3, SR: 2, R: 1 };
        matches.sort((a, b) => {
            if (a.released_gl !== b.released_gl) return (b.released_gl ? 1 : 0) - (a.released_gl ? 1 : 0);
            if (a.rarity !== b.rarity) return (rarityOrder[b.rarity] || 0) - (rarityOrder[a.rarity] || 0);
            return a.id - b.id;
        });

        await interaction.respond(
            matches.slice(0, 25).map(card => {
                const flag = card.released_gl ? '🌐' : '🇯🇵';
                const emoji = TYPE_EMOJI[card.type] || '🃏';
                return {
                    name: `${flag} [${card.rarity}${emoji}${card.type}]${formatCardDisplayName(card)}`.slice(0, 100),
                    value: String(card.id),
                };
            })
        );
    },

    async execute(interaction) {
        await interaction.deferReply();
        const query = interaction.options.getString('query').trim();
        const { cards, baseUmaById, skillById } = await getGameData();

        let card = cards.find(c => String(c.id) === query);
        if (!card) {
            const qLower = query.toLowerCase();
            card = cards.find(c => formatCardDisplayName(c).toLowerCase().includes(qLower));
        }

        if (!card) {
            return interaction.editReply(`❌ Could not find any Support Card matching **"${query}"**.`);
        }

        const baseUma = baseUmaById.get(Number(card.chara_id));
        const embedColor = baseUma?.color_main || (card.rarity === 'SSR' ? '#B978FF' : card.rarity === 'SR' ? '#F5C542' : '#A8B5C2');
        const emoji = TYPE_EMOJI[card.type] || '🃏';

        const resolveSkillWithCost = (sid) => {
            const s = skillById.get(Number(sid));
            if (!s) return `• Skill #${sid}`;
            const name = s.name_en ? `**${s.name_en}** *(${s.name_jp})*` : `**${s.name_jp}**`;
            const cost = s.sp_cost ? ` — \`${s.sp_cost} SP\`` : '';
            return `• ${name}${cost}`;
        };

        const hintList = (card.skills?.hints || []).map(resolveSkillWithCost).join('\n') || 'None listed in database';
        const eventList = (card.skills?.events || []).map(resolveSkillWithCost).join('\n');

        const embed = new EmbedBuilder()
            .setTitle(`[${card.rarity} ${emoji} ${card.type}] ${formatCardDisplayName(card)}`)
            .setColor(embedColor)
            .setDescription(
                `${card.full_name_jp ? `**JP:** ${card.full_name_jp}\n` : ''}` +
                `**Status:** ${card.released_gl ? '🌐 Released on Global' : '🇯🇵 JP Only'}`
            )
            .addFields(
                { name: `💡 Training Hint Skills (${card.skills?.hints?.length || 0})`, value: hintList.slice(0, 1024), inline: false }
            )
            .setFooter({ text: `Support Card ID: ${card.id} • Chara ID: ${card.chara_id}` });

        if (eventList) {
            embed.addFields({ name: '✨ Event Skills', value: eventList.slice(0, 1024), inline: false });
        }

        await interaction.editReply({ embeds: [embed] });
    },
};
