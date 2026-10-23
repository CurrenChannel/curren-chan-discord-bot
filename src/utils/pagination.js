const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

/**
 * Builds a stateless pagination ActionRow where each button's customId encodes the target page & filters.
 * @param {string} prefix - 'us_page' or 'cs_page'
 * @param {number} page - Current 0-indexed page
 * @param {number} totalPages - Total number of pages
 * @param {Array<string|number>} stateArgs - Array of filter values to preserve across pages
 */
function buildPaginationRow(prefix, page, totalPages, stateArgs) {
    if (totalPages <= 1) return null;

    const encodedState = stateArgs.map(v => (v === null || v === undefined ? '' : String(v))).join(':');
    const prevPage = Math.max(0, page - 1);
    const nextPage = Math.min(totalPages - 1, page + 1);

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${prefix}:${prevPage}:${encodedState}:prev`)
            .setLabel('◀ Prev')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page <= 0),
        new ButtonBuilder()
            .setCustomId(`${prefix}:noop:${encodedState}:indicator`)
            .setLabel(`Page ${page + 1} / ${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`${prefix}:${nextPage}:${encodedState}:next`)
            .setLabel('Next ▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages - 1)
    );
}

module.exports = { buildPaginationRow };
