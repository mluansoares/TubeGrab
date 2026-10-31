'use strict';
// Camada única de contato com o yt-dlp: info, download, progresso, cancelamento e erros humanos.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { CONFIG, PATHS } from './config.js';
import { logger } from './logger.js';

export class UserError extends Error {
  constructor(code, message, detail = '') {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

const ANSI = /\x1b\[[0-9;]*m/g;
const clean = (s) => String(s || '').replace(ANSI, '').trim();

export function binariesReady() {
  return fs.existsSync(PATHS.ytdlp);
}

export function ffmpegReady() {
  return fs.existsSync(PATHS.ffmpeg);
}

let caps = null;
export function capabilities() {
  if (caps) return caps;
  caps = { version: null, jsRuntime: false, ffmpeg: ffmpegReady() };
  if (!binariesReady()) return caps;
  try {
    const v = spawnSync(PATHS.ytdlp, ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
    caps.version = clean(v.stdout) || null;
    const help = spawnSync(PATHS.ytdlp, ['--help'], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
    caps.jsRuntime = /--js-runtime/.test(help.stdout || '');
  } catch { /* mantém defaults */ }
  return caps;
}

/**
 * De onde vêm os cookies de autenticação.
 * Prioridade: COOKIES_FILE (arquivo exportado) e, na falta dele, COOKIES_FROM_BROWSER.
 */
export function cookieConfig() {
  if (CONFIG.COOKIES_FILE) {
    const file = path.resolve(CONFIG.COOKIES_FILE);
    return { mode: fs.existsSync(file) ? 'file' : 'missing', source: file };
  }
  const browser = String(CONFIG.COOKIES_FROM_BROWSER || '').trim();
  if (browser) return { mode: 'browser', source: browser };
  return { mode: 'none', source: null };
}

let warnedMissingCookies = false;
function cookieArgs() {
  const c = cookieConfig();
  if (c.mode === 'file') return ['--cookies', c.source];
  if (c.mode === 'browser') return ['--cookies-from-browser', c.source];
  if (c.mode === 'missing' && !warnedMissingCookies) {
    warnedMissingCookies = true;
    logger.warn('ytdlp.cookies_missing', { file: c.source });
  }
  return [];
}

function baseArgs() {
  const args = ['--ignore-config', '--no-color', '--no-warnings', '--no-playlist', '--no-mtime'];
  if (ffmpegReady()) args.push('--ffmpeg-location', CONFIG.BIN_DIR);
  if (capabilities().jsRuntime) args.push('--js-runtime', 'node');
  args.push(...cookieArgs());
  return args;
}

export function killTree(child) {
  if (!child || child.killed) return;
  if (process.platform === 'win32') {
    try {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    } catch { try { child.kill(); } catch { /* ignore */ } }
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { /* ignore */ } }
  }
}

function runCapture(args, { timeout = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(PATHS.ytdlp, args, { windowsHide: true });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      killTree(child);
      reject(new UserError('TIMEOUT', 'O YouTube demorou demais para responder. Tente de novo em instantes.'));
    }, timeout);

    child.stdout.on('data', (d) => { out += d; if (out.length > 8e6) out = out.slice(-4e6); });
    child.stderr.on('data', (d) => { err += d; if (err.length > 2e5) err = err.slice(-1e5); });
    child.on('error', (e) => {
      clearTimeout(timer);
      if (e.code === 'ENOENT') {
        reject(new UserError('NO_BINARY', 'O yt-dlp não está instalado. Rode "npm run setup" e tente novamente.'));
      } else {
        reject(new UserError('SPAWN', 'Não consegui iniciar o yt-dlp neste sistema.', e.message));
      }
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout: out, stderr: err });
      else reject(mapError(err || out));
    });
  });
}

/** Mensagens de erro em português, com dica de solução. */
export function mapError(text) {
  const raw = clean(text);
  const line = raw.split(/\r?\n/).filter(Boolean).pop() || 'Erro desconhecido.';
  const has = (re) => re.test(raw);
  const mk = (code, message, hint = '') => new UserError(code, message, hint ? `${hint} (${line})` : line);

  if (has(/Sign in to confirm (your age|you.?re not a bot)/i) || has(/confirm you.?re not a bot/i)) {
    return mk('BOT_CHECK', 'O YouTube pediu verificação de robô.',
      'Coloque COOKIES_FROM_BROWSER=edge (ou chrome/firefox) no .env e reinicie o app — ou exporte um cookies.txt e use COOKIES_FILE. Cookies de uma conta logada resolvem na maioria dos casos.');
  }
  if (has(/Private video/i)) return mk('PRIVATE', 'Este vídeo é privado.');
  if (has(/members-only|available to this channel.?s members|Join this channel/i)) {
    return mk('MEMBERS', 'Este vídeo é exclusivo para membros do canal.');
  }
  if (has(/age.?restricted|inappropriate for some users/i)) {
    return mk('AGE', 'Este vídeo tem restrição de idade e exige login.', 'Use COOKIES_FROM_BROWSER (ex.: edge) ou COOKIES_FILE com cookies de uma conta autorizada.');
  }
  if (has(/not available in your country|geo.?restrict/i)) return mk('GEO', 'Este vídeo não está disponível na sua região.');
  if (has(/This live event|is live|premieres in|will begin/i)) {
    return mk('LIVE', 'Transmissões ao vivo e estreias não são suportadas.');
  }
  if (has(/Video unavailable|This video is unavailable|has been removed/i)) {
    return mk('UNAVAILABLE', 'Vídeo indisponível — pode ter sido removido ou estar bloqueado.');
  }
  if (has(/Requested format (is )?not available/i)) {
    return mk('FORMAT', 'A qualidade escolhida não está disponível para este vídeo.', 'Tente outra resolução.');
  }
  if (has(/HTTP Error 429|Too Many Requests/i)) {
    return mk('RATE_LIMIT', 'O YouTube limitou temporariamente os pedidos.', 'Aguarde alguns minutos e tente de novo.');
  }
  if (has(/HTTP Error 403|Forbidden/i)) {
    return mk('FORBIDDEN', 'O YouTube recusou o download (403).', 'Atualize o yt-dlp com "npm run update:ytdlp".');
  }
  if (has(/ffmpeg (not found|is not installed)|ffprobe/i)) {
    return mk('NO_FFMPEG', 'O ffmpeg não foi encontrado.', 'Rode "npm run setup" para baixá-lo.');
  }
  if (has(/No space left|ENOSPC/i)) return mk('NO_SPACE', 'O disco está cheio. Libere espaço e tente novamente.');
  if (has(/Unsupported URL/i)) return mk('INVALID_URL', 'Esse link não é suportado.');
  if (has(/timed out|Temporary failure|Connection reset|getaddrinfo/i)) {
    return mk('NETWORK', 'Falha de conexão com o YouTube.', 'Verifique sua internet e tente novamente.');
  }
  if (has(/Unable to download webpage/i)) {
    return mk('NETWORK', 'Não consegui acessar a página do vídeo.', 'Verifique sua internet ou tente outro link.');
  }
  return mk('DOWNLOAD_FAILED', 'Não foi possível baixar este vídeo.', line);
}

function pickThumbnail(info) {
  if (info.thumbnail) return info.thumbnail;
  const list = Array.isArray(info.thumbnails) ? info.thumbnails : [];
  return list.length ? list[list.length - 1].url : null;
}

const sizeOf = (f) => Number(f.filesize || f.filesize_approx || 0) || 0;
const isHttp = (f) => String(f.protocol || '').startsWith('http');

function estimateBytes(f, duration) {
  const known = sizeOf(f);
  if (known) return known;
  const kbps = Number(f.tbr || f.vbr || 0);
  if (kbps && duration) return Math.round((kbps * 1000 * duration) / 8);
  return 0;
}

function bestAudio(fmts) {
  const pool = fmts.filter((f) => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'));
  const http = pool.filter(isHttp);
  const usual = (http.length ? http : pool).filter((f) => {
    const kbps = Number(f.abr || f.tbr || 0);
    const channels = Number(f.audio_channels || 2);
    // Descarta faixas imersivas/experimentais (384 kbps, 5.1) que só inflam o arquivo.
    return kbps > 0 && kbps <= 320 && channels <= 2 && ['m4a', 'webm', 'mp4'].includes(f.ext);
  });
  const source = usual.length ? usual : pool;
  return source.sort((a, b) => {
    const known = (sizeOf(b) > 0) - (sizeOf(a) > 0);
    if (known) return known;
    return Number(b.abr || b.tbr || 0) - Number(a.abr || a.tbr || 0);
  })[0] || null;
}

/** Normaliza o JSON gigante do yt-dlp no que a interface precisa. */
export function summarize(info) {
  const duration = Number(info.duration) || 0;
  const fmts = Array.isArray(info.formats) ? info.formats : [];
  const audio = bestAudio(fmts);

  const heights = [...new Set(
    fmts
      .filter((f) => f.vcodec && f.vcodec !== 'none' && Number(f.height) > 0 && f.ext !== 'mhtml')
      .filter((f) => !f.format_note || !/storyboard/i.test(f.format_note))
      .map((f) => Number(f.height)),
  )].filter((h) => h >= 144 && h <= 4320).sort((a, b) => b - a);

  const video = heights.slice(0, 7).map((height) => {
    const candidates = fmts.filter((f) => f.vcodec && f.vcodec !== 'none' && Number(f.height) === height);
    // Variantes HLS (m3u8) mentem no bitrate e não têm tamanho; só usamos se não houver HTTP.
    const httpCandidates = candidates.filter(isHttp);
    const pool = httpCandidates.length ? httpCandidates : candidates;
    const byQuality = (a, b) => {
      const known = (sizeOf(b) > 0) - (sizeOf(a) > 0);
      if (known) return known;
      return Number(b.tbr || 0) - Number(a.tbr || 0);
    };
    const videoOnly = pool.filter((f) => !f.acodec || f.acodec === 'none').sort(byQuality);
    const progressive = pool.filter((f) => f.acodec && f.acodec !== 'none').sort(byQuality);
    // Vídeo isolado é o caminho normal; progressivo só entra se não houver vídeo separado.
    const best = videoOnly[0] || progressive[0] || {};
    const needsAudioTrack = Boolean(videoOnly[0]);
    const fps = Number(best.fps) || 0;
    const size = estimateBytes(best, duration) + (needsAudioTrack && audio ? estimateBytes(audio, duration) : 0);
    return {
      height,
      fps,
      label: `${height}p${fps >= 50 ? fps : ''}`,
      sizeBytes: size,
      approx: !sizeOf(best) || (needsAudioTrack && audio ? !sizeOf(audio) : false),
    };
  });

  const audioOptions = [320, 192, 128].map((bitrate) => ({
    bitrate,
    label: `${bitrate} kbps`,
    sizeBytes: duration ? Math.round((bitrate * 1000 * duration) / 8) : 0,
    approx: true,
  }));

  const rawDate = String(info.upload_date || '');
  const uploadDate = /^\d{8}$/.test(rawDate)
    ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
    : null;

  const liveStatus = String(info.live_status || '');

  const maxDurationMin = CONFIG.MAX_DURATION_MIN;

  return {
    id: info.id,
    url: `https://www.youtube.com/watch?v=${info.id}`,
    title: info.title || 'Vídeo do YouTube',
    channel: info.channel || info.uploader || info.channel_id || '',
    channelUrl: info.channel_url || info.uploader_url || null,
    duration,
    thumbnail: pickThumbnail(info),
    uploadDate,
    viewCount: Number(info.view_count) || 0,
    isLive: Boolean(info.is_live) || liveStatus === 'is_live' || liveStatus === 'is_upcoming',
    ageLimit: Number(info.age_limit) || 0,
    maxHeight: heights[0] || 0,
    video,
    audio: audioOptions,
    tooLong: maxDurationMin > 0 && duration > maxDurationMin * 60,
    maxDurationMin,
  };
}

const infoCache = new Map();

export async function getInfo(url, { cache = true } = {}) {
  if (cache) {
    const hit = infoCache.get(url);
    if (hit && Date.now() - hit.at < CONFIG.INFO_TTL_MS) return hit.value;
  }
  const args = [...baseArgs(), '--dump-single-json', '--skip-download', '--socket-timeout', '30', url];
  const { stdout } = await runCapture(args, { timeout: 90000 });
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  if (start < 0 || end <= start) throw new UserError('BAD_RESPONSE', 'O YouTube devolveu uma resposta inesperada.');
  let json;
  try {
    json = JSON.parse(stdout.slice(start, end + 1));
  } catch {
    throw new UserError('BAD_RESPONSE', 'Não consegui interpretar a resposta do YouTube.');
  }
  if (json._type === 'playlist' && Array.isArray(json.entries) && json.entries.length) {
    throw new UserError('PLAYLIST', 'Este link é de uma playlist. Abra o vídeo e copie o link dele.');
  }
  if (json.is_live || json.live_status === 'is_live') {
    throw new UserError('LIVE', 'Transmissões ao vivo não são suportadas. Tente quando o vídeo estiver publicado.');
  }

  const value = summarize(json);
  infoCache.set(url, { at: Date.now(), value });
  return value;
}

export function videoFormat(height) {
  const capped = `[height<=${height}]`;
  // Prefere H.264 (avc1) via DASH HTTP: toca em qualquer navegador e evita variantes HLS instáveis.
  return [
    `bv*[vcodec^=avc1][protocol^=http]${capped}+ba[ext=m4a][abr<=320][protocol^=http]`,
    `bv*[protocol^=http]${capped}+ba[ext=m4a][abr<=320][protocol^=http]`,
    `b[ext=mp4][protocol^=http]${capped}`,
    `bv*${capped}+ba`,
    `b${capped}`,
    'b',
  ].join('/');
}

const PROGRESS = '##P##';
const PHASE = '##F##';

function buildDownloadArgs({ url, mode, height, bitrate, dir, duration }) {
  const args = [
    ...baseArgs(),
    '--newline',
    '--socket-timeout', '30',
    '--retries', '3',
    '--fragment-retries', '3',
    '--concurrent-fragments', '4',
    '--no-overwrites',
    '--progress-template', `download:${PROGRESS}%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s`,
    '--print-to-file', 'after_move:filepath', path.join(dir, '.final'),
    '-o', path.join(dir, 'source.%(ext)s'),
  ];

  if (duration) args.push('--match-filter', `duration <= ${Math.round(duration) + 60}`);

  if (mode === 'audio') {
    args.push(
      '-f', 'ba[ext=m4a][abr<=320]/ba[ext=webm][abr<=320]/ba/b',
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', `${bitrate || 192}K`,
      '--embed-metadata',
    );
  } else {
    const maxBytes = CONFIG.MAX_FILESIZE_MB * 1024 * 1024;
    args.push(
      '-f', videoFormat(Number(height) || 1080),
      '--merge-output-format', 'mp4',
      '--max-filesize', String(maxBytes),
      '--embed-metadata',
    );
  }

  args.push(url);
  return args;
}

function finalFile(dir) {
  const marker = path.join(dir, '.final');
  try {
    const p = fs.readFileSync(marker, 'utf8').trim().split(/\r?\n/).filter(Boolean).pop();
    if (p && fs.existsSync(p)) return p;
  } catch { /* fallback abaixo */ }
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (!/\.(part|ytdl|final|temp)$/i.test(e.name)) files.push(full);
    }
  };
  walk(dir);
  files.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
  return files[0] || null;
}

/**
 * Baixa um vídeo/áudio. Resolve com o caminho final já renomeado.
 * onSpawn recebe o processo para permitir cancelamento.
 */
export function downloadVideo({
  url, mode = 'video', height = 1080, bitrate = 192, dir,
  title = 'video', videoId = '', duration = 0, expectedBytes = 0,
  onProgress = () => {}, onPhase = () => {}, onSpawn = () => {},
}) {
  fs.mkdirSync(dir, { recursive: true });
  const args = buildDownloadArgs({ url, mode, height, bitrate, dir, duration });

  return new Promise((resolve, reject) => {
    const child = spawn(PATHS.ytdlp, args, {
      windowsHide: true,
      detached: process.platform !== 'win32',
    });
    onSpawn(child);

    let stdoutBuf = '';
    let err = '';
    let lastPush = 0;
    let settled = false;
    let streamBase = 0;
    let currentTotal = 0;
    let currentDown = 0;

    const handleLine = (raw) => {
      const line = clean(raw);
      if (!line) return;

      if (line.startsWith(PROGRESS)) {
        const [down, total, totalEst, speed, eta] = line.slice(PROGRESS.length).split('|');
        currentDown = Number(down) || 0;
        currentTotal = Number(total) || Number(totalEst) || 0;
        const now = Date.now();
        if (now - lastPush > 300) {
          lastPush = now;
          const done = streamBase + currentDown;
          const combined = expectedBytes > 0 ? expectedBytes : streamBase + currentTotal;
          onProgress({
            downloadedBytes: done,
            totalBytes: combined,
            speed: Number(speed) || 0,
            eta: Number(eta) || 0,
          });
        }
        return;
      }
      if (line.startsWith(PHASE)) { onPhase(line.slice(PHASE.length)); return; }

      if (/\[(Merger|ExtractAudio|VideoConvertor|FixupM3u8|Metadata|EmbedThumbnail|MoveFiles)\]/i.test(line)) {
        onPhase('CONVERTING');
      } else if (/^\[download\] Destination:/i.test(line)) {
        // Cada novo arquivo (vídeo e depois áudio) soma ao total já baixado.
        if (currentDown > 0) {
          streamBase += currentTotal || currentDown;
          currentDown = 0;
          currentTotal = 0;
        }
        onPhase('DOWNLOADING');
      }
    };

    child.stdout.on('data', (chunk) => {
      stdoutBuf += chunk;
      const parts = stdoutBuf.split(/\r?\n/);
      stdoutBuf = parts.pop() || '';
      for (const p of parts) handleLine(p);
    });
    child.stderr.on('data', (chunk) => {
      err += chunk;
      if (err.length > 2e5) err = err.slice(-1e5);
    });
    child.on('error', (e) => {
      if (settled) return;
      settled = true;
      reject(e.code === 'ENOENT'
        ? new UserError('NO_BINARY', 'O yt-dlp não está instalado. Rode "npm run setup".')
        : new UserError('SPAWN', 'Não consegui iniciar o yt-dlp.', e.message));
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      if (stdoutBuf) handleLine(stdoutBuf);
      if (code !== 0) return reject(mapError(err || 'Falha no download.'));

      const found = finalFile(dir);
      if (!found) return reject(new UserError('NO_FILE', 'O download terminou mas o arquivo não foi encontrado.'));

      const ext = path.extname(found).slice(1) || (mode === 'audio' ? 'mp3' : 'mp4');
      const target = path.join(dir, `${videoId || 'video'}.${ext}`);
      try {
        if (path.resolve(found) !== path.resolve(target)) {
          if (fs.existsSync(target)) fs.rmSync(target, { force: true });
          fs.renameSync(found, target);
        }
        fs.rmSync(path.join(dir, '.final'), { force: true });
      } catch (e) {
        logger.warn('ytdlp.rename_failed', { error: e.message });
        return resolve({ filePath: found, ext, size: fs.statSync(found).size });
      }
      resolve({ filePath: target, ext, size: fs.statSync(target).size });
    });
  });
}

/** Executa um download simulado: valida rede, cookies, JS runtime e extração. */
export async function diagnose(url) {
  const args = [...baseArgs(), '--simulate', '--socket-timeout', '20', url];
  const started = Date.now();
  await runCapture(args, { timeout: 60000 });
  return { ok: true, ms: Date.now() - started };
}
