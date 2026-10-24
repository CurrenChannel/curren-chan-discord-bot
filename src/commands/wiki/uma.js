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
const { getGameData, formatUmaDisplayName, formatSkillName } = require('../../utils/gamedata.js');

const { stars, rank, type } = require("../../utils/emoji.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('uma')
        .setDescription('Look up a Playable Uma, her aptitudes, stat bonuses, and skills')
        .addStringOption(option =>
            option
                .setName('query')
                .setDescription('Character or outfit name (EN or JP)')
                .setRequired(true)
                .setAutocomplete(true)
        ),

    async autocomplete(interaction) {
        const focused = interaction.options.getFocused().toLowerCase().trim();
        const { characters } = await getGameData();

        const matches = characters.filter(u => {
            const fullEn = (u.full_name_en || '').toLowerCase();
            const fullJp = (u.full_name_jp || '').toLowerCase();
            const nameEn = (u.chara_name_en || '').toLowerCase();
            return (
                !focused ||
                fullEn.includes(focused) ||
                fullJp.includes(focused) ||
                nameEn.includes(focused) ||
                String(u.id) === focused
            );
        });

        matches.sort((a, b) => {
            const aStarts = (a.chara_name_en || '').toLowerCase().startsWith(focused) ? 1 : 0;
            const bStarts = (b.chara_name_en || '').toLowerCase().startsWith(focused) ? 1 : 0;
            if (aStarts !== bStarts) return bStarts - aStarts;
            if (a.released_gl !== b.released_gl) return (b.released_gl ? 1 : 0) - (a.released_gl ? 1 : 0);
            return a.id - b.id;
        });

        await interaction.respond(
            matches.slice(0, 25).map(u => {
                const label = formatUmaDisplayName(u);
                const tag = u.released_gl ? '' : ' [JP]';
                return {
                    name: `${label}${tag}`.slice(0, 100),
                    value: String(u.id),
                };
            })
        );
    },

    async execute(interaction) {
        await interaction.deferReply();
        const query = interaction.options.getString('query').trim();
        const { characters, skillById, charaById } = await getGameData();

        let char = characters.find(u => String(u.id) === query);
        if (!char) {
            const qLower = query.toLowerCase();
            char =
                characters.find(
                    u =>
                        (u.full_name_en && u.full_name_en.toLowerCase() === qLower) ||
                        (u.full_name_jp && u.full_name_jp.toLowerCase() === qLower)
                ) ||
                characters.find(
                    u =>
                        (u.full_name_en && u.full_name_en.toLowerCase().includes(qLower)) ||
                        (u.full_name_jp && u.full_name_jp.toLowerCase().includes(qLower)) ||
                        (u.chara_name_en && u.chara_name_en.toLowerCase().includes(qLower))
                );
        }

        if (!char) {
            return interaction.editReply({
                components: [new TextDisplayBuilder().setContent(`Could not find any Playable Uma matching **"${query}"**.`)],
                flags: MessageFlags.IsComponentsV2,
            });
        }

        const charaMeta = charaById?.get(Number(char.chara_id));
        const rawHex = char.color_main || charaMeta?.color_main;
        const accentColor = rawHex ? parseInt(rawHex.replace('#', ''), 16) : 0xF5A9B8;

        const container = new ContainerBuilder().setAccentColor(accentColor);

        const rarityStars = stars(char.rarity || char.default_rarity || 3);
        const serverText = char.released_gl ? 'Global' : 'JP Only';
        const subTitleJp = char.full_name_jp ? `\n-# ${char.full_name_jp}` : '';

        const statLabels = [
            ['speed', type('speed')],
            ['stamina', type('stamina')],
            ['power', type('power')],
            ['guts', type('guts')],
            ['wit', type('wit')],
        ];
        const statBonusParts = [];
        if (char.stat_bonuses) {
            for (const [key, short] of statLabels) {
                const val = Number(char.stat_bonuses[key] || 0);
                if (val > 0) statBonusParts.push(`${short} +${val}%`);
            }
        }
        const bonusLine = statBonusParts.length > 0 ? `**Bonuses:** ${statBonusParts.join(', ')}` : '';

        const apt = char.aptitudes || {};
        const surf = apt.surface || {};
        const dist = apt.distance || {};
        const style = apt.style || {};

        const gap = '\u2003';

        const aptitudesText =
            `Turf\u2004\u2004\u2005\u2009${rank(surf.turf)}${gap}` +
            `Dirt\u2002\u2005\u200A${rank(surf.dirt)}\n` +
            `Sprint\u2009${rank(dist.sprint)}${gap}` +
            `Mile\u2002\u2009${rank(dist.mile)}${gap}` +
            `Med\u2002\u200A${rank(dist.medium)}${gap}` +
            `Long\u2005\u200A${rank(dist.long)}\n` +
            `Front\u2005\u2009\u200A${rank(style.front)}${gap}` +
            `Pace\u2009\u200A\u200A${rank(style.pace)}${gap}` +
            `Late\u2002\u2009${rank(style.late)}${gap}` +
            `End\u2002\u2009\u200A${rank(style.end)}`;

        const charId = char.chara_id;
        const outfitId = char.outfit_id || char.id;
        const imageUrl = `https://gametora.com/images/umamusume/characters/chara_stand_${charId}_${outfitId}.png`;

        const headerSection = new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `### ${rarityStars} ${formatUmaDisplayName(char)}${subTitleJp}\n` +
                    `-# **Server:** ${serverText}\n` +
                    `${bonusLine}`
                ),
            )
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(imageUrl));

        container.addSectionComponents(headerSection);
        container.addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        );
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(aptitudesText));

        const resolveSkill = id => {
            const s = skillById.get(Number(id));
            return s ? formatSkillName(s) : `Skill #${id}`;
        };

        const skillSections = [];

        if (char.skills?.unique) {
            skillSections.push(`**Unique Skill**\n• ${resolveSkill(char.skills.unique)}`);
        }

        const innateIds = char.skills?.innate || [];
        if (innateIds.length > 0) {
            skillSections.push(
                `**Innate Skills**\n` + innateIds.map(id => `• ${resolveSkill(id)}`).join('\n')
            );
        }

        const awakeningList = char.skills?.awakening || [];
        if (awakeningList.length > 0) {
            skillSections.push(
                `**Awakening Skills**\n` +
                    awakeningList.map(a => `• **Lv.${a.awakening_lv}:** ${resolveSkill(a.skill_id)}`).join('\n')
            );
        }

        const evolvedList = char.skills?.evolved || [];
        if (evolvedList.length > 0) {
            skillSections.push(
                `**Evolved Skills**\n` +
                    evolvedList
                        .map(e => `• ${resolveSkill(e.evolved_skill_id)} *(from ${resolveSkill(e.base_skill_id)})*`)
                        .join('\n')
            );
        }

        if (skillSections.length > 0) {
            container.addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            );
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(skillSections.join('\n\n'))
            );
        }

        container.addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        );
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# Outfit ID: ${outfitId}  •  Chara ID: ${charId}`)
        );

        await interaction.editReply({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        });
    },
};
