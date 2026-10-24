const emojiCache = new Map();

/**
 * ============================================================================
 * CUSTOM BOT EMOJI HELPERS — USAGE SYNTAX
 * ============================================================================
 * 1. Initialize once on startup inside events/ready.js (or index.js):
 *    const { loadBotEmojis } = require('../utils/emojis');
 *    await loadBotEmojis(client);
 *
 * 2. Import the helpers in any command file (uma.js, card.js, cardsearch.js, etc.):
 *    const { e, rarity, rank, type, stars } = require('../../utils/emojis');
 *
 * 3. Helper Syntax & Examples:
 *    • rarity(card.rarity)  -> Checks 'rarity_ssr', 'ssr', or 'r_'[cite: 4] (Falls back to 'SSR' / 'SR' / 'R'[cite: 4])
 *    • rank(surf.turf)      -> Checks 'rank_a', 'a_' (Falls back to '`A`')
 *    • type(card.type)      -> Checks 'type_speed', 'speed' (Falls back to 'Speed')
 *    • stars(uma.rarity)    -> Repeats your 'star' emoji N times (Falls back to '3★')
 *    • e('name', 'fallback')-> General lookup for any custom emoji by name
 * ============================================================================
 */

/**
 * Fetches and caches all Application Emojis uploaded to the bot in the Discord Developer Portal.
 * @param {import('discord.js').Client} client
 */
async function loadBotEmojis(client) {
    try {
        const emojis = await client.application.emojis.fetch();
        emojiCache.clear();

        for (const emoji of emojis.values()) {
            const formatted = emoji.toString(); // "<:name:id>" or "<a:name:id>"
            emojiCache.set(emoji.name, formatted);
            emojiCache.set(emoji.name.toLowerCase(), formatted);
        }

        console.log(`Loaded ${emojis.size} application emojis: ${[...emojis.values()].map(em => em.name).join(', ')}`);
    } catch (err) {
        console.error('Failed to fetch application emojis:', err);
    }
}

/**
 * General lookup for a custom emoji by name.
 * @param {string} name - Emoji name to look up
 * @param {string} [fallback=''] - Fallback string if emoji is not found
 * @returns {string}
 */
function e(name, fallback = '') {
    if (!name) return fallback;
    const key = String(name).trim().toLowerCase();

    return (
        emojiCache.get(key) ||
        emojiCache.get(`${key}_`) ||
        emojiCache.get(`rarity_${key}`) ||
        emojiCache.get(`rank_${key}`) ||
        emojiCache.get(`type_${key}`) ||
        fallback
    );
}

/**
 * Resolves a Support Card rarity emoji ('R', 'SR', 'SSR')
 * @param {string} val - 'R', 'SR', or 'SSR'
 * @returns {string}
 */
function rarity(val) {
    if (!val) return '';
    const key = String(val).trim().toLowerCase();

    return emojiCache.get(`rarity_${key}`);
}

/**
 * Resolves an Aptitude Grade emoji ('S', 'A', 'B', 'C', 'D', 'E', 'F', 'G').
 * @param {string} grade - Aptitude letter grade
 * @returns {string}
 */
function rank(grade) {
    if (!grade || grade === '-') return '`-`';
    const key = String(grade).trim().toLowerCase();

    return emojiCache.get(`rank_${key}`);
}

/**
 * Resolves a Support Card Type emoji ('Speed', 'Stamina', 'Power', 'Guts', 'Wit', 'Friend', 'Group').
 * @param {string} cardType - Card type string
 * @param {boolean} [includeLabel=false] - Whether to append the text label after the icon
 * @returns {string}
 */
function type(cardType, includeLabel = false) {
    if (!cardType) return '';
    const key = String(cardType).trim().toLowerCase();
    const icon = emojiCache.get(`type_${key}`) || emojiCache.get(key);

    if (!icon) return String(cardType);
    return includeLabel ? `${icon} ${cardType}` : icon;
}

/**
 * Resolves a Playable Uma's star rarity (1, 2, or 3 stars).
 * @param {number|string} count - Number of stars (1-3)
 * @returns {string}
 */
function stars(count) {
    const num = Number(count) || 3;
    const starIcon = "⭐";
    return starIcon.repeat(num);
}

/**
 * Resolves a Skill Icon emoji by skill object or icon_id
 * @param {string} iconId - Skill icon id
 * @returns {string}
 */
function skillIcon(iconId) {
    if (!iconId) return '';
    return emojiCache.get(`skill_${iconId}`) || '';
}

module.exports = {
    loadBotEmojis,
    e,
    rarity,
    rank,
    type,
    stars,
    skillIcon,
};
