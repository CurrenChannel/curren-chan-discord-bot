// commands/utility/card.js
const {
    SlashCommandBuilder,
    ContainerBuilder,
    SectionBuilder,
    TextDisplayBuilder,
    ThumbnailBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlags,
} = require('discord.js');
const { getGameData, formatCardDisplayName, formatSkillName } = require('../../utils/gamedata.js');

const { rarity, type } = require("../../utils/emoji.js");

const RARITY_COLORS = {
    SSR: 0xA864FD,
    SR: 0xF5C542,
    R: 0x99AAB5,
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('card')
        .setDescription('Look up an Umamusume Support Card and its hint and event skills')
        .addStringOption(option =>
            option
                .setName('query')
                .setDescription('Support card or character name (EN or JP)')
                .setRequired(true)
                .setAutocomplete(true)
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
        const { cards, skillById } = await getGameData();

        let card = cards.find(c => String(c.id) === query);
        if (!card) {
            const qLower = query.toLowerCase();
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
            return interaction.editReply({
                components: [new TextDisplayBuilder().setContent(`Could not find any Support Card matching **"${query}"**.`)],
                flags: MessageFlags.IsComponentsV2,
            });
        }

        const accentColor = RARITY_COLORS[card.rarity] || 0x5865F2;
        const container = new ContainerBuilder().setAccentColor(accentColor);

        const serverText = card.released_gl ? 'Global' : 'JP Only';
        const subTitleJp = card.full_name_jp ? `\n-# ${card.full_name_jp}` : '';
        const imageUrl = `https://media.gametora.com/umamusume/supports/full/small/${card.id}.png`;

        const resolveSkill = id => {
            const s = skillById.get(Number(id));
            return s ? formatSkillName(s) : `Skill #${id}`;
        };

        const hintIds = card.skills?.hints || [];
        const eventIds = card.skills?.events || [];

        const headerSection = new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `### ${formatCardDisplayName(card)}${type(card.type)}${rarity(card.rarity)}${subTitleJp}\n` +
                    `-# **Server:** ${serverText}\n` +
                    `-# **Skills:** ${hintIds.length} Hint(s), ${eventIds.length} Event(s)`
                )
            )
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(imageUrl));

        container.addSectionComponents(headerSection);

        const skillBlocks = [];

        if (hintIds.length > 0) {
            skillBlocks.push(
                `**Training Hint Skills (${hintIds.length})**\n` +
                    hintIds.map(id => `• ${resolveSkill(id)}`).join('\n')
            );
        }

        if (eventIds.length > 0) {
            skillBlocks.push(
                `**Event Skills (${eventIds.length})**\n` +
                    eventIds.map(id => `• ${resolveSkill(id)}`).join('\n')
            );
        }

        container.addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        );

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                skillBlocks.length > 0 ? skillBlocks.join('\n\n') : '*No skills listed for this card.*'
            )
        );

        container.addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        );
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# Card ID: ${card.id}  •  Chara ID: ${card.chara_id}`)
        );

        await interaction.editReply({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        });
    },
};
