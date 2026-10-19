const $ = (selector) => document.querySelector(selector);
const state = { job: null, timer: null, status: null };
const el = {
  form: $('#uploadForm'), file: $('#videoFile'), dropzone: $('#dropzone'), dropTitle: $('#dropTitle'), dropHint: $('#dropHint'),
  uploadLimit: $('#uploadLimit'), processButton: $('#processButton'), processingProgress: $('#processingProgress'), processingLabel: $('#processingLabel'),
  processingPercent: $('#processingPercent'), processingBar: $('#processingBar'), processingSubtext: $('#processingSubtext'),
  pageSelectWrap: $('#pageSelectWrap'), pageSelect: $('#pageSelect'), connectedCaption: $('#connectedCaption'), connectLabel: $('#connectLabel'),
  resultsPanel: $('#resultsPanel'), resultSubtitle: $('#resultSubtitle'), clipCount: $('#clipCount'), clipGrid: $('#clipGrid'),
  publishButton: $('#publishButton'), publishHint: $('#publishHint'), captionTemplate: $('#captionTemplate'), publishingProgress: $('#publishingProgress'),
  publishingLabel: $('#publishingLabel'), publishingPercent: $('#publishingPercent'), publishingBar: $('#publishingBar'), publishingSubtext: $('#publishingSubtext'),
  publishLog: $('#publishLog'), toast: $('#toast')
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
  return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
}
function selectedPageReady() {
  return Boolean(state.status?.selected_page_id);
}
function updatePublishButton() {
  const jobReady = state.job?.status === 'completed' && (state.job?.clips || []).length > 0;
  const publishing = ['queued', 'publishing', 'completed'].includes(state.job?.publish_status);
  el.publishButton.disabled = !(jobReady && selectedPageReady()) || publishing;
  if (!selectedPageReady()) el.publishHint.textContent = 'Connect Facebook and choose a Page to enable publishing.';
  else if (!jobReady) el.publishHint.textContent = 'Process a video to prepare the clips.';
  else if (state.job?.publish_status === 'completed') el.publishHint.textContent = 'All parts were submitted to Facebook.';
  else if (['queued', 'publishing'].includes(state.job?.publish_status)) el.publishHint.textContent = 'Publishing is in progress. Keep this app running.';
  else el.publishHint.textContent = 'Ready to publish to ' + selectedPageName() + '.';
}
function selectedPageName() {
  const page = (state.status?.pages || []).find(item => item.id === state.status.selected_page_id);
  return page?.name || 'your selected Page';
}
async function loadStatus() {
  state.status = await api('/api/status');
  el.uploadLimit.textContent = 'Maximum upload size: ' + state.status.max_upload_mb + ' MiB';
  const connectFacebook = $('#connectFacebook');
  if (state.status.facebook_app_configured) {
    connectFacebook.href = '/auth/facebook/login';
    connectFacebook.classList.remove('is-unconfigured');
    el.connectLabel.textContent = state.status.facebook_connected ? 'Facebook connected · reconnect' : 'Connect Facebook';
  } else {
    connectFacebook.href = '/setup';
    connectFacebook.classList.add('is-unconfigured');
    el.connectLabel.textContent = 'Finish Facebook setup first';
  }
  if (state.status.pages?.length) {
    el.pageSelectWrap.classList.remove('hidden');
    el.pageSelect.innerHTML = '<option value="">Choose a Facebook Page…</option>' + state.status.pages.map(page =>
      '<option value="' + escapeHtml(page.id) + '">' + escapeHtml(page.name) + '</option>'
    ).join('');
    el.pageSelect.value = state.status.selected_page_id || '';
    el.connectedCaption.textContent = state.status.selected_page_id ? 'Selected: ' + selectedPageName() : 'Choose the Page for these clips.';
  } else {
    el.pageSelectWrap.classList.add('hidden');
  }
  updatePublishButton();
}
function updateProcessing() {
  if (!state.job) return;
  el.processingProgress.classList.remove('hidden');
  const percent = Number(state.job.progress || 0);
  el.processingPercent.textContent = percent + '%';
  el.processingBar.style.width = percent + '%';
  if (state.job.status === 'queued') {
    el.processingLabel.textContent = 'Waiting to process…';
    el.processingSubtext.textContent = 'The upload is queued on this computer.';
  } else if (state.job.status === 'processing') {
    el.processingLabel.textContent = 'Making your clips…';
    el.processingSubtext.textContent = 'Each clip is reframed for vertical video and labelled automatically.';
  } else if (state.job.status === 'completed') {
    el.processingLabel.textContent = 'Your clips are ready';
    el.processingSubtext.textContent = state.job.clips.length + ' clip(s) created from ' + state.job.source_name + '.';
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
  el.resultSubtitle.textContent = 'Created from ' + state.job.source_name + '. Review each part before publishing.';
  el.clipGrid.innerHTML = state.job.clips.map(clip => {
    const number = String(clip.part).padStart(2, '0');
    const src = escapeHtml(clip.url);
    return '<article class="clip-card">' +
      '<div class="clip-preview"><video controls preload="metadata" playsinline src="' + src + '"></video><span class="clip-number">PART ' + clip.part + '</span></div>' +
      '<div class="clip-card-body"><div class="clip-card-top"><strong>Part ' + number + '</strong><span class="clip-duration">' + fmtDuration(clip.duration) + '</span></div>' +
      '<div class="clip-meta">' + escapeHtml(clip.filename) + '</div>' +
      '<a class="download-link" href="' + src + '?download=true" download>Download MP4 ↗</a>' +
      '</div></article>';
  }).join('');
  updatePublishButton();
}
function drawPublishLog() {
  const logs = state.job?.publish_log || [];
  if (!logs.length) {
    el.publishLog.classList.add('hidden');
    return;
  }
  el.publishLog.classList.remove('hidden');
  el.publishLog.innerHTML = logs.map(item => {
    const cls = item.status === 'published' ? 'published' : item.status === 'failed' ? 'failed' : '';
    const icon = item.status === 'published' ? '✓' : item.status === 'failed' ? '!' : item.status === 'publishing' ? '↗' : '·';
    return '<div class="publish-log-row"><span class="publish-status-icon ' + cls + '">' + icon +
      '</span><div><strong>Part ' + escapeHtml(item.part) + ' — ' + escapeHtml(item.status) +
      '</strong><p>' + escapeHtml(item.message || '') + '</p></div></div>';
  }).join('');
}
function updatePublishing() {
  if (!state.job) return;
  const status = state.job.publish_status || 'not_started';
  const percent = Number(state.job.publish_progress || 0);
  const show = ['queued', 'publishing', 'completed', 'error'].includes(status) || (state.job.publish_log || []).length > 0;
  el.publishingProgress.classList.toggle('hidden', !show);
  if (show) {
    el.publishingPercent.textContent = status === 'error' ? '!' : percent + '%';
    el.publishingBar.style.width = percent + '%';
    el.publishingLabel.textContent = status === 'completed' ? 'Publishing submitted' : status === 'error' ? 'Publishing stopped' : status === 'queued' ? 'Publishing queued…' : 'Publishing clips…';
    el.publishingSubtext.textContent = state.job.publish_error || (status === 'completed' ? 'Facebook accepted all publishing requests.' : 'Each part is uploaded before the next part begins.');
  }
  drawPublishLog();
  updatePublishButton();
}
async function refreshJob() {
  if (!state.job?.id) return;
  try {
    state.job = await api('/api/jobs/' + state.job.id);
    updateProcessing();
    if (state.job.status === 'completed') drawClips();
    updatePublishing();
    const stillProcessing = ['queued', 'processing'].includes(state.job.status);
    const stillPublishing = ['queued', 'publishing'].includes(state.job.publish_status);
    if (stillProcessing || stillPublishing) state.timer = setTimeout(refreshJob, 1500);
  } catch (error) {
    toast(error.message);
  }
}
el.file.addEventListener('change', () => {
  const file = el.file.files?.[0];
  if (!file) return;
  el.dropTitle.textContent = file.name;
  el.dropHint.textContent = (file.size / (1024 * 1024)).toFixed(1) + ' MiB · ready to split';
});
for (const eventName of ['dragenter', 'dragover']) {
  el.dropzone.addEventListener(eventName, event => { event.preventDefault(); el.dropzone.classList.add('dragover'); });
}
for (const eventName of ['dragleave', 'drop']) {
  el.dropzone.addEventListener(eventName, event => { event.preventDefault(); el.dropzone.classList.remove('dragover'); });
}
el.dropzone.addEventListener('drop', event => {
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  el.file.files = transfer.files;
  el.file.dispatchEvent(new Event('change'));
});
el.form.addEventListener('submit', async event => {
  event.preventDefault();
  const file = el.file.files?.[0];
  if (!file) return toast('Choose a video file first.');
  if (state.status && file.size > state.status.max_upload_mb * 1024 * 1024) {
    return toast('This file is larger than ' + state.status.max_upload_mb + ' MiB.');
  }
  clearTimeout(state.timer);
  el.processButton.disabled = true;
  el.processButton.querySelector('span').textContent = 'Uploading…';
  try {
    const formData = new FormData();
    formData.append('video', file);
    state.job = await api('/api/jobs', {method:'POST', body:formData});
    el.resultsPanel.classList.add('hidden');
    el.processingProgress.classList.remove('hidden');
    el.processButton.querySelector('span').textContent = 'Make my clips';
    updateProcessing();
    state.timer = setTimeout(refreshJob, 750);
    toast('Video uploaded. Clip processing has started.');
  } catch (error) {
    el.processButton.disabled = false;
    el.processButton.querySelector('span').textContent = 'Make my clips';
    toast(error.message);
  }
});
el.pageSelect.addEventListener('change', async () => {
  if (!el.pageSelect.value) return;
  try {
    const result = await api('/api/facebook/select', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({page_id:el.pageSelect.value})});
    state.status.selected_page_id = result.selected_page_id;
    el.connectedCaption.textContent = 'Selected: ' + result.selected_page_name;
    updatePublishButton();
    toast('Publishing destination set to ' + result.selected_page_name + '.');
  } catch (error) { toast(error.message); }
});
el.publishButton.addEventListener('click', async () => {
  if (!state.job?.id) return;
  el.publishButton.disabled = true;
  try {
    state.job = await api('/api/jobs/' + state.job.id + '/publish', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({caption_template:el.captionTemplate.value || 'Part {part} of {total}'})});
    updatePublishing();
    state.timer = setTimeout(refreshJob, 750);
    toast('The clips have entered the publishing queue.');
  } catch (error) { updatePublishButton(); toast(error.message); }
});

loadStatus().catch(error => toast(error.message));
