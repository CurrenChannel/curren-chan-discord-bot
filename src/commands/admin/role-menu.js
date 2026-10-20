const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    MessageFlags,
} = require('discord.js');

const STYLE_MAP = {
    Primary: ButtonStyle.Primary,
    Secondary: ButtonStyle.Secondary,
    Success: ButtonStyle.Success,
    Danger: ButtonStyle.Danger,
};

module.exports = {
    guildOnly: true,
    data: new SlashCommandBuilder()
        .setName('role-menu')
        .setDescription('Posts a customizable button role menu in the current channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

        .addStringOption(opt =>
            opt.setName('title')
                .setDescription('Title of the role menu embed')
                .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('description')
                .setDescription('Description text (use \\n for new lines)')
                .setRequired(true)
        )
        .addRoleOption(opt =>
            opt.setName('role1')
                .setDescription('1st role button')
                .setRequired(true)
        )
        .addRoleOption(opt => opt.setName('role2').setDescription('2nd role button'))
        .addRoleOption(opt => opt.setName('role3').setDescription('3rd role button'))
        .addRoleOption(opt => opt.setName('role4').setDescription('4th role button'))
        .addRoleOption(opt => opt.setName('role5').setDescription('5th role button'))

        .addStringOption(opt =>
            opt.setName('emojis')
                .setDescription('Optional emojis separated by commas matching role1–role5 (e.g. 🏆, 👟, 🔔)')
        )
        .addStringOption(opt =>
            opt.setName('button_style')
                .setDescription('Color of the buttons (Default: Secondary / Grey)')
                .addChoices(
                    { name: 'Grey (Secondary)', value: 'Secondary' },
                    { name: 'Blurple (Primary)', value: 'Primary' },
                    { name: 'Green (Success)', value: 'Success' },
                    { name: 'Red (Danger)', value: 'Danger' }
                )
        )
        .addStringOption(opt =>
            opt.setName('embed_color')
                .setDescription('Hex color for the embed sidebar (Default: #F86669)')
        ),

    async execute(interaction) {
        const title = interaction.options.getString('title');

        const description = interaction.options.getString('description').replace(/\\n/g, '\n');
        const styleChoice = interaction.options.getString('button_style') || 'Secondary';
        const embedColor = interaction.options.getString('embed_color') || '#F86669';
        const emojiInput = interaction.options.getString('emojis') || '';

        const emojis = emojiInput
            .split(',')
            .map(e => e.trim())
            .filter(Boolean);

        const roles = [];
        const seenIds = new Set();
        for (let i = 1; i <= 5; i++) {
            const role = interaction.options.getRole(`role${i}`);
            if (role && !seenIds.has(role.id)) {
                seenIds.add(role.id);
                roles.push(role);
            }
        }

        const invalidRole = roles.find(r => r.managed || r.id === interaction.guild.id);
        if (invalidRole) {
            return interaction.reply({
                content: `❌ **${invalidRole.name}** is managed by Discord/an integration and cannot be assigned via buttons.`,
                flags: MessageFlags.Ephemeral,
            });
        }

        const row = new ActionRowBuilder();
        roles.forEach((role, index) => {
            const btn = new ButtonBuilder()
                .setCustomId(`role_toggle_${role.id}`)
                .setLabel(role.name)
                .setStyle(STYLE_MAP[styleChoice] || ButtonStyle.Secondary);

            if (emojis[index]) {
                btn.setEmoji(emojis[index]);
            }

            row.addComponents(btn);
        });

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(embedColor.startsWith('#') ? embedColor : `#${embedColor}`);

        try {
            await interaction.channel.send({
                embeds: [embed],
                components: [row],
            });

            await interaction.reply({
                content: `✅ Role menu posted with **${roles.length}** button(s)!`,
                flags: MessageFlags.Ephemeral,
            });
        } catch (err) {
            console.error('❌ Failed to post button role menu:', err);
            await interaction.reply({
                content: `❌ Failed to post menu. Check that your emojis or hex color are valid! (${err.message})`,
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
