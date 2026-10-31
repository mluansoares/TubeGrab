'use strict';
// API: metadados, fila, progresso, arquivos e diagnóstico.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { CONFIG } from '../config.js';
import { logger } from '../logger.js';
import { UserError, capabilities, cookieConfig, diagnose, getInfo, mapError } from '../ytdlp.js';
import { parseYouTubeUrl, UrlError } from '../urls.js';
import { cancelJob, createJob, deleteJob, fileFor, getJob, listJobs, queueState } from '../jobs.js';

const router = express.Router();

const MIME = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  opus: 'audio/ogg',
};

function fail(res, err) {
  if (err instanceof UserError || err instanceof UrlError) {
    return res.status(400).json({ code: err.code, message: err.message, detail: err.detail || null });
  }
  logger.error('api.error', { error: err?.message });
  return res.status(500).json({ code: 'INTERNAL', message: 'Algo não saiu como esperado. Tente novamente.' });
}

router.post('/info', async (req, res) => {
  try {
    const { url } = parseYouTubeUrl(req.body?.url);
    const info = await getInfo(url);
    res.json(info);
  } catch (err) {
    fail(res, err);
  }
});

router.post('/jobs', async (req, res) => {
  try {
    const { url } = parseYouTubeUrl(req.body?.url);
    const mode = req.body?.mode === 'audio' ? 'audio' : 'video';
    const info = await getInfo(url);
    const job = createJob({ info, mode, quality: req.body?.quality });
    res.status(202).json(job);
  } catch (err) {
    fail(res, err);
  }
});

router.get('/jobs', (req, res) => {
  res.json({ jobs: listJobs(40), queue: queueState() });
});

router.get('/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ code: 'NOT_FOUND', message: 'Download não encontrado.' });
  res.json(job);
});

router.post('/jobs/:id/cancel', (req, res) => {
  try {
    res.json(cancelJob(req.params.id));
  } catch (err) {
    fail(res, err);
  }
});

router.delete('/jobs/:id', (req, res) => {
  try {
    res.json(deleteJob(req.params.id));
  } catch (err) {
    fail(res, err);
  }
});

router.post('/jobs/:id/reveal', (req, res) => {
  try {
    const row = fileFor(req.params.id);
    if (!row) throw new UserError('NOT_FOUND', 'O arquivo não está mais disponível.');
    if (process.platform === 'win32') {
      spawn('explorer.exe', ['/select,', row.file_path], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', ['-R', row.file_path], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [path.dirname(row.file_path)], { detached: true, stdio: 'ignore' }).unref();
    }
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

router.get('/files/:id', (req, res) => {
  const row = fileFor(req.params.id);
  if (!row) return res.status(404).json({ code: 'NOT_FOUND', message: 'Arquivo não encontrado (pode ter expirado).' });
  const ext = path.extname(row.file_name || row.file_path).slice(1).toLowerCase();
  const disposition = req.query.download === '1' ? 'attachment' : 'inline';
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `${disposition}; filename="${(row.file_name || 'video').replace(/["\\]/g, '')}"; filename*=UTF-8''${encodeURIComponent(row.file_name || 'video')}`,
  );
  res.sendFile(path.resolve(row.file_path), { acceptRanges: true, cacheControl: false });
});

router.get('/health', (req, res) => {
  const caps = capabilities();
  let disk = null;
  try {
    const s = fs.statfsSync(CONFIG.STORAGE_DIR);
    disk = { freeBytes: Number(s.bavail) * Number(s.bsize), totalBytes: Number(s.blocks) * Number(s.bsize) };
  } catch { /* indisponível neste sistema */ }

  res.json({
    ok: Boolean(caps.version),
    version: CONFIG.VERSION,
    node: process.version,
    ytdlp: caps.version,
    jsRuntime: caps.jsRuntime ? 'node' : null,
    ffmpeg: caps.ffmpeg,
    disk,
    queue: queueState(),
    limits: {
      maxDurationMin: CONFIG.MAX_DURATION_MIN,
      maxFilesizeMb: CONFIG.MAX_FILESIZE_MB,
      retentionDays: CONFIG.RETENTION_DAYS,
    },
    cookies: cookieConfig(),
  });
});

router.post('/health/diagnose', async (req, res) => {
  try {
    const raw = req.body?.url || 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
    const { url } = parseYouTubeUrl(raw);
    const result = await diagnose(url);
    res.json({ ...result, message: 'Conexão com o YouTube funcionando.' });
  } catch (err) {
    if (err instanceof UserError || err instanceof UrlError) {
      return res.status(400).json({ code: err.code, message: err.message, detail: err.detail || null });
    }
    const mapped = mapError(err?.message || '');
    res.status(400).json({ code: mapped.code, message: mapped.message, detail: mapped.detail });
  }
});

export default router;
