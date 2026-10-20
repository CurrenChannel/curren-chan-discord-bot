const {
    SlashCommandBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    PermissionFlagsBits,
    MessageFlags,
} = require('discord.js');
const { getOshiNames } = require('../../utils/oshiHelper');

module.exports = {
    guildOnly: true,
    data: new SlashCommandBuilder()
        .setName('setup-oshi')
        .setDescription('Posts the Oshi Umamusume role dropdown menus in the current channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const oshiNames = await getOshiNames();
        const CHUNK_SIZE = 25;
        const actionRows = [];

        for (let i = 0; i < oshiNames.length; i += CHUNK_SIZE) {
            const chunk = oshiNames.slice(i, i + CHUNK_SIZE);
            const firstName = chunk[0];
            const lastName = chunk[chunk.length - 1];

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`oshi_select_${i / CHUNK_SIZE}`)
                .setPlaceholder(`⭐ Select Oshi (${firstName} – ${lastName})`)
                .addOptions(
                    chunk.map(name => ({
                        label: name,
                        value: name,
                    }))
                );

            actionRows.push(new ActionRowBuilder().addComponents(selectMenu));
        }

        for (let i = 0; i < actionRows.length; i += 5) {
            const rowBatch = actionRows.slice(i, i + 5);
            await interaction.channel.send({
                content: i === 0 ? '### ⭐ Choose Your Oshi Umamusume!\nSelect a character from the dropdowns below to get their role, or use `/oshi` anywhere in the server:' : undefined,
                components: rowBatch,
            });
        }

        await interaction.editReply({ content: '✅ Oshi role menus have been posted!' });
    },
};
