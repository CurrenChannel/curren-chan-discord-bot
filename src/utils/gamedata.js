const UMA_BASE_URL = 'https://curren.channel/data/uma/uma.json';
const CHARACTERS_URL = 'https://curren.channel/data/gamedata/characters.json';
const CARDS_URL = 'https://curren.channel/data/gamedata/cards.json';
const SKILLS_URL = 'https://curren.channel/data/gamedata/skills.json';

let cache = null;
let lastFetched = 0;
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

const RARITY_LABELS = {
    1: '⚪ Normal',
    2: '🟡 Rare (Gold)',
    3: '🌈 Unique (1★–2★)',
    4: '🌈 Unique (3★+)',
    5: '🌈 Unique (Inherit)',
    6: '🌸 Evolved',
};

const ABILITY_LABELS = {
    1: { name: 'Speed Stat', unit: '' },
    2: { name: 'Stamina Stat', unit: '' },
    3: { name: 'Power Stat', unit: '' },
    4: { name: 'Guts Stat', unit: '' },
    5: { name: 'Wit Stat', unit: '' },
    8: { name: 'Field of View', unit: 'm' },
    9: { name: 'Stamina Recovery', unit: '%', multiplier: 100 },
    10: { name: 'Start Delay Multiplier', unit: 'x' },
    13: { name: 'Rushed Time Reduction', unit: 's' },
    21: { name: 'Current Speed', unit: ' m/s' },
    22: { name: 'Instant Velocity', unit: ' m/s' },
    27: { name: 'Target Speed', unit: ' m/s' },
    28: { name: 'Lane Movement Speed', unit: ' m/s' },
    31: { name: 'Acceleration', unit: ' m/s²' },
};

async function getGameData() {
    if (cache && Date.now() - lastFetched < CACHE_TTL) {
        return cache;
    }

    const [umaRes, charaRes, cardsRes, skillsRes] = await Promise.all([
        fetch(UMA_BASE_URL),
        fetch(CHARACTERS_URL),
        fetch(CARDS_URL),
        fetch(SKILLS_URL),
    ]);

    if (!umaRes.ok || !charaRes.ok || !cardsRes.ok || !skillsRes.ok) {
        throw new Error('Failed to fetch one or more game data files from curren.channel');
    }

    const [baseUmas, characters, cards, skills] = await Promise.all([
        umaRes.json(),
        charaRes.json(),
        cardsRes.json(),
        skillsRes.json(),
    ]);

    const baseUmaById = new Map();
    for (const u of baseUmas) {
        baseUmaById.set(Number(u.id), u);
    }

    const skillById = new Map();
    for (const s of skills) {
        skillById.set(Number(s.id), s);
    }

    const skillToUmas = new Map();
    const skillToCards = new Map();

    const addSkillUmaLink = (skillId, label) => {
        if (!skillToUmas.has(skillId)) skillToUmas.set(skillId, []);
        skillToUmas.get(skillId).push(label);
    };

    for (const c of characters) {
        const displayName = formatUmaDisplayName(c);
        const flag = c.released_gl ? '🌐' : '🇯🇵';

        for (const sid of c.skills?.unique_upgraded || []) {
            addSkillUmaLink(sid, `${flag} **${displayName}** *(3★ Unique)*`);
        }
        for (const sid of c.skills?.unique_base || []) {
            addSkillUmaLink(sid, `${flag} **${displayName}** *(1★–2★ Unique)*`);
        }
        for (const sid of c.skills?.innate || []) {
            addSkillUmaLink(sid, `${flag} **${displayName}** *(Innate)*`);
        }
        for (const awk of c.skills?.awakening || []) {
            addSkillUmaLink(awk.skill_id, `${flag} **${displayName}** *(Lv.${awk.awakening_lv})*`);
        }
    }

    for (const card of cards) {
        const displayName = formatCardDisplayName(card);
        const flag = card.released_gl ? '🌐' : '🇯🇵';

        for (const sid of card.skills?.hints || []) {
            if (!skillToCards.has(sid)) skillToCards.set(sid, []);
            skillToCards.get(sid).push(`${flag} **${displayName}** *(${card.rarity} ${card.type} - Hint)*`);
        }
        for (const sid of card.skills?.events || []) {
            if (!skillToCards.has(sid)) skillToCards.set(sid, []);
            skillToCards.get(sid).push(`${flag} **${displayName}** *(${card.rarity} ${card.type} - Event)*`);
        }
    }

    cache = {
        baseUmas,
        characters,
        cards,
        skills,
        baseUmaById,
        skillById,
        skillToUmas,
        skillToCards,
    };
    lastFetched = Date.now();
    return cache;
}

function formatUmaDisplayName(chara) {
    const name = chara.chara_name_en || chara.chara_name_jp || `Chara #${chara.chara_id}`;
    const title = chara.title_en || chara.title_jp || '';
    return title ? `${title} ${name}` : name;
}

function formatCardDisplayName(card) {
    const name = card.chara_name_en || card.chara_name_jp || `Card #${card.id}`;
    const title = card.title_en || card.title_jp || '';
    return title ? `${title} ${name}` : name;
}

function formatSkillName(skill) {
    if (!skill) return 'Unknown Skill';
    if (skill.name_en && skill.name_jp && skill.name_en !== skill.name_jp) {
        return `${skill.name_en} (${skill.name_jp})`;
    }
    return skill.name_en || skill.name_jp || `Skill #${skill.id}`;
}

function formatAbility(ability) {
    const meta = ABILITY_LABELS[ability.type];
    if (!meta)
        return `Type ${ability.type}:${ability.value}`;

    let val = ability.value;

    if (meta.multiplier) {
        val = Number((val * meta.multiplier).toFixed(2));
    }

    const sign = val > 0 && meta.unit !== 'x' ? '+' : '';

    return `${meta.name}: **${sign}${val}${meta.unit}**`;
}

module.exports = {
    getGameData,
    RARITY_LABELS,
    formatUmaDisplayName,
    formatCardDisplayName,
    formatSkillName,
    formatAbility,
};
