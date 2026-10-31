const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require('discord.js');
const { getGameData, formatSkillName, formatUmaDisplayName } = require('../../utils/gamedata.js');
const { getRecommendedAccels } = require('../../utils/accelEvaluation.js');

const STYLE_LABELS = {
    front: 'Front Runner',
    pace: 'Pace Chaser ',
    late: 'Late Surger',
    end: 'End Closer',
};

async function buildAccelPayload({ trackId, styleKey = 'pace', server = 'gl' }) {
    const { tracks, trackById, skills, skillById, uniqueSkillToUma } = await getGameData();

    let track = trackById.get(Number(trackId));
    if (!track) {
        const q = String(trackId).toLowerCase();
        track = tracks.find(
            t =>
                t.display_name_en.toLowerCase().includes(q) ||
                (t.g1_races || []).some(
                    r => r.name_en.toLowerCase().includes(q) || (r.name_jp && r.name_jp.includes(q))
                )
        );
    }

    if (!track) {
        return {
            components: [new TextDisplayBuilder().setContent(`Could not find any racecourse matching **"${trackId}"**.`)],
            flags: MessageFlags.IsComponentsV2,
        };
    }

    const entry = track.geometry.late_race_entry;
    const phases = track.geometry.phases;
    const g1Names = (track.g1_races || []).map(r => r.name_en).join(', ');
    const thresholds = (track.stat_thresholds || []).map(s => s.name).join(' & ') || 'None';

    const buckets = getRecommendedAccels({ skills, track, styleKey, server });

    const container = new ContainerBuilder().setAccentColor(
        track.surface.id === 1 ? 0x3BA55D : 0xD97706
    );

    const segLabel = entry.is_final_corner
        ? 'Final Corner'
        : entry.is_final_straight
        ? 'Final Straight'
        : entry.segment === 'corner'
        ? 'Corner (before Final Corner)'
        : 'Straight';

    const delayNotes = [];
    if (entry.final_corner_delay_m > 0) delayNotes.push(`Final Corner: +${entry.final_corner_delay_m}m`);
    if (entry.straight_delay_m > 0) delayNotes.push(`Next Straight: +${entry.straight_delay_m}m`);
    if (entry.slope !== 'flat') delayNotes.push(`Slope: ${entry.slope}`);

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `### 🏁 ${track.display_name_en}  •  ${STYLE_LABELS[styleKey]}\n` +
            (g1Names ? `-# **G1s:** ${g1Names}\n` : '') +
            `-# **Turn:** ${track.turn.name}  •  **Stat Threshold:** ${thresholds}  •  **Pool:** ${server === 'gl' ? 'Global' : 'JP (All)'}\n` +
            `-# **Late-Race (${phases.late_race_m}m):** Starts on **${segLabel}**` +
            (delayNotes.length ? `  *(${delayNotes.join(' • ')})*` : '')
        )
    );

    const formatEntry = item => {
        const s = item.skill;
        if (item.category === 'inherited') {
            const parentUma = uniqueSkillToUma.get(Number(s.id));
            const parentText = parentUma ? ` — *${formatUmaDisplayName(parentUma)}*` : '';
            return `${formatSkillName(s)}${parentText}  \`[${item.tag}]\``;
        }

        // Check if Gold skill has a white version
        const whiteBase = (s.versions || [])
            .map(id => skillById.get(Number(id)))
            .find(v => v && v.rarity === 1);
        const subVersion = whiteBase ? ` *(or ${whiteBase.name_en || whiteBase.name_jp})*` : '';
        return `${formatSkillName(s)}${subVersion}  \`[${item.tag}]\``;
    };

    const sections = [];

    if (buckets.inherited.length > 0) {
        sections.push(
            `**Inherited Unique Accels**\n` +
            buckets.inherited.slice(0, 6).map(formatEntry).join('\n')
        );
    }

    if (buckets.core.length > 0) {
        sections.push(
            `**Accels (0m–60m Trigger)**\n` +
            buckets.core.slice(0, 6).map(formatEntry).join('\n')
        );
    }

    if (buckets.backup.length > 0) {
        sections.push(
            `**Inconsistent Accels**\n` +
            buckets.backup.slice(0, 6).map(formatEntry).join('\n')
        );
    }

    container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            sections.length > 0 ? sections.join('\n\n') : '*No matching acceleration skills found for this style/server.*'
        )
    );

    // Running Style Switcher Buttons
    container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            ['front', 'pace', 'late', 'end'].map(st =>
                new ButtonBuilder()
                    .setCustomId(`accel_view:${track.id}:${st}:${server}`)
                    .setLabel(st.charAt(0).toUpperCase() + st.slice(1))
                    .setStyle(st === styleKey ? ButtonStyle.Primary : ButtonStyle.Secondary)
                    .setDisabled(st === styleKey)
            )
        )
    );

    return {
        components: [container],
        flags: MessageFlags.IsComponentsV2,
    };
}

module.exports = {
    guildOnly: true,
    data: new SlashCommandBuilder()
        .setName('accel')
        .setDescription('Recommend Champions Meeting acceleration skills for any track and running style')
        .addStringOption(opt =>
            opt
                .setName('track')
                .setDescription('Search by G1 race name (e.g. Arima Kinen, Derby) or track (e.g. Tokyo 2400)')
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addStringOption(opt =>
            opt
                .setName('style')
                .setDescription('Running style (defaults to Pace Chaser)')
                .setRequired(false)
                .addChoices(
                    { name: 'Front Runner', value: 'front' },
                    { name: 'Pace Chaser', value: 'pace' },
                    { name: 'Late Surger', value: 'late' },
                    { name: 'End Closer', value: 'end' }
                )
        )
        .addStringOption(opt =>
            opt
                .setName('server')
                .setDescription('Filter by server skill pool (defaults to Global)')
                .setRequired(false)
                .addChoices(
                    { name: 'Global', value: 'gl' },
                    { name: 'JP', value: 'all' }
                )
        ),

    async autocomplete(interaction) {
        const focused = interaction.options.getFocused().toLowerCase().trim();
        const { tracks } = await getGameData();

        const matches = tracks.filter(t => {
            if (!focused) return (t.g1_races || []).length > 0;
            const nameMatch = t.display_name_en.toLowerCase().includes(focused);
            const g1Match = (t.g1_races || []).some(
                r => r.name_en.toLowerCase().includes(focused) || (r.name_jp && r.name_jp.includes(focused))
            );
            return nameMatch || g1Match || String(t.id) === focused;
        });

        matches.sort((a, b) => (b.g1_races?.length || 0) - (a.g1_races?.length || 0));

        await interaction.respond(
            matches.slice(0, 25).map(t => {
                const g1List = (t.g1_races || []).map(r => r.name_en).join(', ');
                const label = g1List ? `${t.display_name_en} — ${g1List}` : t.display_name_en;
                return {
                    name: label.slice(0, 100),
                    value: String(t.id),
                };
            })
        );
    },

    async execute(interaction) {
        await interaction.deferReply();
        const trackId = interaction.options.getString('track');
        const styleKey = interaction.options.getString('style') || 'pace';
        const server = interaction.options.getString('server') || 'gl';

        const payload = await buildAccelPayload({ trackId, styleKey, server });
        await interaction.editReply(payload);
    },

    async handleAccelButton(interaction) {
        const [, trackId, styleKey, server] = interaction.customId.split(':');
        const payload = await buildAccelPayload({ trackId, styleKey, server });
        await interaction.update(payload);
    },
};
