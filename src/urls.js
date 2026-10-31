'use strict';
// Validação estrita de links do YouTube — nada além de hosts e IDs conhecidos.

const ID_RE = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

export class UrlError extends Error {
  constructor(message) {
    super(message);
    this.code = 'INVALID_URL';
  }
}

/** Extrai o ID de 11 caracteres de um link do YouTube. Lança UrlError se inválido. */
export function parseYouTubeUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) throw new UrlError('Cole o link de um vídeo do YouTube.');
  if (raw.length > 2048) throw new UrlError('Link muito longo para ser válido.');

  // ID "solto" também é aceito.
  if (ID_RE.test(raw)) return { id: raw, url: `https://www.youtube.com/watch?v=${raw}` };

  let parsed;
  try {
    parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new UrlError('Isso não parece um link válido.');
  }

  if (!HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new UrlError('Por enquanto só links do YouTube são aceitos (youtube.com ou youtu.be).');
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  let id = '';

  if (parsed.hostname.endsWith('youtu.be')) {
    id = segments[0] || '';
  } else if (parsed.pathname === '/watch') {
    id = parsed.searchParams.get('v') || '';
  } else if (['shorts', 'live', 'embed', 'v'].includes(segments[0])) {
    id = segments[1] || '';
  }

  if (!id || !ID_RE.test(id)) {
    if (parsed.searchParams.get('list')) {
      throw new UrlError('Este link é de uma playlist. Abra o vídeo e copie o link dele.');
    }
    throw new UrlError('Não encontrei um vídeo nesse link. Confira se ele abre um vídeo no YouTube.');
  }

  return { id, url: `https://www.youtube.com/watch?v=${id}` };
}

/** Nome de arquivo seguro para Windows/macOS/Linux. */
export function safeFileName(title, id, ext) {
  const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
  let name = String(title || 'video')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/, '')
    .trim()
    .slice(0, 80)
    .trim();

  if (!name) name = 'video';
  if (RESERVED.test(name)) name = `_${name}`;
  return `${name} [${id}].${ext}`;
}
