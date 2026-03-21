const socket = io();
let currentGuildId = null;

// --- DOM refs ---
const botAvatar         = document.getElementById('bot-avatar');
const botAvatarFallback = document.getElementById('bot-avatar-fallback');
const botName           = document.getElementById('bot-name');
const guildSelect       = document.getElementById('guild-select');
const guildLock         = document.getElementById('guild-lock');
const guildIcon         = document.getElementById('guild-icon');
const connBadge         = document.getElementById('conn-badge');
const nowPlayingTitle   = document.getElementById('now-playing-title');
const nowPlayingSub     = document.getElementById('now-playing-sub');
const playProgress      = document.getElementById('play-progress');
const playProgressFill  = document.getElementById('play-progress-fill');
const playProgressCur   = document.getElementById('play-progress-current');
const playProgressDur   = document.getElementById('play-progress-duration');
const queueList         = document.getElementById('queue-list');
const queueCount        = document.getElementById('queue-count');
const voiceConnectedBanner = document.getElementById('voice-connected-banner');
const voiceBannerIcon      = document.getElementById('vbanner-icon');
const voiceChannelName     = document.getElementById('voice-channel-name');
const voiceDiscMsg         = document.getElementById('voice-disc-msg');
const inputUrl          = document.getElementById('input-url');
const selectChannel     = document.getElementById('select-channel');
const cdIcon            = document.getElementById('cd-icon');
const btnPause          = document.getElementById('btn-pause');
const btnResume         = document.getElementById('btn-resume');
const btnSkip           = document.getElementById('btn-skip');
const btnDeleteCurrent  = document.getElementById('btn-delete-current');
const btnShuffle        = document.getElementById('btn-shuffle');
const btnDedupe         = document.getElementById('btn-dedupe');
const btnPurge          = document.getElementById('btn-purge');
const btnQueue          = document.getElementById('btn-queue');
const btnLeave          = document.getElementById('btn-leave');
const formQueue         = document.getElementById('form-queue');
const queueProgress     = document.getElementById('queue-progress');
const inputSearch       = document.getElementById('input-search');
const toastContainer    = document.getElementById('toast-container');
const historyList       = document.getElementById('history-list');
const historyCount      = document.getElementById('history-count');
const btnSavePlaylist   = document.getElementById('btn-save-playlist');
const btnLoadPlaylist   = document.getElementById('btn-load-playlist');

let isQueueProcessing = false;

// --- Offline overlay ---
const offlineOverlay  = document.getElementById('offline-overlay');
const offlineAttempts = document.getElementById('offline-attempts');
const MAX_RECONNECT_SHOW = 5;

function setUiDisabled(disabled) {
  document.body.classList.toggle('ui-disabled', disabled);
}
function showOfflineOverlay(attempts) {
  offlineOverlay.classList.add('visible');
  offlineAttempts.textContent = `재연결 시도 ${attempts}회째...`;
}
function hideOfflineOverlay() {
  offlineOverlay.classList.remove('visible');
}

// --- Socket connection status ---
socket.on('connect', () => {
  connBadge.textContent = '연결됨';
  connBadge.className = 'ok';
  setUiDisabled(false);
  hideOfflineOverlay();
  socket.emit('cmd:listGuilds');
  if (currentGuildId) {
    socket.emit('subscribe', { guildId: currentGuildId });
  }
});
socket.on('disconnect', () => {
  connBadge.textContent = '오프라인';
  connBadge.className = 'err';
  setUiDisabled(true);
});
socket.on('reconnect_attempt', (attempt) => {
  connBadge.textContent = `재연결 중...`;
  connBadge.className = 'err';
  if (attempt >= MAX_RECONNECT_SHOW) {
    showOfflineOverlay(attempt);
  }
});

// --- Bot profile ---
socket.on('botProfile', ({ username, avatar }) => {
  botName.textContent = username;
  if (avatar) {
    botAvatar.src = avatar;
    botAvatar.style.display = '';
    botAvatarFallback.style.display = 'none';
  }
});

// --- Guild list ---
let guildMap = {};

socket.on('guilds', (guilds) => {
  guildMap = {};
  guilds.forEach(g => { guildMap[g.id] = g; });

  const prev = guildSelect.value;
  guildSelect.innerHTML = '<option value="">서버 선택...</option>';
  guilds.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.name;
    guildSelect.appendChild(opt);
  });

  if (prev && [...guildSelect.options].some(o => o.value === prev)) {
    guildSelect.value = prev;
  } else if (guilds.length === 1) {
    guildSelect.value = guilds[0].id;
    guildSelect.dispatchEvent(new Event('change'));
    return;
  }
  updateGuildIcon(guildSelect.value);
});

function updateGuildIcon(guildId) {
  const g = guildMap[guildId];
  if (g?.icon) {
    guildIcon.src = g.icon;
    guildIcon.style.display = '';
  } else {
    guildIcon.style.display = 'none';
  }
}

guildSelect.addEventListener('change', () => {
  const guildId = guildSelect.value;
  if (!guildId) {
    currentGuildId = null;
    updateGuildIcon(null);
    voiceCard.classList.add('card--inactive');
    return;
  }
  currentGuildId = guildId;
  updateGuildIcon(guildId);
  voiceCard.classList.remove('card--inactive');
  socket.emit('subscribe', { guildId });
  socket.emit('cmd:listChannels', { guildId });
});

let channelList = [];
let currentConnectedChannel = null;

function renderChannelOptions() {
  const prevVal = selectChannel.value;
  selectChannel.innerHTML = '<option value="">채널 선택하여 참가...</option>';
  channelList.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.name;
    const isConnected = c.name === currentConnectedChannel;
    const memberPart = c.memberCount > 0 ? ` · ${c.memberCount}명` : '';
    if (isConnected) {
      opt.textContent = `${c.name} (참가 중${memberPart})`;
    } else if (c.memberCount > 0) {
      opt.textContent = `${c.name} (${c.memberCount}명)`;
    } else {
      opt.textContent = c.name;
    }
    selectChannel.appendChild(opt);
  });
  const targetVal = currentConnectedChannel || prevVal;
  if (targetVal && [...selectChannel.options].some(o => o.value === targetVal)) {
    selectChannel.value = targetVal;
  }
  if (selectChannel.disabled) setChannelLock(true);
}

socket.on('channels', (channels) => {
  channelList = channels;
  renderChannelOptions();
});

// --- State update ---
socket.on('state', (state) => {
  if (state.guildId !== currentGuildId) return;
  renderState(state);
  if (!isQueueProcessing) resetQueueBtn();
});

// --- Progress bar ---
let progressTimer = null;
let currentPlayStartTs = null;
let currentDuration = null;
let currentIsPaused = false;
let pausedElapsed = 0;

function startProgressTimer() {
  if (progressTimer) clearInterval(progressTimer);
  progressTimer = setInterval(updateProgressBar, 1000);
  updateProgressBar();
}

function stopProgressTimer() {
  if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
}

function updateProgressBar() {
  if (!currentPlayStartTs) return;
  const elapsed = currentIsPaused
    ? pausedElapsed
    : (Date.now() - currentPlayStartTs) / 1000;
  const dur = currentDuration;

  playProgressCur.textContent = fmtTime(elapsed);

  if (dur && dur > 0) {
    const pct = Math.min((elapsed / dur) * 100, 100);
    playProgressFill.style.width = pct + '%';
    playProgressFill.classList.remove('indeterminate');
    playProgressDur.textContent = fmtTime(dur);
  } else {
    playProgressFill.classList.add('indeterminate');
    playProgressFill.style.width = '35%';
    playProgressDur.textContent = '';
  }
}

function fmtTime(secs) {
  secs = Math.max(0, Math.floor(secs));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function renderState(state) {
  const isPaused  = state.playerStatus === 'paused';
  const isPlaying = !!state.currentItem;
  isLoading = isPlaying && !state.playStartTs; // 다운로드 중 (재생 미시작) — 모듈 변수 갱신

  // Now playing title + sub
  if (state.currentItem) {
    nowPlayingTitle.innerHTML = `
      <div class="track-title">${escHtml(state.currentItem.title)}</div>
      <a class="track-url" href="${escHtml(state.currentItem.url)}" target="_blank" rel="noopener">${escHtml(state.currentItem.url)}</a>
    `;
    nowPlayingTitle.classList.remove('idle');

    // Uploader/channel
    if (state.currentItem.uploader) {
      nowPlayingSub.textContent = '🎤 ' + state.currentItem.uploader;
      nowPlayingSub.style.display = '';
    } else {
      nowPlayingSub.style.display = 'none';
    }

    // Progress bar
    currentPlayStartTs = state.playStartTs;
    currentDuration    = state.currentItem.duration ?? null;
    currentIsPaused    = isPaused;
    if (!state.playStartTs) {
      // Loading: downloading audio before playback
      stopProgressTimer();
      playProgressFill.classList.remove('indeterminate');
      playProgressDur.textContent = '';
      if (state.downloadProgress != null) {
        playProgressFill.style.width = state.downloadProgress + '%';
        playProgressCur.textContent  = `다운로드 중... ${state.downloadProgress}%`;
      } else {
        playProgressFill.style.width = '0%';
        playProgressCur.textContent  = '준비 중...';
      }
    } else if (isPaused) {
      pausedElapsed = (Date.now() - state.playStartTs) / 1000;
      stopProgressTimer();
    } else {
      startProgressTimer();
    }
    playProgress.style.display = '';

  } else {
    nowPlayingTitle.innerHTML = '재생 중인 항목 없음';
    nowPlayingTitle.classList.add('idle');
    nowPlayingSub.style.display = 'none';
    playProgress.style.display = 'none';
    stopProgressTimer();
    currentPlayStartTs = null;
    currentDuration = null;
  }

  // CD icon
  cdIcon.className = 'cd ' + (isPlaying ? (isPaused ? 'paused' : 'playing') : 'idle');

  // Pause / Resume button toggle (로딩 중 비활성화)
  btnPause.style.display  = (isPlaying && !isPaused) ? '' : 'none';
  btnResume.style.display = (isPlaying && isPaused)  ? '' : 'none';
  btnPause.disabled   = isLoading;
  btnResume.disabled  = isLoading;
  btnSkip.style.display          = isPlaying ? '' : 'none';
  btnDeleteCurrent.style.display = isPlaying ? '' : 'none';
  btnSkip.disabled        = isLoading;
  btnDeleteCurrent.disabled = isLoading;

  // Queue
  isVoiceConnected   = state.connected;
  isCurrentlyPlaying = !!state.currentItem;
  currentQueue       = state.queue;
  renderQueue();

  // History
  if (state.history) renderHistory(state.history);

  // Voice section
  if (state.connected) {
    pendingChannelName = null;
    currentConnectedChannel = state.connectedChannelName;
    voiceConnectedBanner.style.display = '';
    voiceConnectedBanner.className = 'voice-connected-banner';
    voiceBannerIcon.textContent = '🔊';
    voiceChannelName.textContent = state.connectedChannelName || '연결됨';
    voiceDiscMsg.style.display = 'none';
    setChannelLock(true);
    guildSelect.disabled = true;
    guildLock.style.display = '';
  } else if (!pendingChannelName) {
    currentConnectedChannel = null;
    voiceConnectedBanner.style.display = 'none';
    voiceDiscMsg.style.display = '';
    setChannelLock(false);
    selectChannel.value = '';
    guildSelect.disabled = false;
    guildLock.style.display = 'none';
  }
  renderChannelOptions();
}

// --- History ---
function renderHistory(history) {
  if (!history || history.length === 0) {
    historyList.innerHTML = '<li class="history-empty">재생 기록이 없습니다.</li>';
    historyCount.textContent = '';
    return;
  }
  historyCount.textContent = `(${history.length})`;
  historyList.innerHTML = '';
  history.forEach((item, i) => {
    const li = document.createElement('li');
    li.className = 'history-item';
    const ago = fmtAgo(item.playedAt);
    const dur = item.duration ? ` · ${fmtTime(item.duration)}` : '';
    const urlPart = item.url
      ? `<a class="h-url" href="${escHtml(item.url)}" target="_blank" rel="noopener" title="${escHtml(item.url)}">${escHtml(item.url)}</a>`
      : '';
    li.innerHTML = `
      <span class="h-idx">${i + 1}</span>
      <span class="h-info">
        <span class="h-title" title="${escHtml(item.title)}">${escHtml(item.title)}</span>
        ${urlPart}
        <span class="h-meta">${ago}${dur}${item.uploader ? ' · ' + escHtml(item.uploader) : ''}</span>
      </span>
      <button class="btn-secondary btn-sm h-add-btn" title="대기열에 추가">↩</button>
    `;
    li.querySelector('.h-add-btn').addEventListener('click', () => {
      if (!currentGuildId) return showToast('서버를 먼저 선택하세요.', 'error');
      socket.emit('cmd:appendItems', { guildId: currentGuildId, items: [item] });
    });
    historyList.appendChild(li);
  });
}

function fmtAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60)   return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400)return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

// --- Playlists (local file) ---
btnSavePlaylist.addEventListener('click', () => {
  if (!currentQueue.length) return showToast('저장할 곡이 없습니다.', 'error');
  const data = { version: 1, savedAt: new Date().toISOString(), items: currentQueue };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nambibot-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`${currentQueue.length}곡 저장됨`, 'notice');
});

btnLoadPlaylist.addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        const items = Array.isArray(data) ? data : data.items;
        if (!Array.isArray(items) || !items.length) throw new Error('유효한 대기열 파일이 아닙니다.');
        const valid = items.filter(it => it && it.title && it.url);
        if (!valid.length) throw new Error('유효한 항목이 없습니다.');
        if (!currentGuildId) return showToast('서버를 먼저 선택하세요.', 'error');
        socket.emit('cmd:appendItems', { guildId: currentGuildId, items: valid });
      } catch (err) {
        showToast(err.message || '파일을 읽을 수 없습니다.', 'error');
      }
    };
    reader.readAsText(file);
  });
  input.click();
});

// --- Queue list click delegation ---
queueList.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn || !currentGuildId) return;
  if (btn.dataset.action === 'play' && !isVoiceConnected) return;
  const action = btn.dataset.action;
  const index = parseInt(btn.dataset.index, 10);
  if (action === 'play')   socket.emit('cmd:play',   { guildId: currentGuildId, index });
  if (action === 'delete') socket.emit('cmd:delete', { guildId: currentGuildId, index });
});

// --- Controls ---
btnPause.addEventListener('click',         () => emit('cmd:pause'));
btnResume.addEventListener('click',        () => emit('cmd:resume'));
btnSkip.addEventListener('click',          () => emit('cmd:skip'));
btnDeleteCurrent.addEventListener('click', () => emit('cmd:deleteCurrent'));
btnShuffle.addEventListener('click',       () => emit('cmd:shuffle'));
btnDedupe.addEventListener('click',        () => emit('cmd:dedupe'));
btnPurge.addEventListener('click',         () => emit('cmd:purge'));
btnLeave.addEventListener('click', () => {
  selectChannel.value = '';
  pendingChannelName = null;
  emit('cmd:leave');
});

// 채널 선택 → 연결 중 UI 표시 후 즉시 참가
let pendingChannelName = null;

function setChannelLock(locked) {
  selectChannel.disabled = locked;
  if (locked) {
    const sel = selectChannel.options[selectChannel.selectedIndex];
    if (sel && !sel.textContent.endsWith(' 🔒')) sel.textContent = sel.textContent + ' 🔒';
  } else {
    [...selectChannel.options].forEach(o => {
      if (o.textContent.endsWith(' 🔒')) o.textContent = o.textContent.slice(0, -2);
    });
  }
}

selectChannel.addEventListener('change', () => {
  const channelName = selectChannel.value;
  if (!channelName) return;
  pendingChannelName = channelName;
  setChannelLock(true);
  voiceConnectedBanner.style.display = '';
  voiceConnectedBanner.className = 'voice-connected-banner connecting';
  voiceBannerIcon.textContent = '⏳';
  voiceChannelName.textContent = channelName;
  voiceDiscMsg.style.display = 'none';
  emit('cmd:join', { channelName });
});

// --- Queue form ---
formQueue.addEventListener('submit', (e) => {
  e.preventDefault();
  const url = inputUrl.value.trim();
  if (!url || !currentGuildId || isQueueProcessing) return;
  isQueueProcessing = true;
  setQueueInputLock(true);
  socket.emit('cmd:queue', { guildId: currentGuildId, url });
});

socket.on('queueProgress', ({ guildId, status, current, total, count }) => {
  if (guildId !== currentGuildId) return;

  if (status === 'fetching' || status === 'downloading') {
    queueProgress.style.display = '';
    queueProgress.className = 'queue-progress fetching';

    const pct = (total && total > 0) ? Math.round((current / total) * 100) : null;
    const label = pct !== null
      ? `다운로드 중... ${current}/${total} (${pct}%)`
      : `다운로드 중... ${current}개 처리됨`;

    queueProgress.innerHTML = `
      <div class="progress-label">${label}</div>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill" style="width:${pct ?? 100}%;${pct === null ? 'animation:indeterminate 1.2s ease infinite;' : ''}"></div>
      </div>
    `;
  } else if (status === 'done') {
    queueProgress.className = 'queue-progress done';
    queueProgress.innerHTML = `✓ ${count}개 항목이 추가되었습니다.`;
    inputUrl.value = '';
    setTimeout(() => {
      queueProgress.style.display = 'none';
      resetQueueBtn();
    }, 2500);
  }
});

function setQueueInputLock(locked) {
  inputUrl.disabled = locked;
  btnQueue.disabled = locked;
}

function resetQueueBtn() {
  isQueueProcessing = false;
  setQueueInputLock(false);
  btnQueue.textContent = '추가';
}

// --- Notice & Error toast ---
socket.on('notice',   ({ message }) => showToast(message, 'notice'));
socket.on('cmdError', ({ message }) => {
  showToast(message, 'error');
  resetQueueBtn();
  queueProgress.style.display = 'none';
  if (pendingChannelName) {
    pendingChannelName = null;
    voiceConnectedBanner.style.display = 'none';
    voiceDiscMsg.style.display = '';
    setChannelLock(false);
  }
});

// --- Toast system ---
const TOAST_ICONS = { error: '✕', notice: '✓', info: 'ℹ' };
const TOAST_DUR = 3500;

function showToast(msg, type = 'error') {
  const el = document.createElement('div');
  el.className = `toast-item toast-${type}`;
  el.style.setProperty('--toast-dur', TOAST_DUR + 'ms');
  el.innerHTML = `
    <span class="toast-icon">${TOAST_ICONS[type] || '!'}</span>
    <span class="toast-msg">${escHtml(msg)}</span>
    <div class="toast-progress"></div>
  `;
  toastContainer.appendChild(el);

  // Limit stacked toasts to 4
  const toasts = toastContainer.querySelectorAll('.toast-item');
  if (toasts.length > 4) toasts[0].remove();

  setTimeout(() => {
    el.classList.add('toast-out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, TOAST_DUR);
}

// --- Queue search ---
inputSearch.addEventListener('input', renderQueue);

const addQueueCard    = document.getElementById('card-add-queue');
const addQueueHint    = document.getElementById('add-queue-hint');
const nowPlayingHint  = document.getElementById('now-playing-hint');
const voiceCard     = document.querySelector('.voice-card');
const guildProfile  = document.querySelector('.guild-profile');
const colMain       = document.querySelector('.col-main');
const colSide       = document.querySelector('.col-side');

// col-side max-height = col-main height (히스토리 카드가 대기열에 추가 card 아래로 넘어가지 않도록)
new ResizeObserver(() => {
  colSide.style.maxHeight = colMain.offsetHeight + 'px';
}).observe(colMain);
voiceCard.classList.add('card--inactive');
guildProfile.classList.add('guild-profile--cta');

let prevQueueLength = -1;

function renderQueue() {
  const q = inputSearch.value.trim().toLowerCase();
  const isFiltering = q.length > 0;

  const hasItems = currentQueue.length > 0;
  const itemsAdded = prevQueueLength >= 0 && currentQueue.length > prevQueueLength;
  prevQueueLength = currentQueue.length;
  inputSearch.closest('.queue-search').style.display = hasItems ? '' : 'none';
  if (!hasItems) inputSearch.value = '';

  btnShuffle.disabled = !hasItems;
  btnDedupe.disabled  = !hasItems;
  btnSavePlaylist.disabled = !hasItems;
  btnLoadPlaylist.disabled = false;
  btnPurge.disabled = !hasItems;

  nowPlayingHint.style.display = isVoiceConnected ? 'none' : '';
  nowPlayingHint.textContent = isVoiceConnected ? '' : '🔊 서버와 음성 채널을 먼저 선택하여 참가해주세요';

  guildProfile.classList.toggle('guild-profile--cta', !currentGuildId);
  voiceCard.classList.toggle('card--inactive', !currentGuildId);
  voiceCard.classList.toggle('card--cta', !!currentGuildId && !isVoiceConnected);

  if (!isVoiceConnected) {
    addQueueCard.classList.remove('card--cta', 'card--inactive');
    addQueueHint.style.display = 'none';
  } else if (!hasItems && !isCurrentlyPlaying) {
    addQueueCard.classList.remove('card--inactive');
    addQueueCard.classList.add('card--cta');
    addQueueHint.style.display = '';
    addQueueHint.className = 'add-queue-hint add-queue-hint--cta';
    addQueueHint.textContent = '⬇ URL을 입력하여 첫 번째 곡을 추가해보세요';
  } else if (!hasItems && isCurrentlyPlaying) {
    addQueueCard.classList.remove('card--inactive', 'card--cta');
    addQueueHint.style.display = '';
    addQueueHint.className = 'add-queue-hint add-queue-hint--secondary';
    addQueueHint.textContent = '다음 곡 URL을 입력하여 대기열을 채워보세요';
  } else {
    addQueueCard.classList.remove('card--inactive', 'card--cta');
    addQueueHint.style.display = 'none';
  }

  if (!hasItems) {
    queueList.innerHTML = `<li class="queue-empty">${isCurrentlyPlaying ? '다음 대기 곡이 없습니다.' : '대기열이 비어있습니다.'}</li>`;
    queueCount.textContent = '';
    return;
  }

  const entries = currentQueue.map((item, i) => ({ item, i }));
  const filtered = isFiltering
    ? entries.filter(({ item }) => item.title.toLowerCase().includes(q))
    : entries;

  queueCount.textContent = currentQueue.length
    ? (isFiltering ? `(${filtered.length}/${currentQueue.length})` : `(${currentQueue.length})`)
    : '';

  if (filtered.length === 0) {
    queueList.innerHTML = `<li class="queue-empty">검색 결과가 없습니다.</li>`;
    return;
  }

  queueList.innerHTML = '';
  filtered.forEach(({ item, i }) => {
    const li = document.createElement('li');
    li.className = 'queue-item';
    li.draggable = !isFiltering;
    li.dataset.index = i;
    const durStr = item.duration ? `<span class="q-dur">${fmtTime(item.duration)}</span>` : '';
    li.innerHTML = `
      <span class="drag-handle" title="드래그하여 순서 변경" ${isFiltering ? 'style="visibility:hidden"' : ''}>⠿</span>
      <span class="idx">${i + 1}</span>
      <span class="track-info">
        <span class="title" title="${escHtml(item.title)}">${highlight(item.title, q)}</span>
        <span class="track-meta">
          <a class="track-url" href="${escHtml(item.url)}" target="_blank" rel="noopener">${escHtml(item.url)}</a>
          ${durStr}
        </span>
      </span>
      <span class="actions">
        <button class="btn-secondary btn-sm" data-action="play" data-index="${i + 1}" ${(!isVoiceConnected || isLoading) ? 'disabled' : ''}>▶</button>
        <button class="btn-danger btn-sm"    data-action="delete" data-index="${i + 1}">✕</button>
      </span>
    `;
    queueList.appendChild(li);
  });
  if (!isFiltering) initDragAndDrop();
  if (itemsAdded && !isFiltering) queueList.scrollTop = queueList.scrollHeight;
}

// --- Drag and Drop ---
let currentQueue       = [];
let isVoiceConnected   = false;
let isCurrentlyPlaying = false;
let isLoading          = false; // 다운로드 중 (currentItem 있음 + playStartTs 없음)
let dragSrcIndex       = null;

function initDragAndDrop() {
  const items = queueList.querySelectorAll('li.queue-item');
  items.forEach(li => {
    li.addEventListener('dragstart', (e) => {
      dragSrcIndex = parseInt(li.dataset.index, 10);
      li.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    li.addEventListener('dragend', () => {
      li.classList.remove('dragging');
      items.forEach(i => i.classList.remove('drag-over'));
    });
    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      items.forEach(i => i.classList.remove('drag-over'));
      li.classList.add('drag-over');
    });
    li.addEventListener('dragleave', () => {
      li.classList.remove('drag-over');
    });
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      li.classList.remove('drag-over');
      const toIndex = parseInt(li.dataset.index, 10);
      if (dragSrcIndex === null || dragSrcIndex === toIndex) return;
      socket.emit('cmd:reorder', { guildId: currentGuildId, fromIndex: dragSrcIndex, toIndex });
      dragSrcIndex = null;
    });
  });
}

// --- Keyboard shortcuts ---
document.addEventListener('keydown', (e) => {
  // Ignore when typing in inputs
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (e.metaKey || e.ctrlKey) return;

  switch (e.code) {
    case 'Space':
      e.preventDefault();
      if (btnPause.style.display !== 'none')  emit('cmd:pause');
      else if (btnResume.style.display !== 'none') emit('cmd:resume');
      break;
    case 'ArrowRight':
      if (!e.altKey) break;
      e.preventDefault();
      if (btnSkip.style.display !== 'none') emit('cmd:skip');
      break;
    case 'Delete':
    case 'Backspace':
      if (e.shiftKey && btnDeleteCurrent.style.display !== 'none') {
        e.preventDefault();
        emit('cmd:deleteCurrent');
      }
      break;
  }
});

// --- Helpers ---
function emit(event, extra = {}) {
  if (!currentGuildId) return showToast('서버를 먼저 선택하세요.', 'error');
  socket.emit(event, { guildId: currentGuildId, ...extra });
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function highlight(text, query) {
  if (!query) return escHtml(text);
  const safe = escHtml(text);
  const safeQ = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return safe.replace(new RegExp(safeQ, 'gi'), m => `<mark class="search-highlight">${m}</mark>`);
}
