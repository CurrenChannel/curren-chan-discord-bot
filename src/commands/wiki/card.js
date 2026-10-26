const {
    SlashCommandBuilder,
    ContainerBuilder,
    SectionBuilder,
    TextDisplayBuilder,
    ThumbnailBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require('discord.js');
const { getGameData, formatCardDisplayName, formatSkillName } = require('../../utils/gamedata.js');
const { rarity, type } = require('../../utils/emoji.js');

const RARITY_COLORS = {
    SSR: 0xA864FD,
    SR: 0xF5C542,
    R: 0x99AAB5,
};

// Milestone pages per rarity (index 0..5, where index 5 is MLB)
const RARITY_MILESTONES = {
    SSR: [
        { lv: 1, label: 'Lv.1 (Base)' },
        { lv: 30, label: 'Lv.30 (0LB)' },
        { lv: 35, label: 'Lv.35 (1LB)' },
        { lv: 40, label: 'Lv.40 (2LB)' },
        { lv: 45, label: 'Lv.45 (3LB)' },
        { lv: 50, label: 'Lv.50 (MLB)' },
    ],
    SR: [
        { lv: 1, label: 'Lv.1 (Base)' },
        { lv: 25, label: 'Lv.25 (0LB)' },
        { lv: 30, label: 'Lv.30 (1LB)' },
        { lv: 35, label: 'Lv.35 (2LB)' },
        { lv: 40, label: 'Lv.40 (3LB)' },
        { lv: 45, label: 'Lv.45 (MLB)' },
    ],
    R: [
        { lv: 1, label: 'Lv.1 (Base)' },
        { lv: 20, label: 'Lv.20 (0LB)' },
        { lv: 25, label: 'Lv.25 (1LB)' },
        { lv: 30, label: 'Lv.30 (2LB)' },
        { lv: 35, label: 'Lv.35 (3LB)' },
        { lv: 40, label: 'Lv.40 (MLB)' },
    ],
};

// Flat-value effect types (everything else is a percentage %)
const FLAT_EFFECT_TYPES = new Set([
    3, 4, 5, 6, 7,       // Speed, Stamina, Power, Guts, Wit Bonus (+1, +2)
    9, 10, 11, 12, 13,   // Initial Speed, Stamina, Power, Guts, Wit (+20, etc.)
    14,                  // Initial Friendship Gauge
    19,                  // Specialty Priority
    20, 21, 22, 23, 24,  // Max Stat increases
    30,                  // Skill Point Bonus (+1, +2)
    31,                  // Wit Friendship Recovery (+4, +5)
]);

function formatEffectValue(effectType, val) {
    if (val === undefined || val === null || val <= 0) return null;
    if (effectType === 17) return `Lv.+${val}`; // Hint Levels
    if (FLAT_EFFECT_TYPES.has(Number(effectType))) return `+${val}`;
    return `+${val}%`;
}

async function buildCardPayload({ cardIdOrQuery, view = 'effects', pageIndex = null }) {
    const { cards, skillById } = await getGameData();

    let card = cards.find(c => String(c.id) === String(cardIdOrQuery));
    if (!card) {
        const qLower = String(cardIdOrQuery).toLowerCase();
        card =
            cards.find(
                c =>
                    (c.full_name_en && c.full_name_en.toLowerCase() === qLower) ||
                    (c.full_name_jp && c.full_name_jp.toLowerCase() === qLower)
            ) ||
            cards.find(
                c =>
                    (c.full_name_en && c.full_name_en.toLowerCase().includes(qLower)) ||
                    (c.full_name_jp && c.full_name_jp.toLowerCase().includes(qLower)) ||
                    (c.chara_name_en && c.chara_name_en.toLowerCase().includes(qLower))
            );
    }

    if (!card) {
        return {
            components: [new TextDisplayBuilder().setContent(`Could not find any Support Card matching **"${cardIdOrQuery}"**.`)],
            flags: MessageFlags.IsComponentsV2,
        };
    }

    const accentColor = RARITY_COLORS[card.rarity] || 0x5865F2;
    const container = new ContainerBuilder().setAccentColor(accentColor);

    const serverText = card.released_gl ? 'Global' : 'JP Only';
    const subTitleJp = card.full_name_jp ? `\n-# ${card.full_name_jp}` : '';
    const imageUrl = `https://media.gametora.com/umamusume/supports/full/small/${card.id}.png`;

    const hintIds = card.skills?.hints || [];
    const eventIds = card.skills?.events || [];
    const displayName = formatCardDisplayName(card);

    // Header
    const headerSection = new SectionBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `### ${rarity(card.rarity)} ${displayName} ${type(card.type)}${subTitleJp}\n` +
                `-# **Server:** ${serverText}  •  **Skills:** ${hintIds.length} Hint(s), ${eventIds.length} Event(s)`
            )
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(imageUrl));

    container.addSectionComponents(headerSection);
    container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );

    const milestones = RARITY_MILESTONES[card.rarity] || RARITY_MILESTONES.SSR;
    const totalPages = milestones.length;
    const currentPage = pageIndex !== null ? Math.max(0, Math.min(Number(pageIndex), totalPages - 1)) : totalPages - 1;
    const currentMilestone = milestones[currentPage];

    if (view === 'skills') {
        // =====================================================================
        // SKILLS VIEW
        // =====================================================================
        const resolveSkill = id => {
            const s = skillById.get(Number(id));
            return s ? formatSkillName(s) : `Skill #${id}`;
        };

        const skillBlocks = [];
        if (hintIds.length > 0) {
            skillBlocks.push(
                `**Training Hint Skills (${hintIds.length})**\n` +
                    hintIds.map(id => `${resolveSkill(id)}`).join('\n')
            );
        }
        if (eventIds.length > 0) {
            skillBlocks.push(
                `**Event Skills (${eventIds.length})**\n` +
                    eventIds.map(id => `${resolveSkill(id)}`).join('\n')
            );
        }

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                skillBlocks.length > 0 ? skillBlocks.join('\n\n') : '*No skills listed for this card.*'
            )
        );

        // Button to switch back to Effects view
        container.addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        );
        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`card_page:${card.id}:${currentPage}:effects:toggle`)
                    .setLabel(`View Effects (${currentMilestone.label})`)
                    .setStyle(ButtonStyle.Secondary)
            )
        );
    } else {
        // =====================================================================
        // EFFECTS VIEW
        // =====================================================================
        const targetLv = currentMilestone.lv;
        const blocks = [];

        // Unique Effect (if present on card)
        if (card.unique_effect && (card.unique_effect.effects?.length > 0 || card.unique_effect.desc_en)) {
            const uniqLv = card.unique_effect.lv || 30;
            const isUnlocked = targetLv >= uniqLv;
            const statusBadge = isUnlocked ? `*(Active — Lv.${uniqLv})*` : `🔒 *(Unlocks at Lv.${uniqLv})*`;

            const uniqSummary =
                card.unique_effect.desc_en ||
                card.unique_effect.effects
                    .map(u => `${u.name_en} ${formatEffectValue(u.type, u.value) || `+${u.value}`}`)
                    .join('  •  ');

            blocks.push(
                `**Unique Effect** ${statusBadge}\n` +
                (isUnlocked ? `${uniqSummary}` : `-# ~~${uniqSummary}~~`)
            );
        }

        // Standard Support Effects at `targetLv`
        const activeEffects = [];
        const lockedEffects = [];

        for (const eff of card.effects || []) {
            const valAtLv = eff.values?.[targetLv] ?? eff.values?.[String(targetLv)] ?? 0;
            if (valAtLv > 0) {
                const formattedVal = formatEffectValue(eff.type, valAtLv);
                activeEffects.push(`\u2003${eff.name_en}: ${formattedVal}`);
            } else if (eff.unlocked_lv > targetLv) {
                lockedEffects.push(`-# • 🔒 ${eff.name_en} *(Unlocks at Lv.${eff.unlocked_lv})*`);
            }
        }

        const effectsList = [...activeEffects, ...lockedEffects];
        blocks.push(
            `**Support Effects — ${currentMilestone.label}**\n` +
            (effectsList.length > 0 ? effectsList.join('\n') : '*No support effects found.*')
        );

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(blocks.join('\n\n'))
        );

        // Pagination (◀ Prev | Lv.XX (XLB) | Next ▶ | View Skills)
        const prevPage = Math.max(0, currentPage - 1);
        const nextPage = Math.min(totalPages - 1, currentPage + 1);

        container.addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        );
        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`card_page:${card.id}:${prevPage}:effects:prev`)
                    .setLabel('◀ Prev')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage <= 0),
                new ButtonBuilder()
                    .setCustomId(`card_page:${card.id}:noop:effects:indicator`)
                    .setLabel(currentMilestone.label)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId(`card_page:${card.id}:${nextPage}:effects:next`)
                    .setLabel('Next ▶')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage >= totalPages - 1),
                new ButtonBuilder()
                    .setCustomId(`card_page:${card.id}:${currentPage}:skills:toggle`)
                    .setLabel(`Skills (${hintIds.length + eventIds.length})`)
                    .setStyle(ButtonStyle.Primary)
            )
        );
    }

    // 3. Footer
    container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `-# Card ID: ${card.id}  •  Chara ID: ${card.chara_id}`
        )
    );

    return {
        components: [container],
        flags: MessageFlags.IsComponentsV2,
    };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('card')
        .setDescription('Look up an Umamusume Support Card, its support effects by limit break, or its skills')
        .addStringOption(option =>
            option
                .setName('query')
                .setDescription('Support card or character name (EN or JP)')
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addStringOption(option =>
            option
                .setName('view')
                .setDescription('Choose whether to view Support Effects (default) or Skills')
                .setRequired(false)
                .addChoices(
                    { name: 'Support Effects (Default)', value: 'effects' },
                    { name: 'Hint & Event Skills', value: 'skills' }
                )
        ),

    async autocomplete(interaction) {
        const focused = interaction.options.getFocused().toLowerCase().trim();
        const { cards } = await getGameData();

        const matches = cards.filter(c => {
            const fullEn = (c.full_name_en || '').toLowerCase();
            const fullJp = (c.full_name_jp || '').toLowerCase();
            const nameEn = (c.chara_name_en || '').toLowerCase();
            const typeStr = `${c.rarity} ${c.type}`.toLowerCase();
            return (
                !focused ||
                fullEn.includes(focused) ||
                fullJp.includes(focused) ||
                nameEn.includes(focused) ||
                typeStr.includes(focused) ||
                String(c.id) === focused
            );
        });

        matches.sort((a, b) => {
            const aStarts = (a.chara_name_en || '').toLowerCase().startsWith(focused) ? 1 : 0;
            const bStarts = (b.chara_name_en || '').toLowerCase().startsWith(focused) ? 1 : 0;
            if (aStarts !== bStarts) return bStarts - aStarts;
            if (a.released_gl !== b.released_gl) return (b.released_gl ? 1 : 0) - (a.released_gl ? 1 : 0);
            return b.id - a.id;
        });

        await interaction.respond(
            matches.slice(0, 25).map(c => {
                const label = `${formatCardDisplayName(c)} (${c.rarity} ${c.type})`;
                const tag = c.released_gl ? '' : ' [JP]';
                return {
                    name: `${label}${tag}`.slice(0, 100),
                    value: String(c.id),
                };
            })
        );
    },

    async execute(interaction) {
        await interaction.deferReply();
        const query = interaction.options.getString('query').trim();
        const view = interaction.options.getString('view') || 'effects';

        const payload = await buildCardPayload({
            cardIdOrQuery: query,
            view,
            pageIndex: null,
        });
        await interaction.editReply(payload);
    },
};

async function handleCardPageButton(interaction) {
    // customId format: card_page:<cardId>:<pageIndex>:<view>:<action>
    const [, cardId, pageStr, view] = interaction.customId.split(':');
    const payload = await buildCardPayload({
        cardIdOrQuery: cardId,
        view: view || 'effects',
        pageIndex: Number(pageStr),
    });
    await interaction.update(payload);
}

module.exports.handleCardPageButton = handleCardPageButton;
