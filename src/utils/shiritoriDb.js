const Database = require('better-sqlite3');
const path = require('node:path');
const fs = require('node:fs');

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'shiritori.sqlite'));

// Enable WAL mode for fast concurrent reads/writes
db.pragma('journal_mode = WAL');

db.exec(`
    CREATE TABLE IF NOT EXISTS scores (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        mode TEXT NOT NULL,
        points INTEGER NOT NULL DEFAULT 0,
        words_played INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (guild_id, user_id, mode)
    );
`);

const addPointsStmt = db.prepare(`
    INSERT INTO scores (guild_id, user_id, mode, points, words_played)
    VALUES (?, ?, ?, ?, 1)
    ON CONFLICT(guild_id, user_id, mode)
    DO UPDATE SET
        points = points + excluded.points,
        words_played = words_played + 1;
`);

const getTopStmt = db.prepare(`
    SELECT user_id, points, words_played
    FROM scores
    WHERE guild_id = ? AND mode = ?
    ORDER BY points DESC
    LIMIT 10;
`);

const getTopAllModesStmt = db.prepare(`
    SELECT user_id, SUM(points) AS points, SUM(words_played) AS words_played
    FROM scores
    WHERE guild_id = ?
    GROUP BY user_id
    ORDER BY points DESC
    LIMIT 10;
`);

function addPlayerScore(guildId, userId, mode, points) {
    addPointsStmt.run(guildId, userId, mode, points);
}

function getLeaderboard(guildId, mode = 'all') {
    if (mode === 'all') return getTopAllModesStmt.all(guildId);
    return getTopStmt.all(guildId, mode);
}

module.exports = { addPlayerScore, getLeaderboard };
