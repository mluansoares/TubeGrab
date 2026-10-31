/* TubeGrab — SPA sem framework. */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ACTIVE = ['QUEUED', 'DOWNLOADING', 'CONVERTING'];
const STATUS_LABEL = {
  QUEUED: 'na fila',
  DOWNLOADING: 'baixando',
  CONVERTING: 'convertendo',
  COMPLETED: 'concluído',
  FAILED: 'falhou',
  CANCELED: 'cancelado',
};

const state = {
  info: null,
  mode: 'video',
  quality: null,
  jobs: [],
  cards: new Map(),
  polling: false,
  timer: null,
  busy: false,
  health: null,
  token: localStorage.getItem('tg_token') || '',
};

/* ---------------- utilidades ---------------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

function fmtBytes(bytes, decimals = 0) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = n;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i += 1; }
  const fixed = i === 0 ? 0 : decimals ?? (value >= 100 ? 0 : value >= 10 ? 1 : 2);
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: fixed })} ${units[i]}`;
}

function fmtDuration(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (x) => String(x).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

function fmtEta(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  if (!s) return '';
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} min ${r} s` : `${m} min`;
}

function fmtViews(n) {
  if (!n) return '';
  const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  return `${compact} visualizações`;
}

function fmtDate(iso) {
  if (!iso) return '';
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return ''; }
}

function relTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - Date.parse(iso);
  if (!Number.isFinite(diff) || diff < 0) return '';
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'ontem';
  if (d < 7) return `há ${d} dias`;
  return new Date(iso).toLocaleDateString('pt-BR');
}

/* ---------------- API ---------------- */
// O player e os links de download passam por <img>/<video>/<a>, que não enviam
// header customizado: nesses casos o token vai na query string.
function withToken(url) {
  if (!state.token || !url) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(state.token)}`;
}

async function api(path, options = {}) {
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}) };
  if (state.token) headers['x-access-token'] = state.token;
  const res = await fetch(path, {
    ...options,
    headers,
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
  });
  if (res.status === 401) {
    showLock();
    throw Object.assign(new Error('Este servidor exige um token de acesso.'), { code: 'UNAUTHORIZED' });
  }
  let data = {};
  try { data = await res.json(); } catch { /* resposta vazia */ }
  if (!res.ok) {
    throw Object.assign(new Error(data.message || `Falha inesperada (${res.status}).`), {
      code: data.code || 'ERROR',
      detail: data.detail || '',
    });
  }
  return data;
}

/* ---------------- avisos ---------------- */
const ERROR_TITLES = {
  INVALID_URL: 'Link inválido',
  BOT_CHECK: 'O YouTube pediu verificação',
  TOO_LONG: 'Vídeo muito longo',
  TOO_BIG: 'Arquivo muito grande',
  NO_SPACE: 'Sem espaço em disco',
  RATE_LIMIT: 'Muitos pedidos',
  LIVE: 'Transmissão ao vivo',
  PRIVATE: 'Vídeo privado',
  MEMBERS: 'Conteúdo para membros',
  AGE: 'Restrição de idade',
  GEO: 'Bloqueio regional',
  UNAVAILABLE: 'Vídeo indisponível',
  NO_BINARY: 'Ferramentas ausentes',
  NO_FFMPEG: 'ffmpeg ausente',
  NETWORK: 'Falha de conexão',
  FORMAT: 'Qualidade indisponível',
};

function showError(err) {
  $('#errorTitle').textContent = ERROR_TITLES[err.code] || 'Não deu certo';
  $('#errorMessage').textContent = err.message || 'Tente novamente.';
  const detail = err.detail ? String(err.detail).slice(0, 400) : '';
  const detailEl = $('#errorDetail');
  detailEl.textContent = detail;
  detailEl.classList.toggle('hidden', !detail);
  $('#errorBox').classList.remove('hidden');
}

function hideError() {
  $('#errorBox').classList.add('hidden');
}

function toast(type, title, message = '', ms = 4500) {
  const wrap = document.createElement('div');
  wrap.className = `toast ${type}`;
  wrap.innerHTML = `
    <span class="toast-icon" aria-hidden="true">${type === 'success' ? '✓' : type === 'error' ? '!' : 'i'}</span>
    <div class="toast-body"><strong>${esc(title)}</strong>${message ? `<p>${esc(message)}</p>` : ''}</div>`;
  $('#toasts').appendChild(wrap);
  setTimeout(() => {
    wrap.classList.add('out');
    setTimeout(() => wrap.remove(), 260);
  }, ms);
}

/* ---------------- saúde ---------------- */
async function loadHealth() {
  try {
    const h = await api('/api/health');
    state.health = h;
    const dot = $('#healthDot');
    const ready = h.ok && h.ffmpeg;
    dot.dataset.state = ready ? 'ok' : h.ok ? 'warn' : 'bad';
    $('#healthText').textContent = ready ? 'pronto' : h.ok ? 'sem ffmpeg' : 'sem yt-dlp';
    $('#diagBtn').title = `yt-dlp ${h.ytdlp || 'ausente'} · ffmpeg ${h.ffmpeg ? 'ok' : 'ausente'} · Node ${h.node}`;
    $('#factRetention').textContent = `${h.limits.retentionDays} dias`;
    const durLimit = h.limits.maxDurationMin;
    $('#factLimits').textContent = `${durLimit > 0 ? `${durLimit} min` : 'sem limite'} · ${h.limits.maxFilesizeMb} MB`;
    $('#factDisk').textContent = h.disk ? `${fmtBytes(h.disk.freeBytes)} livres` : '—';
    $('#footStats').textContent = `yt-dlp ${h.ytdlp || 'ausente'} · ffmpeg ${h.ffmpeg ? 'ok' : 'ausente'} · Node ${h.node}`;
  } catch {
    $('#healthDot').dataset.state = 'bad';
    $('#healthText').textContent = 'offline';
  }
}

/* ---------------- analisar link ---------------- */
function setBusy(btn, busy) {
  btn.classList.toggle('loading', busy);
  btn.disabled = busy;
}

async function analyze(rawUrl) {
  if (state.busy) return;
  const url = String(rawUrl ?? $('#urlInput').value).trim();
  if (!url) {
    showError(Object.assign(new Error('Cole o link de um vídeo do YouTube para começar.'), { code: 'INVALID_URL' }));
    $('#urlInput').focus();
    return;
  }

  state.busy = true;
  hideError();
  setBusy($('#analyzeBtn'), true);
  $('#result').classList.add('hidden');
  $('#skeleton').classList.remove('hidden');

  try {
    const info = await api('/api/info', { method: 'POST', body: { url } });
    state.info = info;
    state.mode = 'video';
    state.quality = defaultQuality();
    renderResult();
    $('#result').classList.remove('hidden');
    $('#result').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (err) {
    showError(err);
    if (err.code !== 'UNAUTHORIZED') toast('error', ERROR_TITLES[err.code] || 'Não deu certo', err.message);
  } finally {
    state.busy = false;
    setBusy($('#analyzeBtn'), false);
    $('#skeleton').classList.add('hidden');
  }
}

function defaultQuality() {
  if (!state.info) return null;
  if (state.mode === 'audio') return 192;
  const heights = state.info.video.map((v) => v.height).filter((h) => h > 0);
  if (!heights.length) return 0;
  if (heights.includes(1080)) return 1080;
  return heights[0];
}

function currentOptions() {
  if (!state.info) return [];
  if (state.mode === 'audio') return state.info.audio;
  if (state.info.video.length) return state.info.video;
  return [{ height: 0, label: 'Melhor disponível', sizeBytes: 0, approx: true }];
}

function selectedOption() {
  return currentOptions().find((o) => (o.height ?? o.bitrate) === state.quality) || currentOptions()[0];
}

function renderResult() {
  const info = state.info;
  if (!info) return;
  const options = currentOptions();
  const selected = selectedOption();
  const qualityKey = (o) => (state.mode === 'audio' ? o.bitrate : o.height);
  const chips = options.map((o) => {
    const key = qualityKey(o);
    const sub = o.sizeBytes ? `~${fmtBytes(o.sizeBytes)}${o.approx ? '' : ''}` : 'tamanho variável';
    return `<button type="button" class="chip ${key === state.quality ? 'active' : ''}" data-q="${key}">
      <strong>${esc(o.label)}${o.fps >= 50 ? '' : ''}</strong><span>${sub}</span>
    </button>`;
  }).join('');

  const estimated = selected?.sizeBytes || 0;
  const metaBits = [
    fmtViews(info.viewCount),
    fmtDate(info.uploadDate),
    info.duration ? fmtDuration(info.duration) : '',
  ].filter(Boolean).map((t) => `<span>${esc(t)}</span>`).join('');

  const warning = info.tooLong
    ? `<div class="note-warn">Este vídeo passa do limite de ${info.maxDurationMin} minutos configurado neste computador.</div>`
    : '';

  $('#result').innerHTML = `
    <div class="result-grid">
      <div class="preview">
        ${info.thumbnail ? `<img src="${esc(info.thumbnail)}" alt="Miniatura do vídeo" referrerpolicy="no-referrer">` : ''}
        ${info.duration ? `<span class="dur">${fmtDuration(info.duration)}</span>` : ''}
      </div>
      <div class="result-body">
        <div class="channel-row"><span class="channel-dot"></span>${esc(info.channel || 'YouTube')}</div>
        <h2 class="result-title">${esc(info.title)}</h2>
        <div class="result-meta">${metaBits}</div>
        <div class="seg" role="tablist" aria-label="Formato do arquivo">
          <button type="button" data-mode="video" class="${state.mode === 'video' ? 'active' : ''}" role="tab" aria-selected="${state.mode === 'video'}">Vídeo <small>MP4</small></button>
          <button type="button" data-mode="audio" class="${state.mode === 'audio' ? 'active' : ''}" role="tab" aria-selected="${state.mode === 'audio'}">Áudio <small>MP3</small></button>
        </div>
        <div class="chips" id="chips">${chips}</div>
        ${warning}
        <div class="download-row">
          <button type="button" class="primary-btn big" id="downloadBtn" ${info.tooLong ? 'disabled' : ''}>
            <span class="btn-label">Baixar ${state.mode === 'audio' ? 'áudio' : 'vídeo'} em ${state.mode === 'audio' ? 'MP3' : 'MP4'}</span>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4v11m0 0l4-4m-4 4l-4-4M5 19h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <span class="estimate">${estimated ? `~${fmtBytes(estimated)} estimados` : 'tamanho estimado indisponível'}<br>vai para storage/videos</span>
        </div>
      </div>
    </div>`;
}

$('#result').addEventListener('click', (e) => {
  const modeBtn = e.target.closest('[data-mode]');
  if (modeBtn) {
    const mode = modeBtn.dataset.mode;
    if (mode === state.mode) return;
    state.mode = mode;
    state.quality = defaultQuality();
    renderResult();
    return;
  }

  const chip = e.target.closest('[data-q]');
  if (chip) {
    state.quality = Number(chip.dataset.q);
    $$('#chips .chip').forEach((c) => c.classList.toggle('active', c === chip));
    const opt = selectedOption();
    const estimate = $('.estimate');
    if (estimate) {
      estimate.innerHTML = `${opt?.sizeBytes ? `~${fmtBytes(opt.sizeBytes)} estimados` : 'tamanho estimado indisponível'}<br>vai para storage/videos`;
    }
    return;
  }

  if (e.target.closest('#downloadBtn')) startDownload();
});

async function startDownload() {
  if (!state.info) return;
  const btn = $('#downloadBtn');
  if (!btn || btn.disabled) return;
  setBusy(btn, true);
  try {
    await api('/api/jobs', {
      method: 'POST',
      body: { url: state.info.url, mode: state.mode, quality: state.quality },
    });
    toast('success', 'Download adicionado à fila', 'Você pode acompanhar o progresso logo abaixo.');
    $('#result').classList.add('hidden');
    $('#urlInput').value = '';
    state.info = null;
    refreshJobs();
    document.querySelector('#downloads').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    showError(err);
    toast('error', ERROR_TITLES[err.code] || 'Não deu certo', err.message);
  } finally {
    if (btn.isConnected) setBusy(btn, false);
  }
}

/* ---------------- downloads ---------------- */
const ICON = {
  play: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 5.5v13l10-6.5-10-6.5z" fill="currentColor"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4v11m0 0l4-4m-4 4l-4-4M5 19h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h3.6l1.8 2h7.6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-9z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 7h14M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7m-8 0l.8 11a2 2 0 0 0 2 1.9h4.4a2 2 0 0 0 2-1.9L17 7M10 11v5m4-5v5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cancel: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  retry: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66M20 5v5h-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function buildCard(job) {
  const card = document.createElement('article');
  card.className = 'job';
  card.dataset.id = job.id;
  card.innerHTML = `
    <div class="job-thumb">
      <img alt="" loading="lazy" referrerpolicy="no-referrer">
      <span class="badge"></span>
    </div>
    <div class="job-main">
      <div class="job-top"><span class="job-title"></span><span class="pill"></span></div>
      <div class="job-sub"></div>
      <div class="bar"><i></i></div>
      <div class="job-meta"></div>
    </div>
    <div class="job-actions"></div>`;
  return card;
}

function actionsFor(job) {
  if (ACTIVE.includes(job.status)) {
    return `<button class="act danger" type="button" data-act="cancel" title="Cancelar download" aria-label="Cancelar download">${ICON.cancel}</button>`;
  }
  if (job.status === 'COMPLETED') {
    return `
      <button class="act primary" type="button" data-act="play" title="Prévia" aria-label="Prévia">${ICON.play}</button>
      <a class="act" href="${withToken(job.downloadUrl)}" download title="Baixar arquivo" aria-label="Baixar arquivo">${ICON.download}</a>
      <button class="act" type="button" data-act="reveal" title="Abrir pasta" aria-label="Abrir pasta">${ICON.folder}</button>
      <button class="act danger" type="button" data-act="delete" title="Apagar" aria-label="Apagar">${ICON.trash}</button>`;
  }
  return `
    <button class="act" type="button" data-act="retry" title="Tentar de novo" aria-label="Tentar de novo">${ICON.retry}</button>
    <button class="act danger" type="button" data-act="delete" title="Remover" aria-label="Remover">${ICON.trash}</button>`;
}

function updateCard(card, job) {
  const prevStatus = card.dataset.status;
  const prevThumb = card.dataset.thumb;
  card.dataset.status = job.status;

  const img = $('img', card);
  if (job.thumbnail && job.thumbnail !== prevThumb) {
    img.src = job.thumbnail;
    card.dataset.thumb = job.thumbnail;
  }
  img.alt = job.title || 'Miniatura';

  const badge = $('.badge', card);
  badge.textContent = job.mode === 'audio' ? 'MP3' : 'MP4';
  badge.className = `badge ${job.mode === 'audio' ? 'audio' : 'video'}`;

  $('.job-title', card).textContent = job.title || 'Vídeo';
  const pill = $('.pill', card);
  pill.textContent = STATUS_LABEL[job.status] || job.status;
  pill.dataset.s = job.status;

  const sub = $('.job-sub', card);
  sub.innerHTML = [
    job.channel ? esc(job.channel) : '',
    job.quality ? esc(job.quality) : '',
  ].filter(Boolean).map((t) => `<span>${t}</span>`).join('');

  const bar = $('.bar', card);
  const fill = $('i', bar);
  const active = ACTIVE.includes(job.status);
  bar.classList.toggle('hidden', !active);
  bar.classList.toggle('indeterminate', active && job.status === 'DOWNLOADING' && !job.totalBytes);
  fill.style.width = active ? `${Math.max(0, Math.min(100, job.progress || 0))}%` : '0%';

  const meta = $('.job-meta', card);
  meta.innerHTML = metaFor(job);

  if (prevStatus !== job.status || !$('.job-actions', card).childElementCount) {
    $('.job-actions', card).innerHTML = actionsFor(job);
  }
}

function metaFor(job) {
  const sep = '<span>·</span>';
  if (job.status === 'QUEUED') {
    return `<span>aguardando a vez</span>${sep}<span>${esc(relTime(job.createdAt))}</span>`;
  }
  if (job.status === 'DOWNLOADING') {
    const totalLabel = job.totalBytes ? `${job.totalBytesApprox ? '~' : ''}${fmtBytes(job.totalBytes)}` : '';
    const size = totalLabel
      ? `${fmtBytes(job.downloadedBytes)} de ${totalLabel}`
      : `${fmtBytes(job.downloadedBytes)} baixados`;
    const speed = job.speed > 0 ? `${fmtBytes(job.speed, 1)}/s` : '';
    const eta = job.eta > 0 ? `faltam ${fmtEta(job.eta)}` : '';
    return [size, speed, eta].filter(Boolean).map((t) => `<span>${esc(t)}</span>`).join(sep);
  }
  if (job.status === 'CONVERTING') {
    return `<span>${job.mode === 'audio' ? 'extraindo o áudio em MP3' : 'juntando vídeo e áudio'}…</span>`;
  }
  if (job.status === 'COMPLETED') {
    return [
      fmtBytes(job.sizeBytes),
      job.duration ? fmtDuration(job.duration) : '',
      relTime(job.finishedAt || job.createdAt),
    ].filter(Boolean).map((t) => `<span>${esc(t)}</span>`).join(sep);
  }
  if (job.status === 'FAILED') {
    return `<span class="err">${esc(job.error || 'falhou')}</span>`;
  }
  return `<span>cancelado</span>${sep}<span>${esc(relTime(job.createdAt))}</span>`;
}

function renderJobs() {
  const list = state.jobs;
  const wrap = document.getElementById('jobsList');
  const empty = document.getElementById('emptyState');
  empty.classList.toggle('hidden', list.length > 0);

  const seen = new Set(list.map((j) => j.id));
  for (const [id, card] of state.cards) {
    if (!seen.has(id)) { card.remove(); state.cards.delete(id); }
  }

  let prev = null;
  for (const job of list) {
    let card = state.cards.get(job.id);
    if (!card) {
      card = buildCard(job);
      state.cards.set(job.id, card);
    }
    updateCard(card, job);
    const expected = prev ? prev.nextSibling : wrap.firstChild;
    if (expected !== card) wrap.insertBefore(card, expected);
    prev = card;
  }
}

function updateQueueLine(queue) {
  const line = document.getElementById('queueLine');
  if (!queue) return;
  const bits = [];
  if (queue.running) bits.push(`${queue.running} baixando agora`);
  if (queue.queued) bits.push(`${queue.queued} na fila`);
  line.textContent = bits.length ? bits.join(' · ') : 'Tudo o que você baixou fica aqui.';
}

async function refreshJobs(manual = false) {
  if (state.polling) return;
  state.polling = true;
  const refresh = document.getElementById('refreshBtn');
  if (manual) refresh.classList.add('spinning');
  try {
    const data = await api('/api/jobs');
    state.jobs = data.jobs || [];
    renderJobs();
    updateQueueLine(data.queue);
  } catch (err) {
    if (manual) toast('error', 'Não consegui atualizar', err.message);
  } finally {
    state.polling = false;
    refresh.classList.remove('spinning');
    const hasActive = state.jobs.some((j) => ACTIVE.includes(j.status));
    clearTimeout(state.timer);
    state.timer = setTimeout(() => refreshJobs(), hasActive ? 1000 : document.hidden ? 15000 : 5000);
  }
}

document.getElementById('jobsList').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const card = btn.closest('.job');
  const job = state.jobs.find((j) => j.id === card?.dataset.id);
  if (!job) return;
  const act = btn.dataset.act;

  if (act === 'play') { openPlayer(job); return; }

  if (act === 'cancel') {
    btn.disabled = true;
    try {
      await api(`/api/jobs/${job.id}/cancel`, { method: 'POST' });
      toast('info', 'Download cancelado', 'O arquivo parcial foi removido.');
      refreshJobs();
    } catch (err) {
      btn.disabled = false;
      toast('error', 'Não consegui cancelar', err.message);
    }
    return;
  }

  if (act === 'reveal') {
    try {
      await api(`/api/jobs/${job.id}/reveal`, { method: 'POST' });
      toast('info', 'Abrindo a pasta', 'O arquivo foi selecionado no Explorador.');
    } catch (err) {
      toast('error', 'Não consegui abrir a pasta', err.message);
    }
    return;
  }

  if (act === 'delete') {
    const ok = await confirmDialog({
      title: 'Apagar este arquivo?',
      text: 'O arquivo sai do disco e o item desaparece da lista. Não dá para desfazer.',
      confirmLabel: 'Apagar',
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/jobs/${job.id}`, { method: 'DELETE' });
      state.cards.get(job.id)?.remove();
      state.cards.delete(job.id);
      state.jobs = state.jobs.filter((j) => j.id !== job.id);
      renderJobs();
      toast('success', 'Arquivo apagado', 'O espaço já foi liberado.');
    } catch (err) {
      toast('error', 'Não consegui apagar', err.message);
    }
    return;
  }

  if (act === 'retry') {
    btn.disabled = true;
    try {
      const quality = parseInt(job.quality, 10) || (job.mode === 'audio' ? 192 : 720);
      await api('/api/jobs', { method: 'POST', body: { url: job.url, mode: job.mode, quality } });
      toast('success', 'Tentando de novo', 'O download voltou para a fila.');
      refreshJobs();
    } catch (err) {
      btn.disabled = false;
      toast('error', ERROR_TITLES[err.code] || 'Não deu certo', err.message);
    }
  }
});

/* ---------------- confirmação ---------------- */
function confirmDialog({ title, text, confirmLabel = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    const layer = document.createElement('div');
    layer.className = 'modal';
    layer.innerHTML = `
      <div class="modal-card" style="max-width:430px;padding:24px">
        <h3 style="margin:0 0 6px;font-size:1.05rem">${esc(title)}</h3>
        <p class="muted" style="margin:0 0 20px;font-size:.86rem">${esc(text)}</p>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="ghost-btn" data-r="0" type="button">Cancelar</button>
          <button class="primary-btn" data-r="1" type="button" style="min-height:42px;padding:0 18px">${esc(confirmLabel)}</button>
        </div>
      </div>`;
    if (danger) layer.querySelector('[data-r="1"]').style.background = 'linear-gradient(120deg,#ff3b5c,#b91c3c)';

    const close = (value) => {
      document.removeEventListener('keydown', onKey);
      layer.remove();
      resolve(value);
    };
    const onKey = (ev) => { if (ev.key === 'Escape') close(false); };
    layer.addEventListener('click', (ev) => {
      if (ev.target === layer) return close(false);
      const r = ev.target.closest('[data-r]');
      if (r) close(r.dataset.r === '1');
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(layer);
    layer.querySelector('[data-r="0"]').focus();
  });
}

/* ---------------- player ---------------- */
function openPlayer(job) {
  if (!job.fileUrl) return;
  const player = document.getElementById('modalPlayer');
  const src = esc(withToken(job.fileUrl));
  if (job.mode === 'audio') {
    player.innerHTML = `
      <div class="audio-cover">
        <span class="note" aria-hidden="true">♪</span>
        <div class="audio-shell"><audio controls autoplay src="${src}"></audio></div>
      </div>`;
  } else {
    player.innerHTML = `<video controls autoplay playsinline src="${src}"></video>`;
  }
  document.getElementById('modalTitle').textContent = job.title || 'Arquivo';
  document.getElementById('modalSub').textContent = [
    job.mode === 'audio' ? 'MP3' : 'MP4',
    job.quality,
    fmtBytes(job.sizeBytes),
  ].filter(Boolean).join(' · ');
  document.getElementById('modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
  document.getElementById('modalPlayer').innerHTML = '';
  document.body.style.overflow = '';
}

/* ---------------- token ---------------- */
function showLock() {
  const lock = document.getElementById('lock');
  if (lock.classList.contains('hidden')) {
    lock.classList.remove('hidden');
    document.getElementById('lockInput').focus();
  }
}

document.getElementById('lockForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const value = document.getElementById('lockInput').value.trim();
  if (!value) return;
  state.token = value;
  localStorage.setItem('tg_token', value);
  document.getElementById('lock').classList.add('hidden');
  loadHealth();
  refreshJobs();
});

/* ---------------- eventos ---------------- */
document.getElementById('linkForm').addEventListener('submit', (e) => {
  e.preventDefault();
  analyze();
});

document.getElementById('urlInput').addEventListener('input', hideError);

document.getElementById('pasteBtn').addEventListener('click', async () => {
  try {
    const text = (await navigator.clipboard.readText()).trim();
    if (!text) throw new Error('vazio');
    document.getElementById('urlInput').value = text;
    analyze(text);
  } catch {
    document.getElementById('urlInput').focus();
    toast('info', 'Cole com Ctrl+V', 'O navegador não liberou o acesso à área de transferência.');
  }
});

document.getElementById('errorClose').addEventListener('click', hideError);

document.getElementById('refreshBtn').addEventListener('click', () => refreshJobs(true));

document.getElementById('diagBtn').addEventListener('click', async () => {
  const btn = document.getElementById('diagBtn');
  const original = document.getElementById('healthText').textContent;
  btn.disabled = true;
  document.getElementById('healthText').textContent = 'testando…';
  try {
    const result = await api('/api/health/diagnose', { method: 'POST', body: {} });
    toast('success', 'Conexão ok', `O YouTube respondeu em ${(result.ms / 1000).toFixed(1)} s.`);
  } catch (err) {
    toast('error', ERROR_TITLES[err.code] || 'Falha no teste', err.message);
  } finally {
    btn.disabled = false;
    document.getElementById('healthText').textContent = original;
    loadHealth();
  }
});

document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modal').addEventListener('click', (e) => {
  if (e.target.id === 'modal') closeModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal();
    if (document.getElementById('lock').classList.contains('hidden')) hideError();
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshJobs();
});

/* ---------------- boot ---------------- */
(async function boot() {
  await loadHealth();
  await refreshJobs();
  const prefill = new URLSearchParams(location.search).get('url');
  if (prefill) {
    document.getElementById('urlInput').value = prefill;
    analyze(prefill);
  } else {
    document.getElementById('urlInput').focus();
  }
})();
