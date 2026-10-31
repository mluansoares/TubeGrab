'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYouTubeUrl, safeFileName, UrlError } from '../src/urls.js';
import { mapError, summarize, videoFormat } from '../src/ytdlp.js';

test('aceita os formatos de link mais comuns', () => {
  const cases = [
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ&list=PL123', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=42s', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?t=10', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://music.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ];
  for (const [input, id] of cases) {
    assert.equal(parseYouTubeUrl(input).id, id, input);
  }
});

test('rejeita links que não são de vídeo do YouTube', () => {
  const invalid = [
    '',
    'https://vimeo.com/123',
    'https://www.youtube.com/playlist?list=PL123',
    'https://www.youtube.com/watch?v=curto',
    'https://evil.com/watch?v=dQw4w9WgXcQ',
    'javascript:alert(1)',
    'https://www.youtube.com/',
  ];
  for (const input of invalid) {
    assert.throws(() => parseYouTubeUrl(input), UrlError, input);
  }
});

test('gera nome de arquivo seguro', () => {
  assert.equal(safeFileName('A/B: "teste"?', 'dQw4w9WgXcQ', 'mp4'), 'A B teste [dQw4w9WgXcQ].mp4');
  assert.equal(safeFileName('', 'dQw4w9WgXcQ', 'mp3'), 'video [dQw4w9WgXcQ].mp3');
  assert.equal(safeFileName('CON', 'dQw4w9WgXcQ', 'mp4'), '_CON [dQw4w9WgXcQ].mp4');
  assert.ok(safeFileName('x'.repeat(300), 'dQw4w9WgXcQ', 'mp4').length < 110);
});

test('traduz erros conhecidos do yt-dlp', () => {
  const cases = [
    ['ERROR: [youtube] abc: Sign in to confirm you\'re not a bot.', 'BOT_CHECK'],
    ['ERROR: [youtube] abc: Private video. Sign in if you\'ve been granted access', 'PRIVATE'],
    ['ERROR: [youtube] abc: Video unavailable', 'UNAVAILABLE'],
    ['ERROR: requested format not available', 'FORMAT'],
    ['ERROR: ffmpeg not found. Please install', 'NO_FFMPEG'],
    ['ERROR: HTTP Error 429: Too Many Requests', 'RATE_LIMIT'],
    ['ERROR: unable to download video data: HTTP Error 403: Forbidden', 'FORBIDDEN'],
    ['ERROR: algo totalmente desconhecido', 'DOWNLOAD_FAILED'],
  ];
  for (const [text, code] of cases) {
    assert.equal(mapError(text).code, code, text);
  }
});

test('resume metadados e calcula tamanhos aproximados', () => {
  const info = {
    id: 'dQw4w9WgXcQ',
    title: 'Vídeo de teste',
    channel: 'Canal',
    duration: 60,
    thumbnail: 'https://i.ytimg.com/vi/x/hq.jpg',
    upload_date: '20240102',
    view_count: 1234,
    formats: [
      { format_id: '137', ext: 'mp4', vcodec: 'avc1', acodec: 'none', height: 1080, fps: 30, tbr: 4000, filesize: 30_000_000 },
      { format_id: '136', ext: 'mp4', vcodec: 'avc1', acodec: 'none', height: 720, fps: 30, tbr: 2000 },
      { format_id: '140', ext: 'm4a', vcodec: 'none', acodec: 'mp4a', abr: 128, filesize: 1_000_000 },
      { format_id: '18', ext: 'mp4', vcodec: 'avc1', acodec: 'mp4a', height: 360, tbr: 700 },
    ],
  };
  const out = summarize(info);
  assert.equal(out.id, 'dQw4w9WgXcQ');
  assert.equal(out.uploadDate, '2024-01-02');
  assert.deepEqual(out.video.map((v) => v.height), [1080, 720, 360]);
  assert.equal(out.video[0].sizeBytes, 31_000_000);
  assert.equal(out.video[1].approx, true);
  assert.equal(out.audio.length, 3);
  assert.equal(out.audio.find((a) => a.bitrate === 192).sizeBytes, 1_440_000);
  assert.equal(out.isLive, false);
});

test('monta o seletor de formato com teto de resolução', () => {
  const selector = videoFormat(720);
  assert.match(selector, /height<=720/);
  // Primeira opção: vídeo H.264 via HTTP + áudio m4a de até 320 kbps.
  assert.match(selector.split('/')[0], /^bv\*\[vcodec\^=avc1\]/);
  assert.match(selector.split('/')[0], /ba\[ext=m4a\]\[abr<=320\]/);
});
