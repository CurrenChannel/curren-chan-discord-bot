const UMA_LIST_URL = 'https://curren.channel/data/uma/nameList.json';

let cachedNames = null;
let lastFetched = 0;
const CACHE_TTL = 1000 * 60 * 60;

async function getUmaNames() {
    if (cachedNames && Date.now() - lastFetched < CACHE_TTL) {
        return cachedNames;
    }

    const res = await fetch(UMA_LIST_URL);
    if (!res.ok) {
        throw new Error(`Failed to fetch Oshi list (HTTP ${res.status})`);
    }

    const raw = await res.json();

    cachedNames = raw
        .filter(name => typeof name === 'string' && name.trim().length > 0)
        .sort((a, b) => a.localeCompare(b));

    lastFetched = Date.now();
    return cachedNames;
}

async function assignOshiRole(interaction, selectedName) {
    const umaNames = await getUmaNames();
    const oshiSet = new Set(umaNames.map(n => n.toLowerCase()));

    const targetRole = interaction.guild.roles.cache.find(
        role => !role.managed && role.name.toLowerCase() === selectedName.toLowerCase()
    );

    if (!targetRole) {
        return {
            success: false,
            message: `❌ Could not find an assignable role named **${selectedName}**.`,
        };
    }

    const member = interaction.member;

    const currentOshiRoles = member.roles.cache.filter(
        role => !role.managed && oshiSet.has(role.name.toLowerCase()) && role.id !== targetRole.id
    );

    try {
        if (currentOshiRoles.size > 0) {
            await member.roles.remove(currentOshiRoles);
        }

        if (!member.roles.cache.has(targetRole.id)) {
            await member.roles.add(targetRole);
        }

        return {
            success: true,
            message: `🥕 Your Oshi has been set to **${targetRole.name}**!`,
        };
    } catch (error) {
        console.error('Role assignment error:', error);
        return {
            success: false,
            message: '❌ Failed to update your role.',
        };
    }
}

module.exports = { getUmaNames, assignOshiRole };
