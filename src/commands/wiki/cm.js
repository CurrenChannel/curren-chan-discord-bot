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
    MediaGalleryItemBuilder,
    MediaGalleryBuilder,
} = require('discord.js');
const { getGameData, formatSkillName } = require('../../utils/gamedata.js');
const { type } = require('../../utils/emoji.js');

const CM_LIST_URL = 'https://curren.channel/data/cm/list.json';

const GREEN_SKILL_IDS = {
    direction: {
        right: 200012,
        left: 200022,
    },
    racecourse: {
        tokyo: 200032,
        nakayama: 200042,
        hanshin: 200052,
        kyoto: 200062,
        chukyo: 200072,
        sapporo: 200082,
        hakodate: 200092,
        fukushima: 200102,
        niigata: 200112,
        kokura: 200122,
        oi: 200262,
        ohoi: 200262,
    },
    distance_standard: {
        standard: 200132,
        non_standard: 200142,
    },
    track_conditions: {
        firm: 200152,
        good: 200162,
        soft: 200162,
        heavy: 200162,
    },
    season: {
        spring: 200172,
        summer: 200182,
        autumn: 200192,
        fall: 200192,
        winter: 200202,
    },
    weather: {
        sunny: 200212,
        cloudy: 200222,
        rainy: 200232,
        rain: 200232,
        snowy: 200242,
        snow: 200242,
    },
};

// Simple in-memory cache so button clicks & autocomplete stay fast
let cmCache = { data: null, fetchedAt: 0 };
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function fetchCmList() {
    const now = Date.now();
    if (cmCache.data && now - cmCache.fetchedAt < CACHE_TTL_MS) {
        return cmCache.data;
    }
    const res = await fetch(CM_LIST_URL);
    if (!res.ok) {
        throw new Error(`Failed to fetch CM list (${res.status})`);
    }
    const data = await res.json();
    cmCache = { data, fetchedAt: now };
    return data;
}

/**
 * Matches a CM entry from list.json to its corresponding track in tracks.json:
 * - cm.racecourse => track.track_name_en
 * - cm.length ("2400 m") => track.distance (2400)
 * - cm.direction => track.turn.name
 * - cm.terrain => track.surface.name
 */
function matchCmToTrack(cm, tracks) {
    if (!cm || !Array.isArray(tracks)) return null;

    const targetDist = parseInt(String(cm.length).replace(/[^\d]/g, ''), 10);
    const rawCourse = String(cm.racecourse || '').trim().toLowerCase();
    const rawDir = String(cm.direction || '').trim().toLowerCase();
    const targetTerrain = String(cm.terrain || '').trim().toLowerCase();

    const wantsInner = rawCourse.includes('inner') || rawDir.includes('inner');
    const wantsOuter = rawCourse.includes('outer') || rawDir.includes('outer');

    const baseCourse = rawCourse.replace(/\s*\((inner|outer)\)\s*/g, '').trim();
    const baseDir = rawDir.replace(/\s*\((inner|outer)\)\s*/g, '').trim();

    const candidates = tracks.filter(t => {
        const trackName = String(t.track_name_en || '').toLowerCase();
        const surfaceName = String(t.surface?.name || '').toLowerCase();
        const turnName = String(t.turn?.name || '').toLowerCase();

        return (
            trackName === baseCourse &&
            Number(t.distance) === targetDist &&
            surfaceName === targetTerrain &&
            (turnName === baseDir || rawDir.startsWith(turnName))
        );
    });

    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    if (wantsInner) {
        const inner = candidates.find(t => t.course_variant?.name?.toLowerCase().includes('inner'));
        if (inner) return inner;
    }
    if (wantsOuter) {
        const outer = candidates.find(t => t.course_variant?.name?.toLowerCase().includes('outer'));
        if (outer) return outer;
    }

    return candidates.sort((a, b) => (b.g1_races?.length || 0) - (a.g1_races?.length || 0))[0];
}

/**
 * Formats Late-Race entry segment & delays from track.geometry
 */
function formatTrackGeometrySection(track) {
    if (!track || !track.geometry) return null;

    const { phases, late_race_entry: entry, slopes = [] } = track.geometry;
    const thresholds = (track.stat_thresholds || []).map(s => type(s.name.toLowerCase())).join(' ') || 'None';
    const variantLabel =
        track.course_variant?.id > 1 ? ` (${track.course_variant.name})` : '';

    let segLabel = 'Unknown';
    if (entry) {
        if (entry.is_final_corner) segLabel = 'Final Corner (0m)';
        else if (entry.is_final_straight) segLabel = 'Final Straight (0m)';
        else if (entry.segment === 'corner') segLabel = 'Corner (before Final Corner)';
        else if (entry.segment === 'straight') segLabel = 'Straight';
    }

    const delayTags = [];
    if (entry?.final_corner_delay_m > 0) {
        delayTags.push(`Final Corner: +${entry.final_corner_delay_m}m`);
    } else if (entry?.final_corner_delay_m < 0 && !entry?.is_final_corner) {
        delayTags.push(`Final Corner: ${entry.final_corner_delay_m}m`);
    }
    if (entry?.final_straight_delay_m > 0) {
        delayTags.push(`Final Straight: +${entry.final_straight_delay_m}m`);
    } else if (entry?.straight_delay_m > 0) {
        delayTags.push(`Next Straight: +${entry.straight_delay_m}m`);
    }
    if (entry?.slope && entry.slope !== 'flat') {
        const capSlope = entry.slope.charAt(0).toUpperCase() + entry.slope.slice(1);
        delayTags.push(`Entry Slope: ${capSlope}`);
    }

    const lines = [
        `**${track.display_name_en || `${track.track_name_en}${variantLabel}`} ${track.turn.name}**`,
        `**Stat Threshold:** ${thresholds}`,
    ];

    if (phases) {
        lines.push(
            `**Phases:** Mid-Race ${phases.mid_race_m}m ➡ Late-Race ${phases.late_race_m}m ➡ Last Spurt ${phases.last_spurt_m}m`
        );
    }

    lines.push(
        `**Late-Race Entry:** **${segLabel}**` +
            (delayTags.length ? `  *(${delayTags.join(' • ')})*` : '')
    );

    return lines.join('\n');
}

function formatCmGreenSkills(cm, skillById) {
    if (!cm) return '';

    const dist = parseInt(cm.length, 10);
    const stdId = dist % 400 === 0
        ? GREEN_SKILL_IDS.distance_standard.standard
        : GREEN_SKILL_IDS.distance_standard.non_standard;

    const targetIds = [
        GREEN_SKILL_IDS.racecourse[cm.racecourse.toLowerCase()],
        stdId,
        GREEN_SKILL_IDS.direction[cm.direction.toLowerCase()],
        GREEN_SKILL_IDS.track_conditions[cm.track_conditions.toLowerCase()],
        GREEN_SKILL_IDS.season[cm.season.toLowerCase()],
        GREEN_SKILL_IDS.weather[cm.weather.toLowerCase()],
    ];

    return targetIds
        .map(id => skillById.get(id))
        .filter(Boolean)
        .map(skill => formatSkillName(skill))
        .join('\n');
}

async function buildCmPayload(cmQuery) {
    const [cmList, { tracks, skillById }] = await Promise.all([fetchCmList(), getGameData()]);

    if (!Array.isArray(cmList) || cmList.length === 0) {
        return {
            components: [new TextDisplayBuilder().setContent('No Champions Meeting data available.')],
            flags: MessageFlags.IsComponentsV2,
        };
    }

    let index = 0;
    if (cmQuery) {
        const q = String(cmQuery).trim().toLowerCase();
        const foundIdx = cmList.findIndex(
            c =>
                String(c.number).toLowerCase() === q ||
                `cm${c.number}`.toLowerCase() === q ||
                String(c.name).toLowerCase().includes(q)
        );
        if (foundIdx !== -1) index = foundIdx;
        else {
            return {
                components: [
                    new TextDisplayBuilder().setContent(
                        `Could not find any Champions Meeting matching **"${cmQuery}"**.`
                    ),
                ],
                flags: MessageFlags.IsComponentsV2,
            };
        }
    }

    const cm = cmList[index];
    const track = matchCmToTrack(cm, tracks);

    const isTurf = String(cm.terrain).toLowerCase() === 'turf';
    const container = new ContainerBuilder().setAccentColor(isTurf ? 0x3BA55D : 0xD97706);

    const dateRange =
        cm.gl_start && cm.gl_end
            ? `${cm.gl_start} – ${cm.gl_end}`
            : cm.gl_start || 'TBA';

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `### Champions Meeting #${cm.number}: ${cm.name}\n` +
            `-# **Scheduled** ${dateRange}`
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

    const prevCm = index > 0 ? cmList[index - 1] : null;
    const nextCm = index < cmList.length - 1 ? cmList[index + 1] : null;

    container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`cm_nav:${prevCm ? prevCm.number : 'none'}`)
                .setLabel(prevCm ? `◀ #${prevCm.number} ${prevCm.name}` : '◀ Previous')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(!prevCm),
            new ButtonBuilder()
                .setCustomId(`cm_nav:curr`)
                .setLabel(`CM #${cm.number} (${index + 1}/${cmList.length})`)
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId(`cm_nav:${nextCm ? nextCm.number : 'none'}`)
                .setLabel(nextCm ? `#${nextCm.number} ${nextCm.name} ▶` : 'Next ▶')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(!nextCm)
        )
    );

    return {
        components: [container],
        flags: MessageFlags.IsComponentsV2,
    };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cm')
        .setDescription('View Champions Meeting details')
        .addStringOption(opt =>
            opt
                .setName('number')
                .setDescription('Search by CM number')
                .setRequired(true)
                .setAutocomplete(false)
        ),

    async execute(interaction) {
        await interaction.deferReply();
        const numberQuery = interaction.options.getString('number');
        const payload = await buildCmPayload(numberQuery);
        await interaction.editReply(payload);
    },

    async handleCmButton(interaction) {
        const [, targetNumber] = interaction.customId.split(':');
        if (!targetNumber || targetNumber === 'none' || targetNumber === 'curr') return;
        const payload = await buildCmPayload(targetNumber);
        await interaction.update(payload);
    },
    matchCmToTrack,
    formatTrackGeometrySection,
    formatCmGreenSkills,
    GREEN_SKILL_IDS
};
