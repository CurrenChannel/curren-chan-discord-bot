require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits, MessageFlags, PermissionsBitField } = require('discord.js');
const { getUmaNames, assignOshiRole } = require('./utils/oshiHelper');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

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
