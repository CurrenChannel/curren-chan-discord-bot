require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { REST, Routes, PermissionFlagsBits } = require('discord.js');

const globalCommands = [];
const guildCommands = [];

const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);

        if ('data' in command && 'execute' in command) {
            if (folder === 'admin') {
                command.data.setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
            }

            if (command.guildOnly || folder === 'admin') {
                guildCommands.push(command.data.toJSON());
            } else {
                globalCommands.push(command.data.toJSON());
            }
        }
    }
}

console.log("Global Commands:\n" + globalCommands.map(item => item.name).join('\n'));
console.log("Guild Commands:\n" + guildCommands.map(item => item.name).join('\n'));

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        const globalData = await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: globalCommands },
        );
        console.log(`🌍 Successfully deployed ${globalData.length} global (/) commands.`);

        if (process.env.GUILD_ID) {
            const guildData = await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
                { body: guildCommands },
            );
            console.log(`🛠️ Successfully deployed ${guildData.length} guild-only (/) commands.`);
        }
    } catch (error) {
        console.error('❌ Error deploying commands:', error);
    }
})();
