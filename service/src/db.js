import Database from 'better-sqlite3';
import { resolve } from 'path';

const db = new Database(resolve(process.env.DB_PATH || '/data/auth.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    ip TEXT,
    user_agent TEXT,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

export const createUser = (username, passwordHash) =>
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, passwordHash);

export const findByUsername = (username) =>
  db.prepare('SELECT * FROM users WHERE username = ?').get(username);

export const listAll = () =>
  db.prepare('SELECT id, username, created_at FROM users').all();

export const remove = (username) =>
  db.prepare('DELETE FROM users WHERE username = ?').run(username);

export const countUsers = () =>
  db.prepare('SELECT COUNT(*) as count FROM users').get().count;

export const createSession = (id, userId, username, ip, userAgent, expiresAt) =>
  db.prepare(
    'INSERT INTO sessions (id, user_id, username, ip, user_agent, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, userId, username, ip, userAgent, expiresAt);

export const findSession = (id) =>
  db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);

export const touchSession = (id) =>
  db.prepare('UPDATE sessions SET last_seen = CURRENT_TIMESTAMP WHERE id = ?').run(id);

export const listSessions = () => {
  db.prepare('DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP').run();
  return db.prepare('SELECT * FROM sessions ORDER BY last_seen DESC').all();
};

export const removeSession = (id) =>
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);

export const countSessions = () => {
  db.prepare('DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP').run();
  return db.prepare('SELECT COUNT(*) as count FROM sessions').get().count;
};

export default db;
