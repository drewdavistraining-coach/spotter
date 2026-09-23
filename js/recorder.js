// Voice memo sheet: record -> review -> add a note/transcript -> save.
// Transcription: iPhone keyboard dictation (the mic key) works in the note box everywhere;
// the "Dictate" button uses the browser's speech API when it exists (Chrome/Safari).
import { db, uid } from './db.js';
import { esc, fmtDuration, isoDate, toast } from './util.js';

function pickMime() {
  const options = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
  return options.find(t => window.MediaRecorder?.isTypeSupported?.(t)) || '';
}

export function openRecorder({ clientId, clientName, sessionId = null, onSaved }) {
  const overlay = document.createElement('div');
  overlay.className = 'sheet-backdrop';
  overlay.innerHTML = `
    <div class="sheet" role="dialog" aria-label="Voice memo">
      <div class="sheet-head">
        <h2>Voice memo <span class="muted">· ${esc(clientName)}</span></h2>
        <button class="icon-btn" data-close aria-label="Close">✕</button>
      </div>
      <div class="rec-stage">
        <button class="rec-btn" data-rec aria-label="Start recording"><span></span></button>
        <div class="rec-time" data-time>0:00</div>
        <div class="muted small" data-hint>Tap to record</div>
        <audio controls hidden data-audio></audio>
      </div>
      <label class="field">
        <span>Note / transcript</span>
        <textarea rows="4" data-note placeholder="Key points… (tip: tap the mic on your keyboard to dictate)"></textarea>
      </label>
      <div class="row gap">
        <button class="btn ghost" data-dictate hidden>🎙 Dictate</button>
        <span class="grow"></span>
        <button class="btn primary" data-save disabled>Save memo</button>
      </div>
    </div>`;
  document.body.append(overlay);

  const q = sel => overlay.querySelector(sel);
  const recBtn = q('[data-rec]'), timeEl = q('[data-time]'), hint = q('[data-hint]');
  const audioEl = q('[data-audio]'), note = q('[data-note]'), saveBtn = q('[data-save]'), dictateBtn = q('[data-dictate]');

  let recorder, stream, chunks = [], blob = null, startedAt = 0, duration = 0, timer, recognition, stopped, resolveStopped;

  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (Speech) dictateBtn.hidden = false;

  overlay.dismiss = () => close(); // leaving the screen stops the mic as well as closing the sheet

  function close() {
    stopStream();
    recognition?.abort();
    clearInterval(timer);
    if (audioEl.src) URL.revokeObjectURL(audioEl.src);
    overlay.remove();
  }

  function stopStream() {
    stream?.getTracks().forEach(t => t.stop());
    stream = null;
  }

  function updateSave() {
    saveBtn.disabled = !(blob || note.value.trim());
  }

  async function start() {
    if (!window.MediaRecorder) return toast('Recording is not supported in this browser.');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return toast('Microphone permission was blocked.');
    }
    const mimeType = pickMime();
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunks = [];
    recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
    stopped = new Promise(resolve => { resolveStopped = resolve; });
    recorder.onstop = () => {
      blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/mp4' });
      duration = (Date.now() - startedAt) / 1000;
      audioEl.src = URL.createObjectURL(blob);
      audioEl.hidden = false;
      hint.textContent = 'Tap to re-record';
      stopStream();
      updateSave();
      resolveStopped();
    };
    recorder.start(1000);
    startedAt = Date.now();
    recBtn.classList.add('live');
    hint.textContent = 'Recording… tap to stop';
    audioEl.hidden = true;
    timer = setInterval(() => { timeEl.textContent = fmtDuration((Date.now() - startedAt) / 1000); }, 250);
  }

  function stop() {
    clearInterval(timer);
    recBtn.classList.remove('live');
    recorder?.state === 'recording' && recorder.stop();
  }

  recBtn.addEventListener('click', () => (recorder?.state === 'recording' ? stop() : start()));
  note.addEventListener('input', updateSave);
  q('[data-close]').addEventListener('click', () => {
    if ((blob || note.value.trim()) && !confirm('Discard this memo?')) return;
    close();
  });

  dictateBtn.addEventListener('click', () => {
    if (recognition) { recognition.stop(); return; }
    recognition = new Speech();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = navigator.language || 'en-US';
    recognition.onresult = e => {
      const text = [...e.results].slice(e.resultIndex).map(r => r[0].transcript).join(' ').trim();
      note.value = (note.value.trim() + ' ' + text).trim();
      updateSave();
    };
    recognition.onend = () => { recognition = null; dictateBtn.textContent = '🎙 Dictate'; };
    recognition.onerror = () => toast('Dictation unavailable here — use the keyboard mic instead.');
    recognition.start();
    dictateBtn.textContent = '■ Stop dictating';
  });

  saveBtn.addEventListener('click', async () => {
    if (recorder?.state === 'recording') { stop(); await stopped; }
    const memo = {
      id: uid(), clientId, sessionId,
      date: isoDate(), createdAt: Date.now(),
      audio: blob, mimeType: blob?.type || null, duration: Math.round(duration),
      note: note.value.trim(),
    };
    await db.put('memos', memo);
    toast('Memo saved');
    close();
    onSaved?.(memo);
  });
}
