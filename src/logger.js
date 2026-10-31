'use strict';
// Logs estruturados em JSON (console + arquivo rotativo simples por dia).
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from './config.js';

const file = path.join(CONFIG.LOG_DIR, 'app.log');
let ready = false;

function write(level, event, data = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...data });
  (level === 'error' ? console.error : console.log)(line);
  try {
    if (!ready) { fs.mkdirSync(CONFIG.LOG_DIR, { recursive: true }); ready = true; }
    fs.appendFileSync(file, line + '\n');
  } catch { /* log em arquivo é best-effort */ }
}

export const logger = {
  info: (event, data) => write('info', event, data),
  warn: (event, data) => write('warn', event, data),
  error: (event, data) => write('error', event, data),
};
