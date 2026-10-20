const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getUmaNames, assignOshiRole } = require('../../utils/oshiHelper');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('oshi')
        .setDescription('Pick or change your Oshi Umamusume.')
        .addStringOption(option =>
            option
                .setName('name')
                .setDescription('Umamusume name')
                .setRequired(true)
                .setAutocomplete(true)
        ),

    async autocomplete(interaction) {
        try {
            const focusedValue = interaction.options.getFocused().toLowerCase();
            const choices = await getUmaNames();

            const filtered = choices
                .filter(choice => 
                    typeof choice === 'string' && 
                    choice.trim().length > 0 && 
                    choice.toLowerCase().includes(focusedValue)
                )
                .slice(0, 25)
                .map(choice => {
                    const trimmed = choice.trim();
                    const safeString = trimmed.length > 100 ? trimmed.substring(0, 97) + '...' : trimmed;
                    return { name: safeString, value: safeString };
                });

            await interaction.respond(filtered);
        } catch (error) {
            console.error('❌ Autocomplete execution error:', error);
            try {
                await interaction.respond([]).catch(() => {});
            } catch {}
        }
    },

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const selectedName = interaction.options.getString('name');
        const result = await assignOshiRole(interaction, selectedName);

        await interaction.editReply({ content: result.message });
    },
};
