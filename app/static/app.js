const $ = (selector) => document.querySelector(selector);
const state = { job: null, timer: null, status: null, sourceObjectUrl: null, sourceDuration: null };

const el = {
  form: $('#uploadForm'),
  file: $('#videoFile'),
  dropzone: $('#dropzone'),
  dropTitle: $('#dropTitle'),
  dropHint: $('#dropHint'),
  uploadLimit: $('#uploadLimit'),
  sourcePreviewWrap: $('#sourcePreviewWrap'),
  sourcePreview: $('#sourcePreview'),
  sourceDurationLabel: $('#sourceDurationLabel'),
  modeSplit: $('#modeSplit'),
  modeCut: $('#modeCut'),
  splitSettings: $('#splitSettings'),
  cutSettings: $('#cutSettings'),
  clipSeconds: $('#clipSeconds'),
  cutStart: $('#cutStart'),
  cutEnd: $('#cutEnd'),
  processButton: $('#processButton'),
  processingProgress: $('#processingProgress'),
  processingLabel: $('#processingLabel'),
  processingPercent: $('#processingPercent'),
  processingBar: $('#processingBar'),
  processingSubtext: $('#processingSubtext'),
  resultsPanel: $('#resultsPanel'),
  resultSubtitle: $('#resultSubtitle'),
  clipCount: $('#clipCount'),
  clipGrid: $('#clipGrid'),
  downloadAll: $('#downloadAll'),
  toast: $('#toast')
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, function (char) {
    return {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char];
  });
}

function toast(message) {
  el.toast.textContent = message;
  el.toast.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.toast.classList.remove('show'), 3800);
}

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : {};
  if (!response.ok) throw new Error(data.detail || data.message || ('Request failed (' + response.status + ')'));
  return data;
}

function fmtDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  if (total >= 3600) {
    return Math.floor(total / 3600) + ':' + String(Math.floor((total % 3600) / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
  }
  return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
}

function mode() {
  return el.modeCut.checked ? 'cut' : 'split';
}

function updateMode() {
  const cutMode = mode() === 'cut';
  el.splitSettings.classList.toggle('hidden', cutMode);
  el.cutSettings.classList.toggle('hidden', !cutMode);
  const label = el.processButton.querySelector('span');
  if (label) label.textContent = cutMode ? 'Cut selected range' : 'Create clips';
}

async function loadStatus() {
  try {
    state.status = await api('/api/status');
    el.uploadLimit.textContent = 'Maximum upload size: ' + state.status.max_upload_mb + ' MiB';
  } catch {
    el.uploadLimit.textContent = 'Upload and processing run on this computer';
  }
}

function updateProcessing() {
  if (!state.job) return;
  el.processingProgress.classList.remove('hidden');
  const percent = Number(state.job.progress || 0);
  el.processingPercent.textContent = percent + '%';
  el.processingBar.style.width = percent + '%';
  if (state.job.status === 'queued') {
    el.processingLabel.textContent = 'Waiting to process…';
    el.processingSubtext.textContent = 'Your video is saved locally and waiting in the queue.';
  } else if (state.job.status === 'processing') {
    el.processingLabel.textContent = state.job.mode === 'cut' ? 'Cutting your selected range…' : 'Splitting your video…';
    el.processingSubtext.textContent = 'FFmpeg is creating the portrait MP4 output. Large videos can take a little while.';
  } else if (state.job.status === 'completed') {
    el.processingLabel.textContent = state.job.mode === 'cut' ? 'Your cut is ready' : 'Your clips are ready';
    el.processingSubtext.textContent = (state.job.clips || []).length + ' file(s) created from ' + state.job.source_name + '.';
    el.processingBar.style.width = '100%';
    el.processingPercent.textContent = '100%';
    el.processButton.disabled = false;
  } else if (state.job.status === 'error') {
    el.processingLabel.textContent = 'Video processing failed';
    el.processingSubtext.textContent = state.job.error || 'Could not process this file.';
    el.processingPercent.textContent = '—';
    el.processButton.disabled = false;
  }
}

function drawClips() {
  if (!state.job?.clips?.length) return;
  el.resultsPanel.classList.remove('hidden');
  el.clipCount.textContent = state.job.clips.length + ' clip' + (state.job.clips.length === 1 ? '' : 's');
  el.resultSubtitle.textContent = state.job.mode === 'cut'
    ? 'Selected range from ' + state.job.source_name + '. Preview and download your cut.'
    : 'Split from ' + state.job.source_name + ' · clip length ' + state.job.clip_seconds + ' seconds.';
  el.clipGrid.innerHTML = state.job.clips.map(clip => {
    const number = String(clip.part).padStart(2, '0');
    const src = escapeHtml(clip.url);
    const label = state.job.mode === 'cut' ? 'Cut clip' : 'Part ' + number;
    return '<article class="clip-card">' +
      '<div class="clip-preview"><video controls preload="metadata" playsinline src="' + src + '"></video><span class="clip-number">' + escapeHtml(label) + '</span></div>' +
      '<div class="clip-card-body"><div class="clip-card-top"><strong>' + escapeHtml(label) + '</strong><span class="clip-duration">' + fmtDuration(clip.duration) + '</span></div>' +
      '<div class="clip-meta">' + escapeHtml(clip.filename) + '</div>' +
      '<div class="clip-meta">Starts at ' + fmtDuration(clip.start_seconds || 0) + '</div>' +
      '<a class="download-link" href="' + src + '?download=true" download>Download MP4 ↓</a>' +
      '</div></article>';
  }).join('');
  el.downloadAll.href = '/api/jobs/' + state.job.id + '/download-all';
  el.downloadAll.setAttribute('aria-disabled', 'false');
  el.downloadAll.classList.remove('is-disabled');
}

async function refreshJob() {
  if (!state.job?.id) return;
  try {
    state.job = await api('/api/jobs/' + state.job.id);
    updateProcessing();
    if (state.job.status === 'completed') drawClips();
    const stillProcessing = ['queued', 'processing'].includes(state.job.status);
    if (stillProcessing) state.timer = setTimeout(refreshJob, 1200);
  } catch (error) {
    toast(error.message);
  }
}

function updateSelectedFile() {
  const file = el.file.files?.[0];
  if (!file) return;
  el.dropTitle.textContent = file.name;
  el.dropHint.textContent = (file.size / (1024 * 1024)).toFixed(1) + ' MiB · ready to edit';

  if (state.sourceObjectUrl) URL.revokeObjectURL(state.sourceObjectUrl);
  state.sourceObjectUrl = URL.createObjectURL(file);
  state.sourceDuration = null;
  el.sourcePreview.src = state.sourceObjectUrl;
  el.sourcePreviewWrap.classList.remove('hidden');
  el.sourceDurationLabel.textContent = 'Reading duration…';
  el.sourcePreview.onloadedmetadata = () => {
    if (!Number.isFinite(el.sourcePreview.duration)) return;
    state.sourceDuration = el.sourcePreview.duration;
    el.sourceDurationLabel.textContent = 'Duration ' + fmtDuration(state.sourceDuration);
    const currentEnd = Number(el.cutEnd.value);
    if (!currentEnd || currentEnd > state.sourceDuration || currentEnd === 30) {
      el.cutEnd.value = Math.min(30, state.sourceDuration).toFixed(1).replace(/\.0$/, '');
    }
  };
}

el.file.addEventListener('change', updateSelectedFile);
for (const eventName of ['dragenter', 'dragover']) {
  el.dropzone.addEventListener(eventName, event => {
    event.preventDefault();
    el.dropzone.classList.add('dragover');
  });
}
for (const eventName of ['dragleave', 'drop']) {
  el.dropzone.addEventListener(eventName, event => {
    event.preventDefault();
    el.dropzone.classList.remove('dragover');
  });
}
el.dropzone.addEventListener('drop', event => {
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  el.file.files = transfer.files;
  updateSelectedFile();
});

el.modeSplit.addEventListener('change', updateMode);
el.modeCut.addEventListener('change', updateMode);

el.form.addEventListener('submit', async event => {
  event.preventDefault();
  const file = el.file.files?.[0];
  if (!file) return toast('Choose a video file first.');
  if (state.status && file.size > state.status.max_upload_mb * 1024 * 1024) {
    return toast('This file is larger than ' + state.status.max_upload_mb + ' MiB.');
  }
  const activeMode = mode();
  const clipSeconds = Number(el.clipSeconds.value);
  const cutStart = Number(el.cutStart.value);
  const cutEnd = Number(el.cutEnd.value);
  if (activeMode === 'split' && (!Number.isInteger(clipSeconds) || clipSeconds < 5 || clipSeconds > 300)) {
    return toast('Clip length must be a whole number between 5 and 300 seconds.');
  }
  if (activeMode === 'cut' && (!Number.isFinite(cutStart) || !Number.isFinite(cutEnd) || cutStart < 0 || cutEnd <= cutStart)) {
    return toast('Cut end must be later than cut start.');
  }

  clearTimeout(state.timer);
  state.job = null;
  el.resultsPanel.classList.add('hidden');
  el.downloadAll.href = '#';
  el.downloadAll.setAttribute('aria-disabled', 'true');
  el.downloadAll.classList.add('is-disabled');
  el.processingProgress.classList.remove('hidden');
  el.processingLabel.textContent = 'Uploading video…';
  el.processingPercent.textContent = '0%';
  el.processingBar.style.width = '0%';
  el.processingSubtext.textContent = 'The video is being sent to the local processor.';
  el.processButton.disabled = true;
  const label = el.processButton.querySelector('span');
  if (label) label.textContent = 'Working…';

  try {
    const formData = new FormData();
    formData.append('video', file);
    formData.append('mode', activeMode);
    formData.append('clip_seconds', String(clipSeconds));
    formData.append('cut_start', String(cutStart));
    formData.append('cut_end', String(cutEnd));
    state.job = await api('/api/jobs', {method:'POST', body:formData});
    if (label) label.textContent = activeMode === 'cut' ? 'Cut selected range' : 'Create clips';
    updateProcessing();
    state.timer = setTimeout(refreshJob, 700);
    toast(activeMode === 'cut' ? 'Video uploaded. Your cut has started.' : 'Video uploaded. Splitting has started.');
  } catch (error) {
    el.processButton.disabled = false;
    if (label) label.textContent = activeMode === 'cut' ? 'Cut selected range' : 'Create clips';
    toast(error.message);
  }
});

el.downloadAll.addEventListener('click', event => {
  if (el.downloadAll.getAttribute('aria-disabled') === 'true') {
    event.preventDefault();
    toast('Wait until processing is complete before downloading.');
  }
});

updateMode();
loadStatus();
