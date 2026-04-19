// ═══ State ═══════════════════════════════════════════════════════════════════
const state = {
  language: 'fr',
  voiceId: null,
  voiceTranscript: null,
  speed: 1.0,
  volume: 1.0,
  autoplay: true,
  isPlaying: false,
  isRecording: false,
  chapters: [],
  flatParas: [],       // [{chapterIdx, paraIdx, text}]
  currentIdx: -1,
  audioCache: {},      // idx → audio_url
  recorder: null,
  recInterval: null,
  recChunks: [],
  recSeconds: 0,
};

// ═══ Init ════════════════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  fetch('/api/engine')
    .then(r => r.json())
    .then(info => {
      const badge = document.getElementById('engine-badge');
      badge.textContent = info.engine === 'voxcpm' ? '🤖 VoxCPM2' : '☁️ edge-tts';

      const hint = document.getElementById('clone-hint');
      if (!info.supports_cloning) {
        hint.textContent = 'Mode edge-tts (cloud) — clonage non disponible sans VoxCPM2';
        document.getElementById('btn-record').disabled = true;
        document.getElementById('btn-record').style.opacity = '.4';
      }
    })
    .catch(() => {});
});

// ═══ Theme ════════════════════════════════════════════════════════════════════
function toggleTheme() {
  const html = document.documentElement;
  const light = html.dataset.theme === 'light';
  html.dataset.theme = light ? 'dark' : 'light';
  document.getElementById('theme-btn').textContent = light ? '🌙' : '☀️';
}

// ═══ Language ════════════════════════════════════════════════════════════════
function setLanguage(lang) {
  state.language = lang;
  document.getElementById('btn-fr').classList.toggle('active', lang === 'fr');
  document.getElementById('btn-ar').classList.toggle('active', lang === 'ar');

  // Re-render RTL
  document.querySelectorAll('.para').forEach(el => {
    el.classList.toggle('rtl', lang === 'ar');
  });

  // Clear audio cache since voices change
  state.audioCache = {};
  toast('Langue : ' + (lang === 'fr' ? 'Français 🇫🇷' : 'العربية 🇸🇦'));
}

// ═══ Book upload ═════════════════════════════════════════════════════════════
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
      ch.paragraphs.forEach((p, pi) => {
        state.flatParas.push({ chapterIdx: ci, paraIdx: pi, text: p });
      });
    });

    document.getElementById('book-name').textContent = data.filename;
    document.getElementById('book-stats').textContent =
      `${data.chapters.length} chapitre(s) · ${data.total_paragraphs} paragraphe(s)`;
    document.getElementById('book-meta').classList.remove('hidden');

    renderChapterList();
    renderParagraphs();
    toast(`"${data.filename}" chargé ✓`, 'success');

  } catch (err) {
    toast('Erreur : ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

// ═══ Render ═══════════════════════════════════════════════════════════════════
function renderChapterList() {
  const list = document.getElementById('chapters-list');
  list.innerHTML = '';
  state.chapters.forEach((ch, i) => {
    const el = document.createElement('div');
    el.className = 'chapter-item';
    el.textContent = ch.title;
    el.onclick = () => jumpToChapter(i);
    el.id = `ch-item-${i}`;
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
  document.querySelectorAll('.chapter-item').forEach((el, i) => {
    el.classList.toggle('active', i === ci);
  });
}

// ═══ Playback ════════════════════════════════════════════════════════════════
async function playParagraph(idx) {
  if (idx < 0 || idx >= state.flatParas.length) return;

  // Highlight
  document.querySelectorAll('.para').forEach(el => el.classList.remove('active', 'done'));
  const paraEl = document.getElementById(`para-${idx}`);
  if (paraEl) {
    paraEl.classList.add('active');
    paraEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  updateChapterHighlight(idx);

  state.currentIdx = idx;
  state.isPlaying = true;
  updatePlayBtn();

  // Use cache or fetch new audio
  if (state.audioCache[idx]) {
    playAudio(state.audioCache[idx]);
    return;
  }

  showLoading('Synthèse vocale…');
  try {
    const fp = state.flatParas[idx];
    const body = {
      text: fp.text,
      language: state.language,
      speed: state.speed,
      voice_id: state.voiceId,
      voice_transcript: state.voiceTranscript,
    };
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.detail); }
    const data = await res.json();
    state.audioCache[idx] = data.audio_url;
    playAudio(data.audio_url);

    // Pre-fetch next paragraph in background
    prefetchNext(idx + 1);

  } catch (err) {
    toast('Erreur TTS : ' + err.message, 'error');
    state.isPlaying = false;
    updatePlayBtn();
  } finally {
    hideLoading();
  }
}

async function prefetchNext(idx) {
  if (idx >= state.flatParas.length || state.audioCache[idx]) return;
  try {
    const fp = state.flatParas[idx];
    const body = {
      text: fp.text,
      language: state.language,
      speed: state.speed,
      voice_id: state.voiceId,
    };
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      state.audioCache[idx] = data.audio_url;
    }
  } catch (_) {}
}

function playAudio(url) {
  const audio = document.getElementById('audio-el');
  audio.src = url;
  audio.playbackRate = state.speed;
  audio.volume = state.volume;
  audio.play().catch(() => {});
}

function togglePlay() {
  if (!state.flatParas.length) { toast('Chargez un livre d\'abord.', 'error'); return; }
  const audio = document.getElementById('audio-el');

  if (state.isPlaying) {
    audio.pause();
    state.isPlaying = false;
  } else if (audio.src && audio.paused) {
    audio.play();
    state.isPlaying = true;
  } else {
    const idx = state.currentIdx >= 0 ? state.currentIdx : 0;
    playParagraph(idx);
    return;
  }
  updatePlayBtn();
}

function onAudioEnd() {
  const paraEl = document.getElementById(`para-${state.currentIdx}`);
  if (paraEl) { paraEl.classList.remove('active'); paraEl.classList.add('done'); }

  if (state.autoplay) {
    const next = state.currentIdx + 1;
    if (next < state.flatParas.length) {
      playParagraph(next);
    } else {
      state.isPlaying = false;
      updatePlayBtn();
      toast('Fin du livre 📖', 'success');
    }
  } else {
    state.isPlaying = false;
    updatePlayBtn();
  }
}

function skipParagraph(delta) {
  const idx = (state.currentIdx >= 0 ? state.currentIdx : 0) + delta;
  if (idx >= 0 && idx < state.flatParas.length) playParagraph(idx);
}

function toggleAutoplay() {
  state.autoplay = !state.autoplay;
  const btn = document.getElementById('auto-btn');
  btn.classList.toggle('active', state.autoplay);
  toast(state.autoplay ? 'Lecture auto activée 🔁' : 'Lecture auto désactivée');
}

// ═══ Progress bar ════════════════════════════════════════════════════════════
function updateProgress() {
  const audio = document.getElementById('audio-el');
  if (!audio.duration) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('cur-time').textContent = fmtTime(audio.currentTime);
}
function updateDuration() {
  const audio = document.getElementById('audio-el');
  document.getElementById('tot-time').textContent = fmtTime(audio.duration);
}
function seekAudio(ev) {
  const audio = document.getElementById('audio-el');
  if (!audio.duration) return;
  const rect = ev.currentTarget.getBoundingClientRect();
  const pct = (ev.clientX - rect.left) / rect.width;
  audio.currentTime = pct * audio.duration;
}
function fmtTime(s) {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = String(Math.floor(s % 60)).padStart(2, '0');
  return `${m}:${sec}`;
}

// ═══ Speed & Volume ═══════════════════════════════════════════════════════════
function setSpeed(val) {
  state.speed = parseFloat(val);
  document.getElementById('speed-val').textContent = state.speed.toFixed(1) + '×';
  document.getElementById('audio-el').playbackRate = state.speed;
  state.audioCache = {}; // Regenerate at new speed
}
function setVolume(val) {
  state.volume = parseFloat(val);
  document.getElementById('audio-el').volume = state.volume;
}
function updatePlayBtn() {
  document.getElementById('play-btn').textContent = state.isPlaying ? '⏸' : '▶';
}

// ═══ Voice recording ══════════════════════════════════════════════════════════
async function toggleRecording() {
  if (state.isRecording) {
    stopRecording();
  } else {
    await startRecording();
  }
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.recChunks = [];
    state.recSeconds = 0;
    state.recorder = new MediaRecorder(stream);
    state.recorder.ondataavailable = e => { if (e.data.size) state.recChunks.push(e.data); };
    state.recorder.onstop = finishRecording;
    state.recorder.start();
    state.isRecording = true;

    const btn = document.getElementById('btn-record');
    btn.classList.add('recording');
    document.getElementById('rec-icon').textContent = '⏹';
    document.getElementById('rec-label').textContent = 'Stop';
    document.getElementById('rec-timer').classList.remove('hidden');

    state.recInterval = setInterval(() => {
      state.recSeconds++;
      document.getElementById('rec-secs').textContent = state.recSeconds;
      if (state.recSeconds >= 30) stopRecording(); // max 30 s
    }, 1000);

  } catch (err) {
    toast('Microphone inaccessible : ' + err.message, 'error');
  }
}

function stopRecording() {
  if (state.recorder && state.recorder.state !== 'inactive') state.recorder.stop();
  state.recorder?.stream?.getTracks().forEach(t => t.stop());
  clearInterval(state.recInterval);
  state.isRecording = false;

  const btn = document.getElementById('btn-record');
  btn.classList.remove('recording');
  document.getElementById('rec-icon').textContent = '⏺';
  document.getElementById('rec-label').textContent = 'Enregistrer (10 s)';
  document.getElementById('rec-timer').classList.add('hidden');
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
    state.audioCache = {}; // Regenerate with new voice
    document.getElementById('voice-ok').classList.remove('hidden');
    toast('Voix enregistrée ✓ — le clone sera utilisé lors de la prochaine lecture', 'success');
  } catch (err) {
    toast('Erreur : ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

// ═══ UI helpers ═══════════════════════════════════════════════════════════════
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
