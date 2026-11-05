const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    PermissionFlagsBits,
    MessageFlags,
} = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { addPlayerScore, getLeaderboard } = require('../../utils/shiritoriDb');
const { e } = require('../../utils/emoji');

// Active games stored in memory
// Key: channelId -> GameState object
const activeGames = new Map();

// Cached dictionary Sets: mode -> { normalizedSet: Set<string>, list: string[] }
const dictionaryCache = new Map();

const MODE_LABELS = {
    en: 'English Shiritori',
    jp: 'Japanese Shiritori',
    uma: 'Umamusume Shiritori',
};

// Map small kana to full-size kana for determining the next starting character
const SMALL_TO_LARGE_KANA = {
    'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お',
    'っ': 'つ', 'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'ゎ': 'わ',
    'ヵ': 'か', 'ヶ': 'け',
};

/**
 * Converts Katakana (ァ..ヶ) to Hiragana (ぁ..ゖ)
 */
function katakanaToHiragana(str) {
    return str.replace(/[\u30a1-\u30f6]/g, ch =>
        String.fromCharCode(ch.charCodeAt(0) - 0x60)
    );
}

/**
 * Normalizes a word based on the game mode:
 * - 'jp': Converts Katakana to Hiragana, strips whitespace. Must be strictly Kana + 'ー'.
 * - 'en' / 'uma': Converts accented characters é -> e, lowercases, strips non-alphanumeric for matching.
 */
function normalizeWord(raw, mode) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return null;

    if (mode === 'jp') {
        const hira = katakanaToHiragana(trimmed);
        // Must contain only Hiragana and optional long-vowel mark (ー)
        if (!/^[\u3041-\u3096ー]+$/.test(hira)) return null;
        return hira;
    }

    // EN & UMA: Normalize accents (é -> e), lowercase, collapse spaces
    const deaccented = trimmed
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

    // Must contain only letters (and spaces/hyphens/apostrophes for Uma names)
    if (mode === 'en' && !/^[a-z]+$/.test(deaccented)) return null;
    if (mode === 'uma' && !/^[a-z0-9\s\-'.☆♡]+$/.test(deaccented)) return null;

    // Strip spaces/punctuation so dictionary lookup is consistent
    const clean = deaccented.replace(/[^a-z0-9]/g, '');
    return clean || null;
}

/**
 * Extracts the first and last valid character of a normalized word.
 */
function getWordEnds(normWord, mode) {
    if (mode === 'jp') {
        const first = normWord[0];
        // Strip trailing long vowel mark 'ー' to find the real ending kana
        const stripped = normWord.replace(/ー+$/, '');
        if (!stripped) return null;
        const rawLast = stripped[stripped.length - 1];
        const nextRequired = SMALL_TO_LARGE_KANA[rawLast] || rawLast;
        return { first, rawLast, nextRequired };
    }

    const first = normWord[0];
    const last = normWord[normWord.length - 1];
    return { first, rawLast: last, nextRequired: last };
}

// Matches CJK Unified Ideographs + iteration mark 々
const KANJI_REGEX = /[\u4e00-\u9faf\u3400-\u4dbf々]/;

function hasKanji(str) {
    return Boolean(str) && KANJI_REGEX.test(str);
}

/**
 * Formats the display string for a matched dictionary entry.
 * Safely handles both entry objects ({ word, rawReading }) and plain strings.
 */
function formatEntryDisplay(entry, typedInput, mode) {
    if (!entry) return typedInput || 'Unknown';
    if (typeof entry === 'string') return entry;

    // Fallback to rawReading or typedInput if `entry.word` is empty/missing
    const baseWord = String(entry.word || entry.rawReading || typedInput || '').trim();
    const reading = String(typedInput || entry.rawReading || baseWord).trim();

    if (mode !== 'jp') return baseWord;

    if (hasKanji(baseWord) && reading && baseWord !== reading) {
        return `${baseWord} (${reading})`;
    }
    return baseWord || reading;
}

function loadDictionary(mode) {
    if (dictionaryCache.has(mode)) return dictionaryCache.get(mode);

    const filePath = path.join(__dirname, `../../data/dictionary_${mode}.json`);
    if (!fs.existsSync(filePath)) {
        throw new Error(`Missing dictionary file: data/dictionary_${mode}.json`);
    }

    const rawList = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    // normReading -> Array of { id, word, rawReading }
    const normalizedMap = new Map();

    rawList.forEach((item, idx) => {
        if (mode === 'jp' && item && typeof item === 'object') {
            const readings = Array.isArray(item.readings)
                ? item.readings
                : item.reading
                ? [item.reading]
                : item.word
                ? [item.word]
                : [];

            // Fallback to the first reading if `item.word` is empty or omitted
            const word = String(item.word || readings[0] || '').trim();

            for (const r of readings) {
                const norm = normalizeWord(r, 'jp');
                if (!norm) continue;

                if (!normalizedMap.has(norm)) {
                    normalizedMap.set(norm, []);
                }
                normalizedMap.get(norm).push({
                    id: `jp_${idx}`,
                    word: word || r,
                    rawReading: r,
                });
            }
            return;
        }

        // EN / UMA (or plain string fallback)
        const wordStr = String(
            typeof item === 'string' ? item : item?.word || item?.name || ''
        ).trim();
        const norm = normalizeWord(wordStr, mode);
        if (!norm) return;

        if (!normalizedMap.has(norm)) {
            normalizedMap.set(norm, [
                {
                    id: `${mode}_${idx}`,
                    word: wordStr,
                    rawReading: wordStr,
                },
            ]);
        }
    });

    const dict = { normalizedMap };
    dictionaryCache.set(mode, dict);
    return dict;
}

function buildStateCard({ title, color = 0x5865F2, lines }) {
    const container = new ContainerBuilder().setAccentColor(color);
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`### ${title}\n${lines.join('\n')}`)
    );
    return {
        components: [container],
        flags: MessageFlags.IsComponentsV2,
    };
}

function buildGameEndCard(game, isCompleted = false) {
    const title = isCompleted
        ? `🎉 Shiritori Complete! (${game.chainCount}/${game.maxWords} Words)`
        : `🛑 Shiritori Stopped! (${game.chainCount}/${game.maxWords} Words)`;

    const color = isCompleted ? 0xF59E0B : 0xED4245;

    const lines = [
        `• **Mode:** ${MODE_LABELS[game.mode]}`,
        `• **Final Word:** **${game.currentWord}**`,
        `• **Words Played:** **${game.chainCount}** / **${game.maxWords}**`,
    ];

    const sortedPlayers = [...game.sessionScores.entries()].sort(
        (a, b) => b[1].points - a[1].points
    );

    if (sortedPlayers.length > 0) {
        const medals = [
            e("1st"),
            e("2nd"),
            e("3rd"),
            e("4th"),
            e("5th"),
            e("6th"),
            e("7th"),
            e("8th"),
            e("9th"),
            e("10th"),
            e("11th"),
            e("12th"),
            e("13th"),
            e("14th"),
            e("15th"),
            e("16th"),
            e("17th"),
            e("18th"),
        ];
        const standings = sortedPlayers
            .slice(0, 10)
            .map(([uid, stats], idx) => {
                const prefix = medals[idx] || `**${idx + 1}.**`;
                return `${prefix} <@${uid}> — **+${stats.points} pts** *(${stats.words} word${stats.words === 1 ? '' : 's'})*`;
            })
            .join('\n');

        lines.push(`\n**🏅 Session Points Summary**\n${standings}`);
    } else {
        lines.push(`\n*No valid words were played this session.*`);
    }

    return buildStateCard({ title, color, lines });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shiritori')
        .setDescription('Play Shiritori word chain in chat!')
        .addSubcommand(sub =>
            sub
                .setName('info')
                .setDescription('View info for Shiritori game')
        )
        .addSubcommand(sub =>
            sub
                .setName('start')
                .setDescription('Start a new Shiritori game in this channel')
                .addStringOption(opt =>
                    opt
                        .setName('mode')
                        .setDescription('Dictionary mode to play')
                        .setRequired(true)
                        .addChoices(
                            { name: 'English', value: 'en' },
                            { name: 'Japanese', value: 'jp' },
                            { name: 'Umamusume', value: 'uma' }
                        )
                )
                .addIntegerOption(opt =>
                    opt
                        .setName('length')
                        .setDescription('Number of words before the game concludes (Default: 100)')
                        .setRequired(false)
                        .setMinValue(5)
                        .setMaxValue(1000)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName('stop')
                .setDescription('Stop the active Shiritori game in this channel')
        )
        .addSubcommand(sub =>
            sub
                .setName('leaderboard')
                .setDescription('View the Shiritori points leaderboard for this server')
                .addStringOption(opt =>
                    opt
                        .setName('mode')
                        .setDescription('Filter by mode (defaults to All Modes)')
                        .setRequired(false)
                        .addChoices(
                            { name: 'All Modes Combined', value: 'all' },
                            { name: 'English', value: 'en' },
                            { name: 'Japanese', value: 'jp' },
                            { name: 'Umamusume', value: 'uma' }
                        )
                )
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const channelId = interaction.channelId;

        // Restrict control subcommands ('start' and 'stop') to Server Admins or me
        if (sub === 'start' || sub === 'stop') {
            const isDev =
                Boolean(process.env.DEV_USER_ID) &&
                interaction.user.id === process.env.DEV_USER_ID;
            const isAdmin = Boolean(
                interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
            );

            if (!isDev && !isAdmin) {
                return interaction.reply({
                    content: '❌ Only server administrators can start or stop a Shiritori game.',
                    flags: MessageFlags.Ephemeral,
                });
            }
        }

        // ==========================================
        // 0. /shiritori info
        // ==========================================
        if (sub === 'info') {
            const isDev =
                Boolean(process.env.DEV_USER_ID) &&
                interaction.user.id === process.env.DEV_USER_ID;
            const isAdmin = Boolean(
                interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
            );

            const activeGame = activeGames.get(channelId);

            const container = new ContainerBuilder().setAccentColor(0x5865F2);

            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `### 📖 Shiritori — Rules & How to Play\n` +
                    `Shiritori (しりとり) is a word-chain game where each player must submit a word starting with the **last letter or kana** of the previous word.`
                )
            );

            container.addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            );

            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `**💬 Core Rules**\n` +
                    `• **Take Turns:** You cannot play two words in a row—wait for another player to answer first.\n` +
                    `• **No Repeats:** Each word can only be used once per game.\n` +
                    `• **Goal:** Games run until **100 valid words** are chained (or a custom length set at start).\n\n` +
                    `**🌐 Game Modes & Special Rules**\n` +
                    `• **🇬🇧 English (\`en\`):** Standard English dictionary. Accents like \`é\` automatically normalize to \`e\`. *(1 pt per letter)*\n` +
                    `• **🇯🇵 Japanese (\`jp\`):** Type words in **Hiragana or Katakana** (no Kanji in your input!). Words **cannot end in \`ん\` (\`ン\`)**. Small kana (\`ゃ, ゅ, ょ, っ\`) become full-size (\`や, ゆ, よ, つ\`) for the next player, and trailing \`ー\` uses the preceding kana. *(3 pts per kana)*\n` +
                    `• **🐴 Umamusume (\`uma\`):** Official Uma names! Spaces and punctuation are ignored when matching start/end letters. *(1 pt per letter)*`
                )
            );

            if (activeGame) {
                container.addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                );

                container.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `**🟢 Active Game in This Channel**\n` +
                        `• **Mode:** ${MODE_LABELS[activeGame.mode]} *(${activeGame.chainCount}/${activeGame.maxWords} words)*\n` +
                        `• **Current Word:** **${activeGame.currentWord}**\n` +
                        `• **Next word must start with:** **\`${activeGame.requiredNextChar.toUpperCase()}\`**`
                    )
                );
            }

            const flags = isDev || isAdmin
                ? MessageFlags.IsComponentsV2
                : MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

            return interaction.reply({
                components: [container],
                flags,
            });
        }

        // ==========================================
        // 1. /shiritori stop
        // ==========================================
        if (sub === 'stop') {
            const game = activeGames.get(channelId);
            if (!game) {
                return interaction.reply({
                    content: '❌ There is no active Shiritori game in this channel.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            game.collector.stop('manual_stop');
            activeGames.delete(channelId);

            return interaction.reply(buildGameEndCard(game, false));
        }

        // ==========================================
        // 2. /shiritori leaderboard
        // ==========================================
        if (sub === 'leaderboard') {
            const mode = interaction.options.getString('mode') || 'all';
            const rows = getLeaderboard(interaction.guildId, mode);

            const modeTitle = mode === 'all' ? 'All Modes' : MODE_LABELS[mode];
            if (rows.length === 0) {
                return interaction.reply(
                    buildStateCard({
                        title: `🏆 Shiritori Leaderboard ${modeTitle}`,
                        lines: ['*No points recorded in this server yet! Start a game with `/shiritori start`.*'],
                    })
                );
            }

            const lines = rows.map(
                (r, idx) =>
                    `**${idx + 1}.** <@${r.user_id}> — **${r.points}** pts *(${r.words_played} words)*`
            );

            return interaction.reply(
                buildStateCard({
                    title: `🏆 Shiritori Leaderboard ${modeTitle}`,
                    color: 0xF59E0B,
                    lines,
                })
            );
        }

        // ==========================================
        // 3. /shiritori start
        // ==========================================
        if (sub === 'start') {
            if (activeGames.has(channelId)) {
                return interaction.reply({
                    content: '⚠️ A Shiritori game is already running in this channel! Use `/shiritori stop` to end it first.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const mode = interaction.options.getString('mode');
            const maxWords = interaction.options.getInteger('length') ?? 100;

            let dict;
            try {
                dict = loadDictionary(mode);
            } catch (err) {
                return interaction.reply({
                    content: `❌ Could not load dictionary for **${mode}**: \`${err.message}\``,
                    flags: MessageFlags.Ephemeral,
                });
            }

            // Pick a valid starting word (for JP, ensure its reading doesn't end in ん)
            const validPool = [...dict.normalizedMap.entries()].filter(([norm]) => {
                const ends = getWordEnds(norm, mode);
                return ends && !(mode === 'jp' && ends.rawLast === 'ん');
            });

            if (validPool.length === 0) {
                return interaction.reply({
                    content: `❌ The **${mode}** dictionary has no valid starting words!`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            const [startNorm, startEntries] = validPool[Math.floor(Math.random() * validPool.length)];
            const startEntry = Array.isArray(startEntries) ? startEntries[0] : startEntries;
            const startEnds = getWordEnds(startNorm, mode);
            const startDisplay = formatEntryDisplay(
                startEntry,
                startEntry?.rawReading || startNorm,
                mode
            );

            const collector = interaction.channel.createMessageCollector({
                filter: m => !m.author.bot && Boolean(m.content?.trim()),
            });

            const gameState = {
                mode,
                maxWords,
                collector,
                usedNorms: new Set([startNorm]),
                usedEntryIds: new Set([startEntry?.id || startNorm]),
                currentWord: startDisplay,
                requiredNextChar: startEnds.nextRequired,
                lastUserId: null,
                chainCount: 0,
                sessionScores: new Map(),
            };

            activeGames.set(channelId, gameState);

            await interaction.reply(
                buildStateCard({
                    title: `💬 ${MODE_LABELS[mode]} Started!`,
                    color: 0x3BA55D,
                    lines: [
                        `• **Goal:** **${maxWords}** valid words`,
                        `• **Starting Word:** **${startDisplay}**`,
                        `• **Next word must start with:** \`${startEnds.nextRequired.toUpperCase()}\``,
                        `-# Type a valid word in chat! Each letter/kana = 1 pt. Stop anytime with \`/shiritori stop\`.`,
                    ],
                })
            );

            collector.on('collect', async message => {
                const rawInput = message.content.trim();
                if (mode !== 'uma' && /\s/.test(rawInput)) return;

                const norm = normalizeWord(rawInput, mode);
                if (!norm) return;

                const ends = getWordEnds(norm, mode);
                if (!ends) return;

                // 1. Check if same player answered twice in a row
                if (gameState.lastUserId === message.author.id) {
                    await message.react('❌').catch(() => {});
                    await message.channel.send(
                        buildStateCard({
                            title: '❌ Wait Your Turn!',
                            color: 0xED4245,
                            lines: [
                                `<@${message.author.id}>, you just played **${gameState.currentWord}**! Wait for another player to answer first.`,
                                `• **Next starting character:** \`${gameState.requiredNextChar.toUpperCase()}\``,
                            ],
                        })
                    );
                    return;
                }

                // 2. Check starting character
                if (ends.first !== gameState.requiredNextChar) {
                    await message.react('❌').catch(() => {});
                    await message.channel.send(
                        buildStateCard({
                            title: '❌ Wrong Starting Character!',
                            color: 0xED4245,
                            lines: [
                                `**${rawInput}** starts with \`${ends.first.toUpperCase()}\`, but the word must start with **\`${gameState.requiredNextChar.toUpperCase()}\`**!`,
                                `• **Current Word:** **${gameState.currentWord}**`,
                            ],
                        })
                    );
                    return;
                }

                // 3. Check JP 'ん' rule
                if (mode === 'jp' && ends.rawLast === 'ん') {
                    await message.react('❌').catch(() => {});
                    await message.channel.send(
                        buildStateCard({
                            title: '❌ Ended with 「ん」!',
                            color: 0xED4245,
                            lines: [
                                `**${rawInput}** ends with **ん**! Words cannot end with **ん** in Japanese Shiritori.`,
                                `• **Still waiting for a word starting with:** \`${gameState.requiredNextChar}\``,
                            ],
                        })
                    );
                    return;
                }

                // 4. Check if reading exists in dictionary
                const matchingEntries = dict.normalizedMap.get(norm);
                if (!matchingEntries || matchingEntries.length === 0) {
                    await message.react('❌').catch(() => {});
                    await message.channel.send(
                        buildStateCard({
                            title: '❌ Not in Dictionary!',
                            color: 0xED4245,
                            lines: [
                                `**${rawInput}** was not found in the ${MODE_LABELS[mode]} dictionary.`,
                                `• **Next starting character:** \`${gameState.requiredNextChar.toUpperCase()}\``,
                            ],
                        })
                    );
                    return;
                }

                // 5. Find an unused entry for this reading (in case homophones exist, e.g. 橋 vs 箸 for はし)
                const unusedEntry = matchingEntries.find(e => !gameState.usedEntryIds.has(e.id));
                if (gameState.usedNorms.has(norm) && !unusedEntry) {
                    const prevDisplay = formatEntryDisplay(matchingEntries[0], rawInput, mode);
                    await message.react('❌').catch(() => {});
                    await message.channel.send(
                        buildStateCard({
                            title: '❌ Word Already Used!',
                            color: 0xED4245,
                            lines: [
                                `**${prevDisplay}** has already been played in this game!`,
                                `• **Next starting character:** \`${gameState.requiredNextChar.toUpperCase()}\``,
                            ],
                        })
                    );
                    return;
                }

                // Valid word
                const chosenEntry = unusedEntry || matchingEntries[0];
                const canonicalDisplay = formatEntryDisplay(chosenEntry, rawInput, mode);
                const pointsEarned = norm.length * (mode === 'jp' ? 3 : 1);

                gameState.usedNorms.add(norm);
                gameState.usedEntryIds.add(chosenEntry.id);
                gameState.currentWord = canonicalDisplay; // Used by buildGameEndCard on stop/finish!
                gameState.requiredNextChar = ends.nextRequired;
                gameState.lastUserId = message.author.id;
                gameState.chainCount += 1;

                const prevStats = gameState.sessionScores.get(message.author.id) || { points: 0, words: 0 };
                const updatedStats = {
                    points: prevStats.points + pointsEarned,
                    words: prevStats.words + 1,
                };
                gameState.sessionScores.set(message.author.id, updatedStats);

                if (message.guildId) {
                    addPlayerScore(message.guildId, message.author.id, mode, pointsEarned);
                }

                await message.react('✅').catch(() => {});

                if (gameState.chainCount >= gameState.maxWords) {
                    collector.stop('goal_reached');
                    activeGames.delete(channelId);

                    await message.channel.send(
                        buildStateCard({
                            title: `✅ Word #${gameState.chainCount}/${gameState.maxWords} — ${canonicalDisplay}`,
                            color: 0x3BA55D,
                            lines: [
                                `<@${message.author.id}> earned **+${pointsEarned} pts** *(Session: ${updatedStats.points} pts)* and completed the final word!`,
                            ],
                        })
                    );

                    await message.channel.send(buildGameEndCard(gameState, true));
                    return;
                }

                await message.channel.send(
                    buildStateCard({
                        title: `✅ Word #${gameState.chainCount}/${gameState.maxWords} — ${canonicalDisplay}`,
                        color: 0x3BA55D,
                        lines: [
                            `<@${message.author.id}> earned **+${pointsEarned} pts** *(Session: ${updatedStats.points} pts)*!`,
                            `• **Next word must start with:** **\`${gameState.requiredNextChar.toUpperCase()}\`**`,
                        ],
                    })
                );
            });

            collector.on('end', () => {
                activeGames.delete(channelId);
            });
        }
    },
};
