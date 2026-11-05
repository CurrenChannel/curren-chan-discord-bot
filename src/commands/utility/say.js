const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('Make me say something :)')
        .addStringOption(opt =>
            opt
                .setName('message')
                .setDescription('The message you want me to say')
                .setRequired(true)
        )
        .addChannelOption(opt =>
            opt
                .setName('channel')
                .setDescription('Channel to send the message into')
                .setRequired(false)
        ),

    async execute(interaction) {
        const isDev =
            Boolean(process.env.DEV_USER_ID) &&
            interaction.user.id === process.env.DEV_USER_ID;
        const isAdmin = Boolean(
            interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
        );

        if (!isDev && !isAdmin) {
            return interaction.reply({
                content: '❌ Only server administrators can use this command.',
                flags: MessageFlags.Ephemeral,
            });
        }

        const messageText = interaction.options.getString('message');
        const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

        if (!targetChannel.isTextBased() || !targetChannel.permissionsFor(interaction.client.user)?.has('SendMessages')) {
            return interaction.reply({
                content: '❌ I do not have permission to send messages in that channel.',
                flags: MessageFlags.Ephemeral,
            });
        }

        await targetChannel.send({ content: messageText });

        await interaction.reply({
            content: `✅ Message sent successfully to ${targetChannel}!`,
            flags: MessageFlags.Ephemeral,
        });
    },
};
