// ═══ État global ══════════════════════════════════════════════════════════════
const state = {
  // Lecture livre
  language: 'fr',
  voiceId: null,
  voiceTranscript: null,
  speed: 1.0,
  volume: 1.0,
  autoplay: true,
  isPlaying: false,
  chapters: [],
  flatParas: [],
  currentIdx: -1,
  audioCache: {},

  // Enregistrement voix
  recorder: null,
  recStream: null,
  recInterval: null,
  recChunks: [],
  recSeconds: 0,
  isRecording: false,

  // Texte libre
  freeChunks: [],
  freeIdx: -1,
  freeAudioCache: {},
  freeIsPlaying: false,

  // Moteur TTS
  engine: 'espeak',
  supportsCloning: false,
};

// ═══ Init ═════════════════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  fetch('/api/engine')
    .then(r => r.json())
    .then(info => {
      state.engine = info.engine;
      state.supportsCloning = info.supports_cloning;

      // Badge header
      const badge = document.getElementById('engine-badge');
      badge.textContent = info.engine === 'voxcpm' ? '🤖 VoxCPM2' : info.engine === 'edge-tts' ? '☁️ edge-tts' : '🔊 espeak-ng';

      // Statut dans sidebar
      const dot   = document.querySelector('.engine-dot');
      const label = document.getElementById('engine-label');
      if (info.engine === 'voxcpm') {
        dot.className = 'engine-dot voxcpm';
        label.textContent = 'VoxCPM2 — clonage actif ✓';
        document.getElementById('voxcpm-card').classList.add('hidden-card');
      } else {
        dot.className = 'engine-dot espeak';
        label.textContent = info.engine === 'edge-tts' ? 'edge-tts (cloud)' : 'espeak-ng (hors-ligne)';
      }

      // Désactiver enregistrement si pas de clonage
      if (!info.supports_cloning) {
        const btn = document.getElementById('btn-record');
        btn.title = 'Clonage disponible uniquement avec VoxCPM2';
      }
    })
    .catch(() => {});
});

// ═══ Thème ════════════════════════════════════════════════════════════════════
function toggleTheme() {
  const html = document.documentElement;
  const isLight = html.dataset.theme === 'light';
  html.dataset.theme = isLight ? 'dark' : 'light';
  document.getElementById('theme-btn').textContent = isLight ? '🌙' : '☀️';
}

// ═══ Langue ═══════════════════════════════════════════════════════════════════
function setLanguage(lang) {
  state.language = lang;
  document.getElementById('btn-fr').classList.toggle('active', lang === 'fr');
  document.getElementById('btn-ar').classList.toggle('active', lang === 'ar');
  document.querySelectorAll('.para').forEach(el => el.classList.toggle('rtl', lang === 'ar'));
  const ta = document.getElementById('free-text');
  ta.classList.toggle('rtl', lang === 'ar');
  state.audioCache = {};
  state.freeAudioCache = {};
  toast(lang === 'fr' ? 'Langue : Français 🇫🇷' : 'اللغة : العربية 🇸🇦');
}

// ═══ Onglets ══════════════════════════════════════════════════════════════════
function switchTab(name) {
  document.getElementById('tab-book-btn').classList.toggle('active', name === 'book');
  document.getElementById('tab-text-btn').classList.toggle('active', name === 'text');
  document.getElementById('tab-book').classList.toggle('hidden', name !== 'book');
  document.getElementById('tab-text').classList.toggle('hidden', name !== 'text');
}

// ═══ Upload livre ════════════════════════════════════════════════════════════
function handleDrop(event) {
  event.preventDefault();
  const file = event.dataTransfer.files[0];
  if (file) uploadBookFile(file);
}
function uploadBook(input) {
  if (input.files[0]) uploadBookFile(input.files[0]);
}
async function uploadBookFile(file) {
  showLoading('Analyse du livre…');
  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/upload-book', { method: 'POST', body: fd });
    if (!res.ok) { const e = await res.json(); throw new Error(e.detail); }
    const data = await res.json();

    state.chapters = data.chapters;
    state.flatParas = [];
    state.audioCache = {};
    state.currentIdx = -1;
    data.chapters.forEach((ch, ci) => {
      ch.paragraphs.forEach((p, pi) => state.flatParas.push({ chapterIdx: ci, paraIdx: pi, text: p }));
    });

    document.getElementById('book-name').textContent = data.filename;
    document.getElementById('book-stats').textContent = `${data.chapters.length} chapitre(s) · ${data.total_paragraphs} paragraphe(s)`;
    document.getElementById('book-meta').classList.remove('hidden');
    renderChapterList();
    renderParagraphs();
    switchTab('book');
    toast(`"${data.filename}" chargé ✓`, 'success');
  } catch (err) {
    toast('Erreur : ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

// ═══ Rendu livre ══════════════════════════════════════════════════════════════
function renderChapterList() {
  const list = document.getElementById('chapters-list');
  list.innerHTML = '';
  state.chapters.forEach((ch, i) => {
    const el = document.createElement('div');
    el.className = 'chapter-item';
    el.textContent = ch.title;
    el.id = `ch-item-${i}`;
    el.onclick = () => jumpToChapter(i);
    list.appendChild(el);
  });
}
function renderParagraphs() {
  const container = document.getElementById('paras');
  container.innerHTML = '';
  let lastChapter = -1;
  state.flatParas.forEach((fp, idx) => {
    if (fp.chapterIdx !== lastChapter) {
      lastChapter = fp.chapterIdx;
      const h = document.createElement('div');
      h.className = 'chapter-heading';
      h.textContent = state.chapters[fp.chapterIdx].title;
      container.appendChild(h);
    }
    const el = document.createElement('div');
    el.className = 'para' + (state.language === 'ar' ? ' rtl' : '');
    el.id = `para-${idx}`;
    el.textContent = fp.text;
    el.onclick = () => playParagraph(idx);
    container.appendChild(el);
  });
  document.getElementById('welcome').classList.add('hidden');
  container.classList.remove('hidden');
}
function jumpToChapter(ci) {
  const idx = state.flatParas.findIndex(fp => fp.chapterIdx === ci);
  if (idx >= 0) playParagraph(idx);
}
function updateChapterHighlight(idx) {
  const ci = state.flatParas[idx]?.chapterIdx;
  document.querySelectorAll('.chapter-item').forEach((el, i) => el.classList.toggle('active', i === ci));
}

// ═══ Lecture livre ════════════════════════════════════════════════════════════
async function playParagraph(idx) {
  if (idx < 0 || idx >= state.flatParas.length) return;
  document.querySelectorAll('.para').forEach(el => el.classList.remove('active', 'done'));
  const paraEl = document.getElementById(`para-${idx}`);
  if (paraEl) { paraEl.classList.add('active'); paraEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  updateChapterHighlight(idx);
  state.currentIdx = idx;
  state.isPlaying = true;
  updatePlayBtn();

  if (state.audioCache[idx]) { playAudio(state.audioCache[idx]); return; }

  showLoading('Synthèse vocale…');
  try {
    const fp = state.flatParas[idx];
    const data = await callTTS(fp.text, state.language);
    state.audioCache[idx] = data.audio_url;
    playAudio(data.audio_url);
    prefetchPara(idx + 1);
  } catch (err) {
    toast('Erreur TTS : ' + err.message, 'error');
    state.isPlaying = false;
    updatePlayBtn();
  } finally {
    hideLoading();
  }
}
async function prefetchPara(idx) {
  if (idx >= state.flatParas.length || state.audioCache[idx]) return;
  try {
    const fp = state.flatParas[idx];
    const data = await callTTS(fp.text, state.language);
    state.audioCache[idx] = data.audio_url;
  } catch (_) {}
}
function playAudio(url) {
  const a = document.getElementById('audio-el');
  a.src = url; a.playbackRate = state.speed; a.volume = state.volume;
  a.play().catch(() => {});
}
function togglePlay() {
  if (!state.flatParas.length) { toast('Chargez un livre.', 'error'); return; }
  const a = document.getElementById('audio-el');
  if (state.isPlaying) { a.pause(); state.isPlaying = false; }
  else if (a.src && a.paused) { a.play(); state.isPlaying = true; }
  else { playParagraph(state.currentIdx >= 0 ? state.currentIdx : 0); return; }
  updatePlayBtn();
}
function onAudioEnd() {
  const el = document.getElementById(`para-${state.currentIdx}`);
  if (el) { el.classList.remove('active'); el.classList.add('done'); }
  if (state.autoplay) {
    const next = state.currentIdx + 1;
    if (next < state.flatParas.length) playParagraph(next);
    else { state.isPlaying = false; updatePlayBtn(); toast('Fin du livre 📖', 'success'); }
  } else { state.isPlaying = false; updatePlayBtn(); }

  // Si texte libre aussi en lecture, continuer
  if (state.freeIsPlaying) onFreeAudioEnd();
}
function skipParagraph(delta) {
  const idx = (state.currentIdx >= 0 ? state.currentIdx : 0) + delta;
  if (idx >= 0 && idx < state.flatParas.length) playParagraph(idx);
}
function toggleAutoplay() {
  state.autoplay = !state.autoplay;
  document.getElementById('auto-btn').classList.toggle('active', state.autoplay);
  toast(state.autoplay ? 'Lecture auto activée 🔁' : 'Lecture auto désactivée');
}

// ═══ Texte libre ══════════════════════════════════════════════════════════════

function onFreeTextInput() {
  const text = document.getElementById('free-text').value;
  const chars = text.length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const chunks = splitTextIntoChunks(text);
  document.getElementById('char-count').textContent = chars + (chars <= 1 ? ' caractère' : ' caractères');
  document.getElementById('word-count').textContent = words + (words <= 1 ? ' mot' : ' mots');
  document.getElementById('chunk-count').textContent = chunks.length + (chunks.length <= 1 ? ' bloc' : ' blocs');
  state.freeAudioCache = {};
}

function splitTextIntoChunks(text, maxLen = 400) {
  if (!text.trim()) return [];
  // Split on blank lines first
  const paras = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const chunks = [];
  for (const para of paras) {
    if (para.length <= maxLen) { chunks.push(para); continue; }
    // Split long paras on sentence boundaries
    const sentences = para.match(/[^.!?]+[.!?]+\s*/g) || [para];
    let buf = '';
    for (const s of sentences) {
      if ((buf + s).length > maxLen && buf) { chunks.push(buf.trim()); buf = s; }
      else buf += s;
    }
    if (buf.trim()) chunks.push(buf.trim());
  }
  return chunks;
}

async function readFreeText() {
  const text = document.getElementById('free-text').value.trim();
  if (!text) { toast('Le champ texte est vide.', 'error'); return; }

  state.freeChunks = splitTextIntoChunks(text);
  if (!state.freeChunks.length) return;

  state.freeIdx = 0;
  state.freeIsPlaying = true;
  state.freeAudioCache = {};
  document.getElementById('text-progress').classList.remove('hidden');
  document.getElementById('tp-tot').textContent = state.freeChunks.length;
  await playFreeChunk(0);
}

async function playFreeChunk(idx) {
  if (idx >= state.freeChunks.length) {
    state.freeIsPlaying = false;
    toast('Lecture terminée ✓', 'success');
    document.getElementById('tp-bar-fill').style.width = '100%';
    return;
  }
  state.freeIdx = idx;
  const chunk = state.freeChunks[idx];

  // Update UI
  document.getElementById('tp-cur').textContent = idx + 1;
  document.getElementById('tp-bar-fill').style.width = ((idx / state.freeChunks.length) * 100) + '%';
  const cur = document.getElementById('tp-current-text');
  cur.textContent = chunk;
  cur.className = 'tp-current' + (state.language === 'ar' ? ' rtl' : '');

  try {
    let url = state.freeAudioCache[idx];
    if (!url) {
      showLoading(`Bloc ${idx + 1} / ${state.freeChunks.length}…`);
      const data = await callTTS(chunk, state.language);
      url = data.audio_url;
      state.freeAudioCache[idx] = url;
      hideLoading();
    }
    // Pre-fetch next
    if (idx + 1 < state.freeChunks.length && !state.freeAudioCache[idx + 1]) {
      callTTS(state.freeChunks[idx + 1], state.language).then(d => { state.freeAudioCache[idx + 1] = d.audio_url; }).catch(() => {});
    }
    playFreeAudio(url);
  } catch (err) {
    hideLoading();
    toast('Erreur : ' + err.message, 'error');
    state.freeIsPlaying = false;
  }
}

function playFreeAudio(url) {
  const a = document.getElementById('audio-el');
  a.src = url; a.playbackRate = state.speed; a.volume = state.volume;
  a.play().catch(() => {});
}

function onFreeAudioEnd() {
  if (!state.freeIsPlaying) return;
  playFreeChunk(state.freeIdx + 1);
}

function clearFreeText() {
  document.getElementById('free-text').value = '';
  document.getElementById('text-progress').classList.add('hidden');
  state.freeChunks = []; state.freeIdx = -1; state.freeAudioCache = {};
  state.freeIsPlaying = false;
  onFreeTextInput();
  document.getElementById('audio-el').pause();
}

// ═══ Appel TTS commun ════════════════════════════════════════════════════════
async function callTTS(text, language) {
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      language,
      speed: state.speed,
      voice_id: state.voiceId,
      voice_transcript: state.voiceTranscript,
    }),
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Erreur TTS'); }
  return res.json();
}

// ═══ Barre de progression audio ═══════════════════════════════════════════════
function updateProgress() {
  const a = document.getElementById('audio-el');
  if (!a.duration) return;
  document.getElementById('progress-fill').style.width = (a.currentTime / a.duration * 100) + '%';
  document.getElementById('cur-time').textContent = fmtTime(a.currentTime);
}
function updateDuration() {
  document.getElementById('tot-time').textContent = fmtTime(document.getElementById('audio-el').duration);
}
function seekAudio(ev) {
  const a = document.getElementById('audio-el');
  if (!a.duration) return;
  const rect = ev.currentTarget.getBoundingClientRect();
  a.currentTime = ((ev.clientX - rect.left) / rect.width) * a.duration;
}
function fmtTime(s) {
  if (!s || isNaN(s)) return '0:00';
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

// ═══ Vitesse & Volume ════════════════════════════════════════════════════════
function setSpeed(val) {
  state.speed = parseFloat(val);
  document.getElementById('speed-val').textContent = state.speed.toFixed(1) + '×';
  document.getElementById('audio-el').playbackRate = state.speed;
  state.audioCache = {}; state.freeAudioCache = {};
}
function setVolume(val) {
  state.volume = parseFloat(val);
  document.getElementById('audio-el').volume = state.volume;
}
function updatePlayBtn() {
  document.getElementById('play-btn').textContent = state.isPlaying ? '⏸' : '▶';
}

// ═══ Enregistrement voix ══════════════════════════════════════════════════════
async function toggleRecording() {
  state.isRecording ? stopRecording() : await startRecording();
}
async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.recChunks = []; state.recSeconds = 0;
    state.recStream = stream;
    state.recorder = new MediaRecorder(stream);
    state.recorder.ondataavailable = e => { if (e.data.size) state.recChunks.push(e.data); };
    state.recorder.onstop = finishRecording;
    state.recorder.start();
    state.isRecording = true;

    const btn = document.getElementById('btn-record');
    btn.classList.add('recording');
    document.getElementById('rec-icon').textContent = '⏹';
    document.getElementById('rec-label').textContent = 'Arrêter';
    document.getElementById('rec-timer').classList.remove('hidden');

    state.recInterval = setInterval(() => {
      state.recSeconds++;
      document.getElementById('rec-secs').textContent = state.recSeconds;
      document.getElementById('rec-bar-fill').style.width = Math.min(state.recSeconds / 30 * 100, 100) + '%';
      if (state.recSeconds >= 30) stopRecording();
    }, 1000);
  } catch (err) {
    toast('Microphone inaccessible : ' + err.message, 'error');
  }
}
function stopRecording() {
  if (state.recorder?.state !== 'inactive') state.recorder.stop();
  state.recStream?.getTracks().forEach(t => t.stop());
  state.recStream = null;
  clearInterval(state.recInterval);
  state.isRecording = false;
  const btn = document.getElementById('btn-record');
  btn.classList.remove('recording');
  document.getElementById('rec-icon').textContent = '⏺';
  document.getElementById('rec-label').textContent = 'Démarrer l\'enregistrement';
  document.getElementById('rec-timer').classList.add('hidden');
  document.getElementById('rec-bar-fill').style.width = '0%';
}
async function finishRecording() {
  const blob = new Blob(state.recChunks, { type: 'audio/webm' });
  await sendVoiceBlob(blob, 'enregistrement.webm');
}
async function uploadVoice(input) {
  if (input.files[0]) await sendVoiceBlob(input.files[0], input.files[0].name);
}
async function sendVoiceBlob(blob, filename) {
  showLoading('Envoi de l\'échantillon vocal…');
  try {
    const fd = new FormData();
    fd.append('file', blob, filename);
    const res = await fetch('/api/upload-voice', { method: 'POST', body: fd });
    if (!res.ok) throw new Error('Erreur serveur');
    const data = await res.json();
    state.voiceId = data.voice_id;
    state.audioCache = {}; state.freeAudioCache = {};
    document.getElementById('voice-ok').classList.remove('hidden');
    toast('Voix enregistrée ✓', 'success');
  } catch (err) {
    toast('Erreur : ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

function saveTranscript() {
  const t = document.getElementById('voice-transcript').value.trim();
  if (!t) { toast('Entrez la transcription d\'abord.', 'error'); return; }
  state.voiceTranscript = t;
  state.audioCache = {}; state.freeAudioCache = {};
  toast('Transcription sauvegardée ✓', 'success');
}

// ═══ Helpers UI ═══════════════════════════════════════════════════════════════
function showLoading(msg) {
  document.getElementById('loading-msg').textContent = msg || 'Chargement…';
  document.getElementById('loading').classList.remove('hidden');
}
function hideLoading() {
  document.getElementById('loading').classList.add('hidden');
}
function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
