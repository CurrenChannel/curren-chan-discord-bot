const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

const BASE_URL = 'https://curren.channel/data/cm';

async function fetchSingleCM(query) {
    const endpoint = query === 'next' 
        ? `${BASE_URL}/next.json` 
        : `${BASE_URL}/${query}.json`;

    const res = await fetch(endpoint);
    
    if (res.status === 404) return null;
    
    if (!res.ok) {
        throw new Error(`Failed to fetch (HTTP ${res.status})`);
    }

    return await res.json();
}

module.exports = {
    guildOnly: true,
    data: new SlashCommandBuilder()
        .setName('cm')
        .setDescription('Information on Umamusume Champions Meeting events.')
        .addStringOption(option =>
            option
                .setName('query')
                .setDescription('CM number or "next"')
                .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const query = interaction.options.getString('query').trim().toLowerCase();

        try {
            const targetCM = await fetchSingleCM(query);

            if (!targetCM) {
                return interaction.editReply({
                    content: `❌ Could not find **CM ${query}**.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            const glSchedule = targetCM.gl_start && targetCM.gl_end
                ? `${targetCM.gl_start} – ${targetCM.gl_end}`
                : 'TBA';

            const embed = new EmbedBuilder()
                .setColor(0xF86669)
                .setTitle(`${targetCM.name} (CM ${targetCM.number})`)
                .setURL(`https://gametora.com/umamusume/events/champions-meeting?cm=${targetCM.number}`)
                .addFields(
                    { name: '🌍 Global Schedule', value: glSchedule, inline: false },
                    {
                        name: '🏇 Course',
                        value: `${targetCM.racecourse} ${targetCM.terrain} ${targetCM.length} ${targetCM.distance}`,
                        inline: true,
                    },
                    {
                        name: '↔️ Direction',
                        value: `${targetCM.direction}`,
                        inline: true,
                    },
                    {
                        name: '🌤️ Conditions',
                        value: `${targetCM.track_conditions} — ${targetCM.season} — ${targetCM.weather}`,
                        inline: true,
                    }
                )
                .setFooter({ text: 'Data provided by Gametora' });

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in /cm command:', error);
            await interaction.editReply({
                content: '❌ Failed to connect to curren.channel.',
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
