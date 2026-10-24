require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits, MessageFlags, PermissionsBitField } = require('discord.js');
const { getUmaNames, assignOshiRole } = require('./utils/oshiHelper.js');
const { getGameData } = require('./utils/gamedata.js');

const client = new Client({
    intents: [GatewayIntentBits.Guilds],
    rest: {
        api: process.env.PROXY_URL,
    }
});

client.commands = new Collection();
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);

        if ('data' in command && 'execute' in command) {
            command.category = folder;
            client.commands.set(command.data.name, command);
        } else {
            console.warn(`⚠️ The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }
}

client.once(Events.ClientReady, async (readyClient) => {
    console.log(`✅ Ready! Logged in as ${readyClient.user.tag}`);

    try {
        const names = await getUmaNames();
        console.log(`🥕 Pre-loaded ${names.length} Umamusume names into cache.`);
    } catch (err) {
        console.error('❌ Failed to pre-load Uma names on startup:', err);
    }

    try {
        const data = await getGameData();
        console.log(`📚 Pre-loaded ${data.skills.length} skills, ${data.characters.length} playable Umas, and ${data.cards.length} support cards!`);
    } catch (err) {
        console.error('❌ Failed to pre-load game data:', err);
    }
});

client.on(Events.InteractionCreate, async (interaction) => {
    // ---------------------------------------------------------
    // Autocomplete
    // ---------------------------------------------------------
    if (interaction.isAutocomplete()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command || !command.autocomplete) {
            console.warn(`⚠️ No autocomplete handler found for /${interaction.commandName}`);
            return;
        }

        try {
            await command.autocomplete(interaction);
        } catch (error) {
            console.error(`❌ Autocomplete error in /${interaction.commandName}:`, error);
        }
        return;
    }

    // ---------------------------------------------------------
    // Dropdown
    // ---------------------------------------------------------
    if (interaction.isStringSelectMenu()) {
        console.log(`📥 Dropdown selected: ${interaction.customId} -> ${interaction.values[0]}`);

        if (interaction.customId.startsWith('oshi_select_')) {
            try {
                await interaction.update({ components: interaction.message.components });

                const selectedName = interaction.values[0];
                const result = await assignOshiRole(interaction, selectedName);

                await interaction.followUp({
                    content: result.message,
                    flags: MessageFlags.Ephemeral,
                });
            } catch (error) {
                console.error('❌ Dropdown error:', error);
            }
        }
        return;
    }

    // ---------------------------------------------------------
    // Buttons
    // ---------------------------------------------------------
    if (interaction.isButton()) {
        if (interaction.customId.startsWith('role_toggle_')) {
            try {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                const roleId = interaction.customId.replace('role_toggle_', '');
                const role = interaction.guild.roles.cache.get(roleId) || await interaction.guild.roles.fetch(roleId).catch(() => null);

                if (!role) {
                    return interaction.editReply({
                        content: '❌ This role no longer exists on the server.',
                    });
                }

                const botMember = await interaction.guild.members.fetchMe();
                if (role.position >= botMember.roles.highest.position) {
                    return interaction.editReply({
                        content: `❌ I cannot assign **${role.name}** because it is higher than (or equal to) my highest role in Server Settings -> Roles.`,
                    });
                }

                const member = interaction.member;
                const hasRole = member.roles.cache.has(role.id);

                if (hasRole) {
                    await member.roles.remove(role);
                    await interaction.editReply({
                        content: `🗑️ Removed the **${role.name}** role.`,
                    });
                } else {
                    await member.roles.add(role);
                    await interaction.editReply({
                        content: `✅ Added the **${role.name}** role!`,
                    });
                }
            } catch (error) {
                console.error('❌ Button role toggle error:', error);
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({ content: '❌ Something went wrong while toggling your role.' });
                }
            }
        }

        //Search pagination
        if (interaction.customId.startsWith('us_page:')) {
            const { handleUmaSearchButton } = require('./commands/wiki/umasearch');
            return await handleUmaSearchButton(interaction);
        }

        if (interaction.customId.startsWith('cs_page:')) {
            const { handleCardSearchButton } = require('./commands/wiki/cardsearch');
            return await handleCardSearchButton(interaction);
        }
        return;
    }

    // ---------------------------------------------------------
    // Slash commands
    // ---------------------------------------------------------
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) return;

    if (command.category === 'admin' && !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({
            content: '❌ You must be an **Administrator** to use this command.',
            flags: MessageFlags.Ephemeral,
        });
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`❌ Command error in /${interaction.commandName}:`, error);
        const errorMessage = { content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral };
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
