#!/usr/bin/env node
/**
 * Baixa os binários necessários para bin/:
 *   - yt-dlp  (motor de download)
 *   - ffmpeg  (merge de vídeo+áudio e extração de MP3)
 *
 * Uso:
 *   npm run setup
 *   npm run update:ytdlp      (atualiza apenas o yt-dlp)
 *   node scripts/setup-bin.mjs --force
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN = path.join(ROOT, 'bin');
const TMP = path.join(ROOT, 'storage', 'tmp');
const isWin = process.platform === 'win32';
const args = new Set(process.argv.slice(2));
const force = args.has('--force');
const ytdlpOnly = args.has('--ytdlp-only');

const YTDLP_URL = isWin
  ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
  : process.platform === 'darwin'
    ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos'
    : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';

const FFMPEG_URLS = isWin
  ? [
      'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip',
      'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
    ]
  : [
      'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz',
    ];

const label = (s) => `\x1b[36m${s}\x1b[0m`;
const ok = (s) => `\x1b[32m${s}\x1b[0m`;
const warn = (s) => `\x1b[33m${s}\x1b[0m`;
const bad = (s) => `\x1b[31m${s}\x1b[0m`;

function human(bytes) {
  const u = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}

async function download(url, dest, name) {
  process.stdout.write(`  ${label('↓')} ${name} ... `);
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; TubeGrab setup)' },
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} ao baixar ${name}`);
  const total = Number(res.headers.get('content-length') || 0);
  let done = 0;
  let lastPct = -1;
  const body = Readable.fromWeb(res.body);
  body.on('data', (chunk) => {
    done += chunk.length;
    if (!total) return;
    const pct = Math.floor((done / total) * 100);
    if (pct !== lastPct && pct % 5 === 0) {
      lastPct = pct;
      process.stdout.write(`\r  ${label('↓')} ${name} ... ${String(pct).padStart(3)}%  ${human(done)}/${human(total)}   `);
    }
  });
  await pipeline(body, fs.createWriteStream(dest));
  process.stdout.write(`\r  ${ok('✓')} ${name} — ${human(done)}${' '.repeat(18)}\n`);
}

function findFile(dir, name) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(full, name);
      if (found) return found;
    } else if (entry.name.toLowerCase() === name.toLowerCase()) {
      return full;
    }
  }
  return null;
}

function extract(archive, dest) {
  fs.mkdirSync(dest, { recursive: true });
  let r = spawnSync('tar', ['-xf', archive, '-C', dest], { stdio: 'ignore' });
  if (r.status === 0) return;
  if (isWin) {
    r = spawnSync('powershell', [
      '-NoProfile', '-Command',
      `Expand-Archive -LiteralPath '${archive.replace(/'/g, "''")}' -DestinationPath '${dest.replace(/'/g, "''")}' -Force`,
    ], { stdio: 'ignore' });
    if (r.status === 0) return;
  }
  throw new Error('Não foi possível extrair o arquivo (tar/PowerShell falharam).');
}

function version(exe, args = ['--version']) {
  const r = spawnSync(exe, args, { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  if (r.status !== 0) return null;
  return (r.stdout || '').split('\n')[0].trim();
}

async function setupYtdlp() {
  const exe = path.join(BIN, isWin ? 'yt-dlp.exe' : 'yt-dlp');
  if (fs.existsSync(exe) && !force) {
    console.log(`  ${ok('✓')} yt-dlp já instalado (${version(exe) || 'versão desconhecida'})`);
    return;
  }
  const tmpFile = path.join(TMP, isWin ? 'yt-dlp.exe' : 'yt-dlp');
  await download(YTDLP_URL, tmpFile, 'yt-dlp');
  fs.copyFileSync(tmpFile, exe);
  if (!isWin) fs.chmodSync(exe, 0o755);
  fs.rmSync(tmpFile, { force: true });
  const v = version(exe);
  if (!v) throw new Error('yt-dlp baixado, mas não executou. Verifique antivírus/permissões.');
  console.log(`  ${ok('✓')} yt-dlp ${v}`);
}

async function setupFfmpeg() {
  const exeName = isWin ? 'ffmpeg.exe' : 'ffmpeg';
  const probeName = isWin ? 'ffprobe.exe' : 'ffprobe';
  const exe = path.join(BIN, exeName);
  if (fs.existsSync(exe) && !force) {
    console.log(`  ${ok('✓')} ffmpeg já instalado (${version(exe, ['-version']) || 'versão desconhecida'})`);
    return;
  }
  const work = path.join(TMP, 'ffmpeg-extract');
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });

  let lastErr;
  for (const url of FFMPEG_URLS) {
    try {
      const archive = path.join(TMP, isWin ? 'ffmpeg.zip' : 'ffmpeg.tar.xz');
      await download(url, archive, 'ffmpeg');
      extract(archive, work);
      fs.rmSync(archive, { force: true });
      const found = findFile(work, exeName);
      if (!found) throw new Error('ffmpeg não encontrado dentro do arquivo baixado.');
      fs.copyFileSync(found, exe);
      if (!isWin) fs.chmodSync(exe, 0o755);
      const probe = findFile(work, probeName);
      if (probe) {
        fs.copyFileSync(probe, path.join(BIN, probeName));
        if (!isWin) fs.chmodSync(path.join(BIN, probeName), 0o755);
      }
      console.log(`  ${ok('✓')} ${version(exe, ['-version']) || 'ffmpeg instalado'}`);
      fs.rmSync(work, { recursive: true, force: true });
      return;
    } catch (err) {
      lastErr = err;
      console.log(`\n  ${warn('!')} falhou: ${err.message} — tentando espelho...`);
      fs.rmSync(work, { recursive: true, force: true });
      fs.mkdirSync(work, { recursive: true });
    }
  }
  throw lastErr || new Error('Não foi possível baixar o ffmpeg.');
}

async function main() {
  console.log(`\n${label('TubeGrab')} — preparando binários em ${path.relative(ROOT, BIN) || '.'}/\n`);
  fs.mkdirSync(BIN, { recursive: true });
  fs.mkdirSync(TMP, { recursive: true });

  await setupYtdlp();
  if (!ytdlpOnly) await setupFfmpeg();

  console.log(`\n${ok('Tudo pronto.')} Rode ${label('npm start')} e abra http://localhost:3100\n`);
}

main().catch((err) => {
  console.error(`\n${bad('Falhou:')} ${err.message}\n`);
  console.error('Dica: verifique sua conexão e tente novamente. Se o download do ffmpeg');
  console.error('continuar falhando, baixe manualmente em https://www.gyan.dev/ffmpeg/builds/');
  console.error(`e copie ffmpeg.exe para ${BIN}\n`);
  process.exitCode = 1;
});
