const STYLE_ID = { front: 1, pace: 2, late: 3, end: 4 };

function compare(lhs, op, rhs) {
    switch (op) {
        case '==': return lhs === rhs;
        case '!=': return lhs !== rhs;
        case '<=': return lhs <= rhs;
        case '>=': return lhs >= rhs;
        case '<':  return lhs < rhs;
        case '>':  return lhs > rhs;
        default:   return true;
    }
}

function getValidRanksForBranch(branch) {
    const orderMatches = [...branch.matchAll(/\border(==|!=|<=|>=|<|>)(\d+)/g)];
    const rateMatches = [...branch.matchAll(/\border_rate(==|!=|<=|>=|<|>)(\d+)/g)];
    // Catch `order_rate_in60_continue==0` (must NOT have been in top 60% -> rate > 60, i.e., 6th-9th)
    // and `order_rate_in50_continue==1` (must have stayed in top 50% -> rate <= 50)
    const inContMatches = [...branch.matchAll(/\border_rate_in(\d+)_continue==(0|1)/g)];
    // Catch `order_rate_out50_continue==1` (stayed outside top 50% -> rate > 50)
    const outContMatches = [...branch.matchAll(/\border_rate_out(\d+)_continue==(0|1)/g)];

    if (
        orderMatches.length === 0 &&
        rateMatches.length === 0 &&
        inContMatches.length === 0 &&
        outContMatches.length === 0
    ) {
        return [1, 2, 3, 4, 5, 6, 7, 8, 9];
    }

    const validRanks = [];
    for (let rank = 1; rank <= 9; rank++) {
        const rate = Math.round((rank / 9) * 100);
        let ok = true;

        for (const [, op, valStr] of orderMatches) {
            if (!compare(rank, op, Number(valStr))) { ok = false; break; }
        }
        if (!ok) continue;

        for (const [, op, valStr] of rateMatches) {
            if (!compare(rate, op, Number(valStr))) { ok = false; break; }
        }
        if (!ok) continue;

        for (const [, pctStr, flagStr] of inContMatches) {
            const pct = Number(pctStr);
            const mustBeIn = flagStr === '1';
            if (mustBeIn ? !(rate <= pct) : !(rate > pct)) { ok = false; break; }
        }
        if (!ok) continue;

        for (const [, pctStr, flagStr] of outContMatches) {
            const pct = Number(pctStr);
            const mustBeOut = flagStr === '1';
            if (mustBeOut ? !(rate > pct) : !(rate <= pct)) { ok = false; break; }
        }

        if (ok) validRanks.push(rank);
    }

    return validRanks;
}

function formatRankRange(ranks) {
    if (!ranks || ranks.length === 0 || ranks.length === 9) return null;
    const ord = n => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);
    const min = ranks[0];
    const max = ranks[ranks.length - 1];
    if (min === max) return `${ord(min)}`;
    return `${ord(min)}-${ord(max)}`;
}

function checkOrderCompatibility(cond, styleKey, isInherited = false) {
    const branches = String(cond).split('@');

    const allValidRanks = new Set();
    let hasExplicitStyleLock = false;

    for (const branch of branches) {
        const styleMatch = branch.match(/running_style==(\d)/);
        if (styleMatch) {
            if (Number(styleMatch[1]) !== STYLE_ID[styleKey]) continue;
            hasExplicitStyleLock = true;
        }
        for (const r of getValidRanksForBranch(branch)) {
            allValidRanks.add(r);
        }
    }

    const validList = [...allValidRanks].sort((a, b) => a - b);
    if (validList.length === 0) return { ok: false, isPushUp: false, rankLabel: null };

    if (validList.length === 9) {
        return { ok: true, isPushUp: false, rankLabel: null };
    }

    const minRank = validList[0];
    const maxRank = validList[validList.length - 1];
    const rankLabel = formatRankRange(validList);

    if (hasExplicitStyleLock) {
        return { ok: true, isPushUp: false, rankLabel, minRank, maxRank };
    }

    switch (styleKey) {
        case 'front': {
            // Front Runners MUST include 1st place (minRank === 1)
            if (minRank === 1 && maxRank <= 5) {
                return { ok: true, isPushUp: false, rankLabel, minRank, maxRank };
            }
            return { ok: false, isPushUp: false, rankLabel };
        }

        case 'pace': {
            // Pace Chasers must cover 2nd or 3rd place (minRank <= 3 && maxRank >= 2 && maxRank <= 5)
            if (minRank <= 3 && maxRank >= 2 && maxRank <= 5) {
                return { ok: true, isPushUp: false, rankLabel, minRank, maxRank };
            }
            return { ok: false, isPushUp: false, rankLabel };
        }

        case 'late': {
            if (minRank >= 4 && minRank <= 6 && maxRank >= 5) {
                return { ok: true, isPushUp: false, rankLabel, minRank, maxRank };
            }
            if (isInherited && minRank <= 3 && maxRank >= 4 && maxRank <= 5) {
                return { ok: true, isPushUp: true, rankLabel, minRank, maxRank };
            }
            return { ok: false, isPushUp: false, rankLabel };
        }

        case 'end': {
            if (minRank >= 4 && maxRank >= 6) {
                return { ok: true, isPushUp: false, rankLabel, minRank, maxRank };
            }
            if (isInherited && minRank <= 3 && maxRank >= 4 && maxRank <= 5) {
                return { ok: true, isPushUp: true, rankLabel, minRank, maxRank };
            }
            return { ok: false, isPushUp: false, rankLabel };
        }

        default:
            return { ok: true, isPushUp: false, rankLabel, minRank, maxRank };
    }
}

function evaluateSkillForTrack(skill, track, styleKey) {
    const sid = Number(skill.id);
    const styleNum = STYLE_ID[styleKey];
    const entry = track.geometry?.late_race_entry;
    if (!entry || entry.segment === 'unknown') return null;

    const isInherited = sid >= 900000 && sid < 1000000;

    // Strictly block non-inherited Unique skills (1★-2★ base uniques 10xxx, 3★ uniques 100xxx, and Evolved 10xxxxx)
    if (!isInherited) {
        if (sid < 200000 || sid >= 1000000 || skill.rarity >= 3) {
            return null;
        }
    }

    for (const effect of skill.effects || []) {
        const accelAb = (effect.abilities || []).find(a => a.type === 31 && a.value > 0);
        if (!accelAb) continue;

        const cond = effect.condition || '';

        const trackMatch = cond.match(/track_id==(\d+)/);
        if (trackMatch && Number(trackMatch[1]) !== track.race_track_id) continue;

        const groundMatch = cond.match(/ground_type==(\d)/);
        if (groundMatch && Number(groundMatch[1]) !== track.surface.id) continue;

        const distMatch = cond.match(/distance_type==(\d)/);
        if (distMatch && Number(distMatch[1]) !== track.distance_type.id) continue;

        const rotMatch = cond.match(/rotation==(\d)/);
        if (rotMatch && Number(rotMatch[1]) !== track.turn.id) continue;

        const styleMatch = cond.match(/running_style==(\d)/);
        if (styleMatch && Number(styleMatch[1]) !== styleNum) continue;

        const orderCheck = checkOrderCompatibility(cond, styleKey, isInherited);
        if (!orderCheck.ok) continue;

        const posBadge = orderCheck.rankLabel
            ? orderCheck.isPushUp
                ? ` • ${orderCheck.rankLabel} (Push Up)`
                : ` • ${orderCheck.rankLabel}`
            : '';

        if (cond.includes('phase==1')) continue;

        // Helper: Maximum viable delay (in meters) for an Inherited / Core accel by style & rank tightness
        // - Fronts accelerate fastest and rely on 0m triggers (max 15m delay).
        // - Paces only accept >15m delayed inherits if they are dedicated Pace-pocket skills (minRank >= 2),
        //   filtering out broad 1st-5th delayed skills (like Red Shift at +25m on Tokyo 2400m) for Front & Pace!
        // - Late/End have the largest speed delta and narrow 6th-only 0m triggers, so +25m-60m coverage is vital.
        const getMaxViableDelay = () => {
            if (styleKey === 'front') return 15;
            if (styleKey === 'pace') {
                // Allow up to 45m delay ONLY for dedicated Pace-pocket skills (minRank >= 2, e.g. 2nd-4th / 3rd-4th)
                return orderCheck.minRank >= 2 ? 45 : 15;
            }
            return 60; // late & end
        };
        const maxDelay = getMaxViableDelay();

        // A. Final Corner Triggers (is_finalcorner==1)
        if (cond.includes('is_finalcorner==1') && !cond.includes('corner==0')) {
            if (cond.includes('is_finalcorner_random==1')) {
                if (entry.final_corner_delay_m !== null && entry.final_corner_delay_m >= -50 && entry.final_corner_delay_m <= 80) {
                    return {
                        category: 'backup',
                        delayM: Math.max(0, entry.final_corner_delay_m),
                        isPushUp: orderCheck.isPushUp,
                        tag: 'Final Corner Random' + posBadge,
                        value: accelAb.value,
                    };
                }
                continue;
            }

            const d = entry.final_corner_delay_m;
            const hasPhase2Lock = cond.includes('phase>=2') || cond.includes('phase==2');

            // Case A1: Final Corner starts inside Late-Race (d >= 0)
            if (d !== null && d >= 0 && d <= maxDelay) {
                const tag = (d === 0 ? '0m Instant (Final Corner)' : `${d}m Delay (Final Corner)`) + posBadge;
                return {
                    category: isInherited ? 'inherited' : 'core',
                    delayM: d,
                    isPushUp: orderCheck.isPushUp,
                    tag,
                    value: accelAb.value,
                };
            }

            // Case A2: Final Corner started in Mid-Race (d < 0, e.g. Nakayama 2000m / Kyoto 2200m),
            // AND skill has NO `phase>=2` check (e.g. Red Shift):
            // Front/Pace are already in 1st-5th in Mid-Race (wasted!), whereas Late/End sit in 6th-9th
            // and trigger it right as they overtake into 4th-5th in Late-Race!
            if (
                d !== null &&
                d < 0 &&
                d >= -150 &&
                !hasPhase2Lock &&
                (styleKey === 'late' || styleKey === 'end') &&
                orderCheck.isPushUp
            ) {
                return {
                    category: isInherited ? 'inherited' : 'core',
                    delayM: 10,
                    isPushUp: true,
                    tag: `Late-Race Overtake (Final Corner)${posBadge}`,
                    value: accelAb.value,
                };
            }
            continue;
        }

        // Front Runners in 1st place cannot trigger Late-Race overtake conditions
        if (styleKey === 'front' && /change_order_onetime<0|change_order_up/.test(cond)) {
            continue;
        }

        // ... (keep Section A as is) ...

        // B. Late-Race Corner Triggers (phase>=2 & corner!=0)
        if ((cond.includes('phase>=2') || cond.includes('phase==2')) && cond.includes('corner!=0')) {
            const d = entry.corner_delay_m;
            if (d !== null && d >= 0 && d <= maxDelay) {
                const tag = (d === 0 ? '0m Instant (Corner)' : `${d}m Delay (Corner)`) + posBadge;
                return {
                    category: isInherited ? 'inherited' : 'core',
                    delayM: d,
                    isPushUp: orderCheck.isPushUp,
                    tag,
                    value: accelAb.value,
                };
            }
            continue;
        }

        // C. Late-Race Straight / Final Straight Triggers
        if (
            ((cond.includes('phase>=2') || cond.includes('phase==2')) && cond.includes('corner==0')) ||
            (cond.includes('is_finalcorner==1') && cond.includes('corner==0')) ||
            cond.includes('is_last_straight==1')
        ) {
            const d = cond.includes('is_last_straight==1') ? entry.final_straight_delay_m : entry.straight_delay_m;
            if (d !== null && d >= 0 && d <= maxDelay) {
                const tag = (d === 0 ? '0m Instant (Straight)' : `${d}m Delay (Straight)`) + posBadge;
                return {
                    category: isInherited ? 'inherited' : 'core',
                    delayM: d,
                    isPushUp: orderCheck.isPushUp,
                    tag,
                    value: accelAb.value,
                };
            }
            continue;
        }

        // D. Uphill / Downhill Triggers
        if (cond.includes('slope==1') && entry.uphill_delay_m !== null && entry.uphill_delay_m <= 50) {
            return {
                category: 'backup',
                delayM: entry.uphill_delay_m,
                isPushUp: orderCheck.isPushUp,
                tag: (entry.uphill_delay_m === 0 ? '0m Uphill' : `${entry.uphill_delay_m}m Uphill`) + posBadge,
                value: accelAb.value,
            };
        }
        if (cond.includes('slope==2') && entry.downhill_delay_m !== null && entry.downhill_delay_m <= 50) {
            return {
                category: 'backup',
                delayM: entry.downhill_delay_m,
                isPushUp: orderCheck.isPushUp,
                tag: (entry.downhill_delay_m === 0 ? '0m Downhill' : `${entry.downhill_delay_m}m Downhill`) + posBadge,
                value: accelAb.value,
            };
        }

        // E. Reliable Early Late-Race / Blocked Last Spurt Triggers
        if (
            cond.includes('phase_firsthalf_random==2') ||
            (cond.includes('is_lastspurt==1') && cond.includes('infront_near_lane_time>=1'))
        ) {
            if (styleKey === 'front' && cond.includes('infront_near_lane_time')) continue;
            return {
                category: 'backup',
                delayM: 20,
                isPushUp: orderCheck.isPushUp,
                tag: (cond.includes('phase_firsthalf_random==2') ? 'Early Late-Race Random' : 'Last Spurt (Blocked)') + posBadge,
                value: accelAb.value,
            };
        }
    }

    return null;
}

function getRecommendedAccels({ skills, track, styleKey, server = 'gl' }) {
    const buckets = {
        inherited: [],
        core: [],
        backup: [],
        early: [],
    };

    const results = [];
    for (const skill of skills) {
        if (server === 'gl' && !skill.released_gl) continue;
        if (skill.id >= 300000 && skill.id < 400000) continue;

        const match = evaluateSkillForTrack(skill, track, styleKey);
        if (match) {
            results.push({ skill, ...match });
        }
    }

    results.sort((a, b) => {
        if (a.delayM !== b.delayM) return a.delayM - b.delayM;
        if (Boolean(a.isPushUp) !== Boolean(b.isPushUp)) return (a.isPushUp ? 1 : 0) - (b.isPushUp ? 1 : 0);
        if (b.skill.rarity !== a.skill.rarity) return b.skill.rarity - a.skill.rarity;
        return b.value - a.value;
    });

    const seenIds = new Set();
    for (const item of results) {
        if (seenIds.has(item.skill.id)) continue;
        seenIds.add(item.skill.id);

        for (const vId of item.skill.versions || []) {
            seenIds.add(Number(vId));
        }

        buckets[item.category].push(item);
    }

    return buckets;
}

module.exports = { getRecommendedAccels };
