'use strict';
// Bootstrap do TubeGrab: segurança, API, SPA estática e tarefas de manutenção.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import { CONFIG, PATHS, ROOT, ensureDirs } from './config.js';
import { logger } from './logger.js';
import './db.js';
import { cleanupOld, recoverInterrupted } from './jobs.js';
import { binariesReady, capabilities, ffmpegReady } from './ytdlp.js';
import videosRouter from './routes/videos.js';

ensureDirs();
recoverInterrupted();

const app = express();
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      mediaSrc: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      baseUri: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-site' },
}));
app.use(express.json({ limit: '64kb' }));

// Token opcional para exposição na rede interna.
function tokenOk(req) {
  if (!CONFIG.ACCESS_TOKEN) return true;
  const given = String(req.get('x-access-token') || req.query.token || '');
  if (!given) return false;
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(CONFIG.ACCESS_TOKEN).digest();
  return crypto.timingSafeEqual(a, b);
}

// Limitador simples em memória. A interface faz polling de 1 s durante um
// download, então leituras têm teto alto; só as rotas caras (que chamam o
// yt-dlp) ficam com teto baixo.
function makeThrottle(max) {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.ip || 'local';
    const now = Date.now();
    const entry = hits.get(key) || { count: 0, reset: now + 60_000 };
    if (now > entry.reset) { entry.count = 0; entry.reset = now + 60_000; }
    entry.count += 1;
    hits.set(key, entry);
    // Evita crescimento infinito do mapa em sessões longas.
    if (hits.size > 500) {
      for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
    }
    if (entry.count > max) {
      return res.status(429).json({ code: 'RATE_LIMIT', message: 'Muitas requisições em pouco tempo. Aguarde um minuto.' });
    }
    next();
  };
}

const readThrottle = makeThrottle(300);
const heavyThrottle = makeThrottle(40);

function heavyOnly(req, res, next) {
  const isHeavy = req.method === 'POST' || req.method === 'DELETE';
  return (isHeavy ? heavyThrottle : readThrottle)(req, res, next);
}

app.use('/api', (req, res, next) => {
  if (!tokenOk(req)) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Este servidor exige um token de acesso.' });
  }
  next();
});
app.use('/api', heavyOnly);
app.use('/api', videosRouter);

app.use(express.static(path.join(ROOT, 'public'), { maxAge: '5m', index: false }));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Rota não encontrada.' });
  }
  res.sendFile(path.join(ROOT, 'public', 'index.html'));
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  logger.error('http.error', { error: err?.message });
  if (res.headersSent) return res.end();
  res.status(err.status || 500).json({ code: 'INTERNAL', message: 'Algo não saiu como esperado. Tente novamente.' });
});

process.on('unhandledRejection', (err) => logger.error('unhandledRejection', { error: String(err?.message || err) }));
process.on('uncaughtException', (err) => logger.error('uncaughtException', { error: String(err?.message || err) }));

app.listen(CONFIG.PORT, CONFIG.HOST, () => {
  const caps = capabilities();
  logger.info('server.up', { port: CONFIG.PORT, host: CONFIG.HOST, ytdlp: caps.version });
  console.log('');
  console.log(`  TubeGrab no ar  →  http://localhost:${CONFIG.PORT}`);
  console.log(`  yt-dlp: ${caps.version || 'AUSENTE (rode npm run setup)'}`);
  console.log(`  ffmpeg: ${ffmpegReady() ? 'ok' : 'AUSENTE (rode npm run setup)'}`);
  if (!binariesReady()) console.log('  ⚠  Binários ausentes: execute "npm run setup" antes de baixar.');
  if (CONFIG.HOST === '0.0.0.0') console.log('  ⚠  Acessível na rede local — defina ACCESS_TOKEN no .env.');
  console.log('');
});

try { cleanupOld(); } catch (err) { logger.warn('cleanup.failed', { error: err.message }); }
setInterval(() => { try { cleanupOld(); } catch { /* best-effort */ } }, 6 * 3600_000).unref();

export { app };
