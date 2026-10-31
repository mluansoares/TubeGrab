'use strict';
// Fila de downloads, máquina de estados, progresso ao vivo e retenção.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { CONFIG } from './config.js';
import { logger } from './logger.js';
import { all, get, now, run, updateJob } from './db.js';
import { UserError, downloadVideo, getInfo, killTree } from './ytdlp.js';
import { safeFileName } from './urls.js';

const queue = [];
const live = new Map(); // id -> { progress, speed, eta, downloaded, total, child, canceled }
const canceling = new Set();
let running = 0;

const TERMINAL = ['COMPLETED', 'FAILED', 'CANCELED'];
const isTerminal = (s) => TERMINAL.includes(s);

function newId() {
  return `job_${crypto.randomBytes(8).toString('hex')}`;
}

function freeBytes() {
  try {
    const s = fs.statfsSync(CONFIG.STORAGE_DIR);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

function publicJob(row) {
  if (!row) return null;
  const rt = live.get(row.id);
  const status = row.status;
  const progress = status === 'COMPLETED' ? 100 : status === 'CONVERTING' ? 99 : (rt?.progress ?? row.progress ?? 0);
  const totalBytes = rt?.total || row.total_bytes || row.expected_bytes || 0;
  return {
    id: row.id,
    url: row.url,
    videoId: row.video_id,
    title: row.title,
    channel: row.channel,
    thumbnail: row.thumbnail,
    mode: row.mode,
    quality: row.quality,
    status,
    progress,
    speed: rt?.speed ?? row.speed ?? 0,
    eta: rt?.eta ?? row.eta ?? 0,
    downloadedBytes: rt?.downloaded ?? row.downloaded_bytes ?? 0,
    totalBytes,
    totalBytesApprox: Boolean(row.expected_bytes && !rt?.total),
    expectedBytes: row.expected_bytes || 0,
    fileName: row.file_name,
    sizeBytes: row.size_bytes,
    duration: row.duration_sec,
    error: row.error,
    errorCode: row.error_code,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    fileUrl: status === 'COMPLETED' ? `/api/files/${row.id}` : null,
    downloadUrl: status === 'COMPLETED' ? `/api/files/${row.id}?download=1` : null,
  };
}

export function listJobs(limit = 40) {
  return all('SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?', [limit]).map(publicJob);
}

export function getJob(id) {
  return publicJob(get('SELECT * FROM jobs WHERE id=?', [id]));
}

export function queueState() {
  return { running, queued: queue.length, concurrency: CONFIG.CONCURRENCY };
}

/** Cria o job depois de validar limites. `info` vem de ytdlp.getInfo. */
export function createJob({ info, mode, quality }) {
  if (!info || !info.id) throw new UserError('BAD_INFO', 'Não consegui ler as informações deste vídeo.');
  if (info.isLive) throw new UserError('LIVE', 'Transmissões ao vivo não são suportadas.');
  if (info.tooLong) {
    throw new UserError('TOO_LONG', `Este vídeo tem mais de ${info.maxDurationMin} minutos e não é permitido pelas configurações.`);
  }

  let label;
  let estimated = 0;

  if (mode === 'audio') {
    const bitrate = Number(quality) || 192;
    if (![128, 192, 320].includes(bitrate)) throw new UserError('BAD_QUALITY', 'Qualidade de áudio inválida.');
    label = `${bitrate} kbps`;
    estimated = info.audio.find((a) => a.bitrate === bitrate)?.sizeBytes || 0;
  } else {
    const height = Number(quality) || Math.min(720, info.maxHeight || 720);
    const option = info.video.find((v) => v.height === height);
    if (!option) throw new UserError('BAD_QUALITY', 'Essa resolução não está disponível para este vídeo.');
    label = option.label;
    estimated = option.sizeBytes || 0;
  }

  if (estimated > CONFIG.MAX_FILESIZE_MB * 1024 * 1024) {
    throw new UserError('TOO_BIG', `O arquivo passaria de ${CONFIG.MAX_FILESIZE_MB} MB. Escolha uma qualidade menor.`);
  }

  const free = freeBytes();
  if (free !== null && free < estimated + 300 * 1024 * 1024) {
    throw new UserError('NO_SPACE', 'Espaço em disco insuficiente para este download.');
  }

  const id = newId();
  const ts = now();
  run(
    `INSERT INTO jobs(id,url,video_id,title,channel,thumbnail,mode,quality,status,created_at,updated_at,duration_sec,expected_bytes)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, info.url, info.id, info.title, info.channel, info.thumbnail, mode, label, 'QUEUED', ts, ts, info.duration || 0, estimated],
  );

  const dir = path.join(CONFIG.STORAGE_DIR, id);
  fs.mkdirSync(dir, { recursive: true });

  queue.push(id);
  logger.info('job.queued', { id, videoId: info.id, mode, quality: label });
  setImmediate(pump);
  return getJob(id);
}

export function cancelJob(id) {
  const row = get('SELECT * FROM jobs WHERE id=?', [id]);
  if (!row) throw new UserError('NOT_FOUND', 'Download não encontrado.');
  if (isTerminal(row.status)) return getJob(id);

  canceling.add(id);
  const rt = live.get(id);

  if (rt?.child) {
    killTree(rt.child);
  } else {
    const idx = queue.indexOf(id);
    if (idx >= 0) queue.splice(idx, 1);
    finishCanceled(id);
  }

  return getJob(id);
}

function finishCanceled(id) {
  canceling.delete(id);
  const row = get('SELECT * FROM jobs WHERE id=?', [id]);
  if (!row || isTerminal(row.status)) return;
  updateJob(id, { status: 'CANCELED', error: 'Cancelado por você.', error_code: 'CANCELED', finished_at: now() });
  removeDir(id);
  logger.info('job.canceled', { id });
}

function removeDir(id) {
  try {
    fs.rmSync(path.join(CONFIG.STORAGE_DIR, id), { recursive: true, force: true });
  } catch (e) {
    logger.warn('job.rm_failed', { id, error: e.message });
  }
}

async function runJob(id) {
  running += 1;
  const row = get('SELECT * FROM jobs WHERE id=?', [id]);
  if (!row) { running -= 1; pump(); return; }
  if (canceling.has(id)) { finishCanceled(id); running -= 1; pump(); return; }

  const dir = path.join(CONFIG.STORAGE_DIR, id);
  const rt = { progress: 0, speed: 0, eta: 0, downloaded: 0, total: 0, expected: row.expected_bytes || 0, child: null };
  live.set(id, rt);
  let lastPersist = 0;

  updateJob(id, { status: 'DOWNLOADING', progress: 0, error: null, error_code: null });

  try {
    const mode = row.mode === 'audio' ? 'audio' : 'video';
    const qualityNum = parseInt(row.quality, 10) || (mode === 'audio' ? 192 : 720);

    const result = await downloadVideo({
      url: row.url,
      mode,
      height: qualityNum,
      bitrate: qualityNum,
      dir,
      title: row.title,
      videoId: row.video_id,
      duration: row.duration_sec,
      expectedBytes: row.expected_bytes || 0,
      onSpawn: (child) => {
        rt.child = child;
        if (canceling.has(id)) killTree(child);
      },
      onProgress: (p) => {
        rt.total = rt.expected || p.totalBytes || 0;
        rt.downloaded = Math.max(rt.downloaded, p.downloadedBytes);
        rt.speed = p.speed;
        rt.eta = p.eta;
        rt.progress = rt.total > 0 ? Math.max(rt.progress, Math.min(98, (rt.downloaded / rt.total) * 98)) : 0;
        const t = Date.now();
        if (t - lastPersist > 900) {
          lastPersist = t;
          updateJob(id, {
            progress: rt.progress,
            speed: rt.speed,
            eta: rt.eta,
            downloaded_bytes: rt.downloaded,
            total_bytes: rt.total,
          });
        }
      },
      onPhase: (phase) => {
        if (phase === 'CONVERTING') updateJob(id, { status: 'CONVERTING', progress: 99 });
      },
    });

    const ext = result.ext || (mode === 'audio' ? 'mp3' : 'mp4');
    const friendly = safeFileName(row.title, row.video_id, ext);
    const finalPath = path.join(dir, friendly);
    if (path.resolve(result.filePath) !== path.resolve(finalPath)) {
      fs.renameSync(result.filePath, finalPath);
    }

    updateJob(id, {
      status: 'COMPLETED',
      progress: 100,
      speed: 0,
      eta: 0,
      file_path: finalPath,
      file_name: friendly,
      size_bytes: fs.statSync(finalPath).size,
      finished_at: now(),
    });
    logger.info('job.completed', { id, bytes: fs.statSync(finalPath).size });
  } catch (err) {
    if (canceling.has(id)) {
      finishCanceled(id);
    } else {
      const userError = err instanceof UserError
        ? err
        : new UserError('UNKNOWN', 'Algo não saiu como esperado durante o download.');
      updateJob(id, {
        status: 'FAILED',
        error: userError.message,
        error_code: userError.code,
        finished_at: now(),
      });
      removeDir(id);
      logger.error('job.failed', { id, code: userError.code, error: userError.message, detail: userError.detail });
    }
  } finally {
    live.delete(id);
    running -= 1;
    pump();
  }
}

function pump() {
  while (running < CONFIG.CONCURRENCY && queue.length) {
    const id = queue.shift();
    runJob(id).catch((err) => {
      logger.error('job.crash', { id, error: err.message });
      running = Math.max(0, running - 1);
      pump();
    });
  }
}

export function deleteJob(id) {
  const row = get('SELECT * FROM jobs WHERE id=?', [id]);
  if (!row) throw new UserError('NOT_FOUND', 'Download não encontrado.');
  if (!isTerminal(row.status)) {
    cancelJob(id);
    setTimeout(() => { try { deleteJob(id); } catch { /* corrida com o cancelamento */ } }, 1500);
    return { deleting: true };
  }
  removeDir(id);
  run('DELETE FROM jobs WHERE id=?', [id]);
  logger.info('job.deleted', { id });
  return { deleted: true };
}

export function fileFor(id) {
  const row = get('SELECT * FROM jobs WHERE id=?', [id]);
  if (!row || row.status !== 'COMPLETED' || !row.file_path) return null;
  if (!fs.existsSync(row.file_path)) return null;
  return { ...row };
}

/** Retenção: apaga arquivos vencidos e diretórios órfãos. */
export function cleanupOld() {
  const cutoff = Date.now() - CONFIG.RETENTION_DAYS * 86400_000;
  let removed = 0;

  for (const row of all('SELECT * FROM jobs')) {
    const stamp = Date.parse(row.finished_at || row.updated_at || row.created_at);
    if (isTerminal(row.status) && Number.isFinite(stamp) && stamp < cutoff) {
      removeDir(row.id);
      run('DELETE FROM jobs WHERE id=?', [row.id]);
      removed += 1;
    }
  }

  try {
    const known = new Set(all('SELECT id FROM jobs').map((r) => r.id));
    for (const name of fs.readdirSync(CONFIG.STORAGE_DIR)) {
      const full = path.join(CONFIG.STORAGE_DIR, name);
      if (!known.has(name) && fs.statSync(full).isDirectory()) {
        const age = Date.now() - fs.statSync(full).mtimeMs;
        if (age > 3600_000) fs.rmSync(full, { recursive: true, force: true });
      }
    }
  } catch { /* storage pode não existir ainda */ }

  if (removed) logger.info('jobs.cleanup', { removed });
  return removed;
}

/** No boot, jobs que estavam rodando não podem ser retomados. */
export function recoverInterrupted() {
  const rows = all(`SELECT id FROM jobs WHERE status NOT IN ('COMPLETED','FAILED','CANCELED')`);
  for (const row of rows) {
    removeDir(row.id);
    updateJob(row.id, {
      status: 'FAILED',
      error: 'O download foi interrompido porque o app reiniciou. Tente novamente.',
      error_code: 'INTERRUPTED',
      finished_at: now(),
    });
  }
  if (rows.length) logger.warn('jobs.recovered', { count: rows.length });
}

export async function warmInfo(url) {
  return getInfo(url);
}
