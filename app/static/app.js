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
  processingMode: $('#processingMode'),
  autoPublish: $('#autoPublish'),
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
  toast: $('#toast'),
  facebookHeaderState: $('#facebookHeaderState'),
  facebookSetupPrompt: $('#facebookSetupPrompt'),
  facebookDisconnected: $('#facebookDisconnected'),
  facebookConnected: $('#facebookConnected'),
  facebookPageSelect: $('#facebookPageSelect'),
  selectFacebookPage: $('#selectFacebookPage'),
  refreshFacebookStatus: $('#refreshFacebookStatus'),
  facebookConnectedCaption: $('#facebookConnectedCaption'),
  captionTemplate: $('#captionTemplate'),
  publishAll: $('#publishAll'),
  publishHint: $('#publishHint'),
  publishProgress: $('#publishProgress'),
  publishStatusLabel: $('#publishStatusLabel'),
  publishPercent: $('#publishPercent'),
  publishBar: $('#publishBar'),
  publishSubtext: $('#publishSubtext'),
  publishLog: $('#publishLog')
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
  if (label) {
    label.textContent = el.autoPublish?.checked
      ? (cutMode ? 'Cut & auto-publish' : 'Create & auto-publish')
      : (cutMode ? 'Cut selected range' : 'Create clips');
  }
}

async function loadStatus() {
  try {
    state.status = await api('/api/status');
    el.uploadLimit.textContent = 'Maximum upload size: ' + state.status.max_upload_mb + ' MiB';
    renderFacebookStatus();
  } catch {
    el.uploadLimit.textContent = 'Upload and processing run on this computer';
    if (el.facebookHeaderState) el.facebookHeaderState.textContent = 'Facebook status unavailable';
  }
}

function renderFacebookStatus() {
  if (!state.status) return;
  const configured = Boolean(state.status.facebook_app_configured);
  const connected = Boolean(state.status.facebook_connected);
  if (el.facebookHeaderState) {
    el.facebookHeaderState.textContent = !configured
      ? 'Facebook setup needed'
      : connected ? 'Facebook Page connected' : 'Facebook not connected';
  }
  el.facebookSetupPrompt.classList.toggle('hidden', configured);
  el.facebookDisconnected.classList.toggle('hidden', !configured || connected);
  el.facebookConnected.classList.toggle('hidden', !connected);

  const pages = state.status.pages || [];
  const current = state.status.selected_page_id || '';
  if (el.facebookPageSelect) {
    el.facebookPageSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = pages.length ? 'Choose a Facebook Page…' : 'No Pages were returned';
    el.facebookPageSelect.appendChild(placeholder);
    pages.forEach(page => {
      const option = document.createElement('option');
      option.value = String(page.id);
      option.textContent = page.name;
      el.facebookPageSelect.appendChild(option);
    });
    el.facebookPageSelect.value = current;
  }

  const selectedPage = pages.find(page => String(page.id) === String(current));
  if (el.facebookConnectedCaption) {
    el.facebookConnectedCaption.textContent = selectedPage
      ? 'Selected Page: ' + selectedPage.name + '. Ready when you are.'
      : 'Facebook is connected. Choose a Page above and click Use this Page.';
  }
  if (el.selectFacebookPage) {
    el.selectFacebookPage.disabled = !connected || !el.facebookPageSelect.value || el.facebookPageSelect.value === current;
  }
  updatePublishUI();
}

function renderPublishLog() {
  if (!el.publishLog) return;
  const log = state.job?.publish_log || [];
  el.publishLog.innerHTML = log.map(item => {
    const status = String(item.status || 'queued');
    const good = ['submitted', 'published'].includes(status);
    const bad = ['failed', 'blocked'].includes(status);
    const css = good ? ' published' : bad ? ' failed' : '';
    const icon = good ? '✓' : bad ? '!' : '…';
    return '<div class="publish-log-row"><span class="publish-status-icon' + css + '">' + icon + '</span>' +
      '<div><strong>Part ' + escapeHtml(item.part) + ' · ' + escapeHtml(status) + '</strong>' +
      '<p>' + escapeHtml(item.message || '') + '</p></div></div>';
  }).join('');
}

function updatePublishUI() {
  if (!el.publishAll) return;
  const job = state.job;
  const publishStatus = job?.publish_status || 'not_started';
  const ready = Boolean(job && job.status === 'completed' && Array.isArray(job.clips) && job.clips.length);
  const pageSelected = Boolean(state.status?.selected_page_id);
  const busy = ['queued', 'publishing'].includes(publishStatus);
  const done = publishStatus === 'completed';
  const failed = publishStatus === 'error';
  const label = el.publishAll.querySelector('span:nth-child(2)');

  el.publishAll.disabled = !ready || !pageSelected || busy || done;
  if (label) {
    label.textContent = busy ? 'Publishing clips…'
      : done ? 'All clips submitted'
      : failed ? 'Retry remaining clips'
      : 'Publish all clips in order';
  }

  const selectedPage = (state.status?.pages || []).find(page => String(page.id) === String(state.status?.selected_page_id));
  const pageName = selectedPage?.name || 'your selected Page';
  if (!state.status?.facebook_app_configured) {
    el.publishHint.textContent = 'Complete the one-time Meta setup first.';
  } else if (!state.status.facebook_connected) {
    el.publishHint.textContent = 'Connect Facebook and approve Page publishing permissions.';
  } else if (!pageSelected) {
    el.publishHint.textContent = 'Choose a Page above and click Use this Page.';
  } else if (job?.auto_publish && ['queued', 'processing'].includes(job.status) && publishStatus === 'not_started') {
    el.publishHint.textContent = 'Auto-publish is enabled. Your clips will be sent to ' + pageName + ' when editing finishes.';
  } else if (!ready) {
    el.publishHint.textContent = 'Create your clips first. Nothing publishes unless you press Publish or enable auto-publish for a job.';
  } else if (busy) {
    el.publishHint.textContent = 'Publishing to ' + pageName + ' in order. The queue stops on the first failed part.';
  } else if (done) {
    el.publishHint.textContent = 'Facebook accepted all clip publish requests for ' + pageName + '.';
  } else if (failed) {
    el.publishHint.textContent = 'A part failed. Fix the issue and retry the remaining parts.';
  } else {
    el.publishHint.textContent = 'Ready to publish ' + job.clips.length + ' clip(s) to ' + pageName + '. You must press Publish.';
  }

  const showProgress = Boolean(job && ['queued', 'publishing', 'completed', 'error'].includes(publishStatus) && publishStatus !== 'not_started');
  el.publishProgress.classList.toggle('hidden', !showProgress);
  if (showProgress) {
    const percent = Number(job.publish_progress || 0);
    el.publishPercent.textContent = percent + '%';
    el.publishBar.style.width = percent + '%';
    el.publishStatusLabel.textContent = busy ? 'Publishing clips…'
      : done ? 'Publish requests completed'
      : failed ? 'Publishing stopped after an error'
      : 'Waiting to publish…';
    el.publishSubtext.textContent = job.publish_error || (done
      ? 'Meta accepted the publish requests. Processing and public visibility may take a little time.'
      : 'Clips are submitted one at a time in order. Partly stops if one fails.');
  }
  renderPublishLog();
}

async function saveSelectedPage() {
  const pageId = el.facebookPageSelect?.value;
  if (!pageId) return toast('Choose a Facebook Page first.');
  el.selectFacebookPage.disabled = true;
  try {
    await api('/api/facebook/select', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({page_id: pageId})
    });
    state.status = await api('/api/status');
    renderFacebookStatus();
    toast('Publishing destination saved.');
  } catch (error) {
    renderFacebookStatus();
    toast(error.message);
  }
}

async function startPublishing() {
  if (!state.job?.id || state.job.status !== 'completed') return toast('Create clips first.');
  if (!state.status?.selected_page_id) return toast('Connect Facebook and select a Page first.');
  const selectedPage = (state.status.pages || []).find(page => String(page.id) === String(state.status.selected_page_id));
  const pageName = selectedPage?.name || 'your selected Page';
  const count = (state.job.clips || []).length;
  if (!window.confirm('Publish ' + count + ' clip(s) to "' + pageName + '" in order? This will create posts on that Facebook Page.')) return;

  el.publishAll.disabled = true;
  try {
    state.job = await api('/api/jobs/' + state.job.id + '/publish', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({caption_template: el.captionTemplate.value.trim() || 'Part {part} of {total}'})
    });
    updatePublishUI();
    toast('Publishing queue started.');
    clearTimeout(state.timer);
    state.timer = setTimeout(refreshJob, 700);
  } catch (error) {
    updatePublishUI();
    toast(error.message);
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
    el.processingSubtext.textContent = state.job.auto_publish
      ? 'Your video is waiting to be edited. The clips will publish automatically when ready.'
      : 'Your video is saved locally and waiting in the queue.';
  } else if (state.job.status === 'processing') {
    el.processingLabel.textContent = state.job.mode === 'cut' ? 'Cutting your selected range…' : 'Splitting your video…';
    el.processingSubtext.textContent = state.job.auto_publish
      ? 'FFmpeg is creating the clips. They will publish automatically to your selected Page when ready.'
      : 'FFmpeg is creating the portrait MP4 output. Large videos can take a little while.';
  } else if (state.job.status === 'completed') {
    el.processingLabel.textContent = state.job.mode === 'cut' ? 'Your cut is ready' : 'Your clips are ready';
    el.processingSubtext.textContent = (state.job.clips || []).length + ' file(s) created from ' + state.job.source_name + '.'
      + (state.job.auto_publish ? ' Auto-publishing has been triggered for your selected Page.' : '');
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
  updatePublishUI();
}

async function refreshJob() {
  if (!state.job?.id) return;
  try {
    state.job = await api('/api/jobs/' + state.job.id);
    updateProcessing();
    if (state.job.status === 'completed') drawClips();
    updatePublishUI();
    const stillProcessing = ['queued', 'processing'].includes(state.job.status);
    const stillPublishing = ['queued', 'publishing'].includes(state.job.publish_status);
    const awaitingAutoPublish = Boolean(
      state.job.auto_publish && state.job.status === 'completed' && state.job.publish_status === 'not_started'
    );
    if (stillProcessing || stillPublishing || awaitingAutoPublish) state.timer = setTimeout(refreshJob, 1200);
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
el.processingMode.addEventListener('change', () => {
  toast(el.processingMode.value === 'fast'
    ? 'Faster 720p mode selected.'
    : 'Higher-quality 1080p mode selected.');
});
el.autoPublish.addEventListener('change', updateMode);

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
  const processingMode = el.processingMode.value;
  const autoPublish = el.autoPublish.checked;

  if (autoPublish) {
    if (!state.status?.selected_page_id) {
      return toast('Connect Facebook and choose a Page before enabling auto-publish.');
    }
    const selectedPage = (state.status.pages || []).find(
      page => String(page.id) === String(state.status.selected_page_id)
    );
    const destination = selectedPage?.name || 'your selected Facebook Page';
    const confirmed = window.confirm(
      'Auto-publish enabled for this job. After editing finishes, Partly will publish the clips to "' +
      destination + '" in order. This creates posts on Facebook. Continue?'
    );
    if (!confirmed) return;
  }
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
    formData.append('processing_mode', processingMode);
    formData.append('auto_publish', String(autoPublish));
    formData.append('caption_template', el.captionTemplate.value.trim() || 'Part {part} of {total}');
    state.job = await api('/api/jobs', {method:'POST', body:formData});
    if (label) label.textContent = autoPublish
      ? (activeMode === 'cut' ? 'Cut & auto-publish' : 'Create & auto-publish')
      : (activeMode === 'cut' ? 'Cut selected range' : 'Create clips');
    updateProcessing();
    state.timer = setTimeout(refreshJob, 700);
    toast(activeMode === 'cut' ? 'Video uploaded. Your cut has started.' : 'Video uploaded. Splitting has started.');
  } catch (error) {
    el.processButton.disabled = false;
    if (label) label.textContent = el.autoPublish.checked
      ? (activeMode === 'cut' ? 'Cut & auto-publish' : 'Create & auto-publish')
      : (activeMode === 'cut' ? 'Cut selected range' : 'Create clips');
    toast(error.message);
  }
});

el.facebookPageSelect.addEventListener('change', () => {
  const samePage = el.facebookPageSelect.value === (state.status?.selected_page_id || '');
  el.selectFacebookPage.disabled = !el.facebookPageSelect.value || samePage;
});

el.selectFacebookPage.addEventListener('click', saveSelectedPage);
el.refreshFacebookStatus.addEventListener('click', async () => {
  el.refreshFacebookStatus.disabled = true;
  await loadStatus();
  el.refreshFacebookStatus.disabled = false;
  toast('Facebook Page list refreshed.');
});
el.publishAll.addEventListener('click', startPublishing);

el.downloadAll.addEventListener('click', event => {
  if (el.downloadAll.getAttribute('aria-disabled') === 'true') {
    event.preventDefault();
    toast('Wait until processing is complete before downloading.');
  }
});

updateMode();
loadStatus();
updatePublishUI();
