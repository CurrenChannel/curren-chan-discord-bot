const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

const UMA_DATA_URL = 'https://curren.channel/data/uma/uma.json';

module.exports = {
    guildOnly: true,
    data: new SlashCommandBuilder()
        .setName('sync-role-colors')
        .setDescription('Updates all Oshi roles in the server with their official signature hex colors')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option
                .setName('palette')
                .setDescription('Which signature color to apply (default: Main Color)')
                .addChoices(
                    { name: 'Main Color (color_main)', value: 'color_main' },
                    { name: 'Sub Color (color_sub)', value: 'color_sub' }
                )
        ),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const paletteKey = interaction.options.getString('palette') || 'color_main';

        let umaList;
        try {
            const res = await fetch(UMA_DATA_URL);
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            umaList = await res.json();
        } catch (err) {
            console.error('Failed to fetch uma.json:', err);
            return interaction.editReply(`❌ Failed to fetch \`${UMA_DATA_URL}\` (${err.message}).`);
        }

        await interaction.guild.roles.fetch();

        let updatedCount = 0;
        let skippedCount = 0;
        let missingRoleCount = 0;

        await interaction.editReply(
            `🎨 Starting role color sync for **${umaList.length}** Umamusume from \`curren.channel\`... This may take 1–2 minutes due to Discord rate limits.`
        );

        for (const uma of umaList) {
            let targetHex = uma[paletteKey] || uma.color_main;
            if (!targetHex) continue;

            if (targetHex.toUpperCase() === '#000000') {
                targetHex = '#010101';
            }

            const role = interaction.guild.roles.cache.find(
                r => !r.managed && r.name.toLowerCase() === uma.name.toLowerCase()
            );

            if (!role) {
                missingRoleCount++;
                continue;
            }

            if (role.hexColor.toLowerCase() === targetHex.toLowerCase()) {
                skippedCount++;
                continue;
            }

            try {
                await role.setColor(targetHex, `Synced ${uma.name} signature color`);
                updatedCount++;
            } catch (err) {
                console.error(`❌ Failed to color role for ${uma.name}:`, err.message);
            }
        }

        await interaction.editReply(
            `✅ **Role Color Sync Complete!**\n` +
            `• 🎨 **Updated:** ${updatedCount} roles\n` +
            `• ⏭️ **Already matched (Skipped):** ${skippedCount} roles\n` +
            `• ❓ **Roles not in server:** ${missingRoleCount}`
        );
    },
};
