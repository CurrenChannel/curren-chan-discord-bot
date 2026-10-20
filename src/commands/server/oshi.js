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
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const choices = await getUmaNames();

        const filtered = choices
            .filter(choice => choice.toLowerCase().includes(focusedValue))
            .slice(0, 25);

        await interaction.respond(
            filtered.map(choice => ({ name: choice, value: choice }))
        );
    },

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const selectedName = interaction.options.getString('name');
        const result = await assignOshiRole(interaction, selectedName);

        await interaction.editReply({ content: result.message });
    },
};
