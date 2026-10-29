const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlags,
    MediaGalleryItemBuilder,
    MediaGalleryBuilder,
} = require('discord.js');
const { getGameData } = require('../../utils/gamedata.js');
const { matchCmToTrack, formatTrackGeometrySection, formatCmGreenSkills, GREEN_SKILL_IDS } = require('./cm');

const NEXT_CM_URL = 'https://curren.channel/data/cm/next.json';

let nextCmCache = { data: null, fetchedAt: 0 };
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function fetchNextCm() {
    const now = Date.now();
    if (nextCmCache.data && now - nextCmCache.fetchedAt < CACHE_TTL_MS) {
        return nextCmCache.data;
    }
    const res = await fetch(NEXT_CM_URL);
    if (!res.ok) {
        throw new Error(`Failed to fetch next CM (${res.status})`);
    }
    const data = await res.json();
    const cmObj = Array.isArray(data) ? data[0] : data;
    nextCmCache = { data: cmObj, fetchedAt: now };
    return cmObj;
}

function formatDateWithCountdown(cm) {
    const baseRange =
        cm.gl_start && cm.gl_end
            ? `${cm.gl_start} – ${cm.gl_end}`
            : cm.gl_start || 'TBA';

    if (!cm.gl_start) return baseRange;

    const parsedMs = Date.parse(`${cm.gl_start} UTC`);
    if (Number.isNaN(parsedMs)) return baseRange;

    const unixSec = Math.floor(parsedMs / 1000);
    return `${baseRange}  *(<t:${unixSec}:R>)*`;
}

async function buildNextCmPayload() {
    const [cm, { tracks, skillById }] = await Promise.all([fetchNextCm(), getGameData()]);

    if (!cm || !cm.name) {
        return {
            components: [
                new TextDisplayBuilder().setContent('No upcoming Champions Meeting data found.'),
            ],
            flags: MessageFlags.IsComponentsV2,
        };
    }

    const track = matchCmToTrack(cm, tracks);
    const isTurf = String(cm.terrain).toLowerCase() === 'turf';
    const container = new ContainerBuilder().setAccentColor(isTurf ? 0x3BA55D : 0xD97706);

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `### Next Champions Meeting — #${cm.number}: ${cm.name}\n` +
            `-# **Scheduled:** ${formatDateWithCountdown(cm)}`
        )
    );

    container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );
    
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            formatCmGreenSkills(cm, skillById)
        )
    );

    const trackSection = formatTrackGeometrySection(track);
    if (trackSection) {
        container.addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        );
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(trackSection));
    }

    const trackImageUrl = (track && track.race_track_id && track.id) ? `https://media.gametora.com/umamusume/racetrack/history/pre_2_5th_anni/simple/en/${track.race_track_id}/${track.id}.png` : null;
    if (trackImageUrl) {
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder()
                    .setURL(trackImageUrl)
                    .setDescription(track.display_name_en || `Track ${track.id}`)
            )
        );
    }

    return {
        components: [container],
        flags: MessageFlags.IsComponentsV2,
    };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nextcm')
        .setDescription('View the upcoming Champions Meeting schedule, conditions, and track geometry'),

    async execute(interaction) {
        await interaction.deferReply();
        const payload = await buildNextCmPayload();
        await interaction.editReply(payload);
    },
};
