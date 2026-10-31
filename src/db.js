'use strict';
// SQLite nativo do Node (zero dependência nativa): histórico de downloads.
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from './config.js';
import { DatabaseSync } from 'node:sqlite';

fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(CONFIG.DATA_DIR, 'tubegrab.sqlite'));
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS jobs(
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  video_id TEXT,
  title TEXT,
  channel TEXT,
  thumbnail TEXT,
  mode TEXT,
  quality TEXT,
  status TEXT DEFAULT 'QUEUED',
  progress REAL DEFAULT 0,
  speed REAL DEFAULT 0,
  eta INTEGER DEFAULT 0,
  downloaded_bytes INTEGER DEFAULT 0,
  total_bytes INTEGER DEFAULT 0,
  file_path TEXT,
  file_name TEXT,
  size_bytes INTEGER DEFAULT 0,
  duration_sec REAL DEFAULT 0,
  error TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at DESC);
`);

try { db.exec('ALTER TABLE jobs ADD COLUMN expected_bytes INTEGER DEFAULT 0'); } catch { /* já migrado */ }

export const now = () => new Date().toISOString();
export const run = (sql, params = []) => db.prepare(sql).run(...params);
export const get = (sql, params = []) => db.prepare(sql).get(...params);
export const all = (sql, params = []) => db.prepare(sql).all(...params);

const COLUMNS = new Set([
  'url', 'video_id', 'title', 'channel', 'thumbnail', 'mode', 'quality', 'status',
  'progress', 'speed', 'eta', 'downloaded_bytes', 'total_bytes', 'expected_bytes',
  'file_path', 'file_name', 'size_bytes', 'duration_sec', 'error', 'error_code',
  'updated_at', 'finished_at',
]);

export function updateJob(id, patch) {
  const keys = Object.keys(patch).filter((k) => COLUMNS.has(k));
  if (!keys.length) return;
  keys.push('updated_at');
  const values = keys.map((k) => (k === 'updated_at' ? now() : patch[k]));
  run(`UPDATE jobs SET ${keys.map((k) => `${k}=?`).join(', ')} WHERE id=?`, [...values, id]);
}

export { db };
