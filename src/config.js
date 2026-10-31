'use strict';
// Configuração central: .env opcional, caminhos e limites.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Parser mínimo de .env (sem dependências).
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  try {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
      }
    }
  } catch { /* segue sem .env */ }
}

const env = (key, fallback) => process.env[key] ?? fallback;
const num = (key, fallback) => {
  const n = Number(env(key, fallback));
  return Number.isFinite(n) ? n : fallback;
};

export const CONFIG = {
  PORT: num('PORT', 3100),
  HOST: env('HOST', '127.0.0.1'),
  ACCESS_TOKEN: env('ACCESS_TOKEN', ''),

  BIN_DIR: path.join(ROOT, 'bin'),
  STORAGE_DIR: path.join(ROOT, 'storage', 'videos'),
  TMP_DIR: path.join(ROOT, 'storage', 'tmp'),
  DATA_DIR: path.join(ROOT, 'data'),
  LOG_DIR: path.join(ROOT, 'logs'),

  COOKIES_FILE: env('COOKIES_FILE', ''),
  // Navegador de onde o yt-dlp lê os cookies direto do perfil (edge, chrome, firefox…).
  COOKIES_FROM_BROWSER: env('COOKIES_FROM_BROWSER', ''),
  // 0 = sem limite de duração.
  MAX_DURATION_MIN: Math.max(0, num('MAX_DURATION_MIN', 180)),
  MAX_FILESIZE_MB: num('MAX_FILESIZE_MB', 4096),
  RETENTION_DAYS: num('RETENTION_DAYS', 7),
  CONCURRENCY: Math.max(1, num('CONCURRENCY', 1)),
  INFO_TTL_MS: 10 * 60 * 1000,

  VERSION: '1.0.0',
};

export const PATHS = {
  ytdlp: path.join(CONFIG.BIN_DIR, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'),
  ffmpeg: path.join(CONFIG.BIN_DIR, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'),
};

export function ensureDirs() {
  for (const dir of [CONFIG.BIN_DIR, CONFIG.STORAGE_DIR, CONFIG.TMP_DIR, CONFIG.DATA_DIR, CONFIG.LOG_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
