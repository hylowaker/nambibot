const socket = io({ transports: ['polling'], upgrade: false, reconnectionAttempts: Infinity, reconnectionDelay: 1000 });
socket.on('connect_error', () => {});
let currentGuildId = null;
let _playbackGuildId = null;

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
const playProgressTrack = document.querySelector('.play-progress-bar-track');
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

const _npCard = document.getElementById('card-now-playing');
document.querySelectorAll('.col-main > .card, .col-side > .card, #fab-listen').forEach((el, i) => {
  const delay = 0.06 + i * 0.06;
  el.style.opacity = '0';
  el.style.animation = `pageEnter 0.5s ease ${delay}s both`;
  el.addEventListener('animationend', () => { el.style.animation = ''; el.style.opacity = ''; }, { once: true });
});

socket.on('connect', () => {
  connBadge.textContent = '연결됨';
  connBadge.className = 'ok';
  setUiDisabled(false);
  hideOfflineOverlay();
  socket.emit('cmd:listGuilds');
  if (currentGuildId) {
    socket.emit('subscribe', { guildId: currentGuildId });
  } else if (_playbackGuildId) {
    socket.emit('subscribe', { guildId: _playbackGuildId });
  }
});
socket.on('disconnect', () => {
  connBadge.textContent = '오프라인';
  connBadge.className = 'err';
  setUiDisabled(true);
  destroyWebAudio();
  webListenTrackUrl = null;
  _webLastPlayStartTs = null;
  stopProgressTimer();
  cdIcon.className = 'cd paused';
  btnPause.style.display = 'none';
  btnResume.style.display = '';
  const npCard = document.getElementById('card-now-playing');
  npCard.classList.remove('np-playing');
  npCard.classList.add('np-paused');
  document.title = '오프라인 · nambibot';
});
socket.on('reconnect_attempt', (attempt) => {
  connBadge.textContent = `재연결 중...`;
  connBadge.className = 'err';
  if (attempt >= MAX_RECONNECT_SHOW) {
    showOfflineOverlay(attempt);
  }
});

socket.on('botProfile', ({ username, avatar }) => {
  botName.textContent = username;
  if (avatar) {
    botAvatar.src = avatar;
    botAvatar.style.display = '';
    botAvatarFallback.style.display = 'none';
    setCircleFavicon(avatar);
  }
});

socket.on('buildInfo', ({ version, build }) => {
  const footer = document.getElementById('page-footer');
  if (footer) {
    footer.textContent = `nambibot v${version}${build ? '  ·  ' + build : ''}`;
  }
});

let guildMap = {};

socket.on('guilds', (guilds) => {
  guildMap = {};
  guilds.forEach(g => { guildMap[g.id] = g; });

  guildSelect.innerHTML = '<option value="">서버 선택...</option>';
  guilds.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.name;
    guildSelect.appendChild(opt);
  });

  const validIds = new Set(guilds.map(g => g.id));

  const saved = localStorage.getItem('nambibot_guild');
  const wasCleared = saved === 'none';
  let targetId = null;
  if (currentGuildId && validIds.has(currentGuildId)) {
    targetId = currentGuildId;
  } else if (!wasCleared) {
    if (saved && validIds.has(saved)) {
      targetId = saved;
    } else {
      const connected = guilds.find(g => g.connected);
      if (connected) targetId = connected.id;
      else if (guilds.length === 1) targetId = guilds[0].id;
    }
  }

  if (targetId) {
    guildSelect.value = targetId;
    if (targetId !== currentGuildId) {
      guildSelect.dispatchEvent(new Event('change'));
      return;
    }
  } else if (wasCleared) {
    const pbGuild = localStorage.getItem('nambibot_guild_playback');
    if (pbGuild && validIds.has(pbGuild)) {
      _playbackGuildId = pbGuild;
      socket.emit('subscribe', { guildId: pbGuild });
    }
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
  const prevGuildId = currentGuildId;
  if (!guildId) {
    currentGuildId = null;
    localStorage.setItem('nambibot_guild', 'none');
    updateGuildIcon(null);
    voiceCard.classList.add('card--inactive');
    return;
  }
  currentGuildId = guildId;
  _playbackGuildId = guildId;
  localStorage.setItem('nambibot_guild', guildId);
  localStorage.setItem('nambibot_guild_playback', guildId);
  updateGuildIcon(guildId);
  voiceCard.classList.remove('card--inactive');
  if (prevGuildId && prevGuildId !== guildId) {
    socket.emit('cmd:migrateState', { fromGuildId: prevGuildId, toGuildId: guildId });
  }
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

socket.on('state', async (raw) => {
  const state = await decryptPayload(raw);
  if (!state) return;
  const isActive = state.guildId === currentGuildId
    || (!currentGuildId && state.guildId === _playbackGuildId);
  if (!isActive) return;
  renderState(state);
  if (!isQueueProcessing) { resetQueueBtn(); updateQueueBtnState(); }
});

let progressTimer = null;
let currentPlayStartTs = null;
let currentDuration = null;
let currentIsPaused = false;
let pausedElapsed = 0;
let currentPausedDuration = 0;

function startProgressTimer() {
  if (progressTimer) clearInterval(progressTimer);
  progressTimer = setInterval(updateProgressBar, 1000);
  updateProgressBar();
}

function stopProgressTimer() {
  if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
}

const seekTooltip = document.getElementById('seek-tooltip');
let _lastMoveTs = 0;

playProgressTrack.addEventListener('mousemove', (e) => {
  if (Date.now() - _lastMoveTs < 50) return;
  _lastMoveTs = Date.now();
  if (!playProgressTrack.classList.contains('seekable')) return;
  if (!currentDuration || currentDuration <= 0) return;
  const rect = playProgressTrack.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const hoverSec = pct * currentDuration;
  seekTooltip.textContent = fmtTime(hoverSec);
  seekTooltip.style.left = (pct * 100) + '%';
  seekTooltip.style.display = '';
});

playProgressTrack.addEventListener('mouseleave', () => {
  seekTooltip.style.display = 'none';
});

playProgressTrack.addEventListener('click', (e) => {
  if (!playProgressTrack.classList.contains('seekable')) return;
  if (!currentDuration || currentDuration <= 0) return;
  const rect = playProgressTrack.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const seekSec = pct * currentDuration;
  const gid = currentGuildId || _playbackGuildId;
  if (!gid) return;
  playProgressFill.style.transition = 'none';
  playProgressFill.style.width = (pct * 100) + '%';
  playProgressCur.textContent = fmtTime(seekSec);
  requestAnimationFrame(() => { playProgressFill.style.transition = ''; });
  socket.emit('cmd:seek', { guildId: gid, seconds: seekSec });
});

function updateProgressBar() {
  if (!currentPlayStartTs) return;
  const elapsed = currentIsPaused
    ? pausedElapsed
    : (Date.now() - currentPlayStartTs - currentPausedDuration) / 1000;
  const dur = currentDuration;

  const curText = fmtTime(elapsed);
  if (_prevProgressText !== curText) {
    _prevProgressText = curText;
    playProgressCur.textContent = curText;
  }

  if (dur && dur > 0) {
    const pct = Math.min((elapsed / dur) * 100, 100);
    const widthVal = pct + '%';
    if (_prevProgressWidth !== widthVal) {
      _prevProgressWidth = widthVal;
      playProgressFill.style.width = widthVal;
    }
    playProgressFill.classList.remove('indeterminate');
    playProgressDur.textContent = fmtTime(dur);
  } else {
    playProgressFill.classList.add('indeterminate');
    playProgressFill.style.width = '35%';
    _prevProgressWidth = '35%';
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

let _prevTrackUrl = undefined;
let _prevProgressText = '';
let _prevProgressWidth = '';
let _prevNpUrl = undefined;

function renderState(state) {
  const isPaused  = state.playerStatus === 'paused';
  const isPlaying = !!state.currentItem;

  const curUrl = state.currentItem?.url ?? null;
  isLoading = isPlaying && !state.playStartTs;
  if (_prevTrackUrl !== undefined && curUrl && curUrl !== _prevTrackUrl && !isLoading) {
    const npBody = document.querySelector('.now-playing-body');
    npBody.classList.remove('np-transition');
    void npBody.offsetWidth;
    npBody.classList.add('np-transition');
  }
  if (!isLoading) _prevTrackUrl = curUrl;

  if (state.currentItem) {
    if (_prevNpUrl !== state.currentItem.url) {
      _prevNpUrl = state.currentItem.url;
      nowPlayingTitle.innerHTML = `
        <div class="track-title">${escHtml(state.currentItem.title)}</div>
        <a class="track-url" href="${escHtml(state.currentItem.url)}" target="_blank" rel="noopener">${escHtml(state.currentItem.url)}</a>
      `;
    }
    nowPlayingTitle.classList.remove('idle');

    const cdLabel = document.querySelector('.cd-label');
    const thumb = state.currentItem.thumbnail;
    if (thumb) {
      cdLabel.innerHTML = `<img class="cd-label-img" src="${escHtml(thumb)}" alt="">`;
    } else {
      cdLabel.innerHTML = '';
    }

    if (state.currentItem.uploader) {
      nowPlayingSub.textContent = '🎤 ' + state.currentItem.uploader;
      nowPlayingSub.style.display = '';
    } else {
      nowPlayingSub.style.display = 'none';
    }

    currentPlayStartTs    = state.playStartTs;
    currentDuration       = state.currentItem.duration ?? null;
    currentIsPaused       = isPaused;
    currentPausedDuration = state.pausedDuration ?? 0;
    if (!state.playStartTs) {
      stopProgressTimer();
      playProgressFill.classList.remove('indeterminate', 'playing', 'paused');
      playProgressFill.classList.add('downloading');
      playProgressTrack.classList.add('downloading');
      playProgressDur.textContent = '';
      if (state.downloadProgress != null) {
        playProgressFill.style.width = state.downloadProgress + '%';
        playProgressCur.textContent  = `다운로드 중... ${state.downloadProgress}%`;
      } else {
        playProgressFill.style.width = '0%';
        playProgressCur.textContent  = '준비 중...';
      }
    } else if (isPaused) {
      pausedElapsed = (state.elapsedAtPauseMs ?? 0) / 1000;
      playProgressFill.classList.remove('downloading', 'playing', 'indeterminate');
      playProgressFill.classList.add('paused');
      playProgressTrack.classList.remove('downloading');
      stopProgressTimer();
    } else {
      playProgressFill.classList.remove('downloading', 'paused', 'indeterminate');
      playProgressFill.classList.add('playing');
      playProgressTrack.classList.remove('downloading');
      startProgressTimer();
    }
    playProgress.style.display = '';
    playProgressTrack.classList.toggle('seekable', !!state.playStartTs && !!currentDuration);

  } else {
    _prevNpUrl = undefined;
    nowPlayingTitle.innerHTML = '재생 중인 항목 없음';
    nowPlayingTitle.classList.add('idle');
    nowPlayingSub.style.display = 'none';
    document.querySelector('.cd-label').innerHTML = '';
    playProgress.style.display = 'none';
    playProgressFill.classList.remove('downloading', 'playing', 'paused');
    playProgressTrack.classList.remove('downloading');
    stopProgressTimer();
    currentPlayStartTs = null;
    currentDuration = null;
  }

  cdIcon.className = 'cd ' + (isPlaying ? (isLoading ? 'idle' : isPaused ? 'paused' : 'playing') : 'idle');

  const npCard = document.getElementById('card-now-playing');
  npCard.classList.toggle('np-playing', isPlaying && !isPaused && !isLoading);
  npCard.classList.toggle('np-paused', isPlaying && isPaused);

  const showListenHint = isPlaying && !state.connected && !webListenActive;
  if (showListenHint) {
    nowPlayingHint.innerHTML = '음성 채널 연결 없이도 <button class="hint-fab-btn" id="hint-fab-trigger">🔊</button> 버튼으로 브라우저에서 바로 들을 수 있어요';
    nowPlayingHint.style.display = '';
    const hintBtn = document.getElementById('hint-fab-trigger');
    if (hintBtn) hintBtn.addEventListener('click', () => { if (!webListenActive) startWebListen(); }, { once: true });
  } else {
    nowPlayingHint.style.display = 'none';
  }

  btnPause.style.display  = (isPlaying && !isPaused) ? '' : 'none';
  btnResume.style.display = (isPlaying && isPaused)  ? '' : 'none';
  btnPause.disabled   = isLoading;
  btnResume.disabled  = isLoading;
  btnSkip.style.display          = isPlaying ? '' : 'none';
  btnDeleteCurrent.style.display = isPlaying ? '' : 'none';
  btnSkip.disabled        = isLoading;
  btnDeleteCurrent.disabled = isLoading;

  isVoiceConnected   = state.connected;
  isCurrentlyPlaying = !!state.currentItem;
  currentQueue       = state.queue;
  renderQueue();

  if (state.history) renderHistory(state.history);

  const wasConnected = isVoiceConnected;
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
    if (!wasConnected) {
      voiceConnectedBanner.classList.remove('voice-anim-join', 'voice-anim-leave');
      void voiceConnectedBanner.offsetWidth;
      voiceConnectedBanner.classList.add('voice-anim-join');
    }
  } else if (!pendingChannelName) {
    if (wasConnected) {
      voiceConnectedBanner.classList.remove('voice-anim-join', 'voice-anim-leave');
      void voiceConnectedBanner.offsetWidth;
      voiceConnectedBanner.classList.add('voice-anim-leave');
      setTimeout(() => {
        voiceConnectedBanner.style.display = 'none';
        voiceConnectedBanner.classList.remove('voice-anim-leave');
      }, 350);
    } else {
      voiceConnectedBanner.style.display = 'none';
    }
    currentConnectedChannel = null;
    voiceDiscMsg.style.display = '';
    setChannelLock(false);
    selectChannel.value = '';
    guildSelect.disabled = false;
    guildLock.style.display = 'none';
  }
  renderChannelOptions();

  if (state.currentItem) {
    const prefix = isLoading ? '⏳ ' : isPaused ? '⏸️ ' : '▶️ ';
    document.title = prefix + state.currentItem.title + ' · nambibot';
  } else {
    document.title = 'nambibot · Music';
  }
}

function renderHistory(history) {
  if (!history || history.length === 0) {
    historyList.innerHTML = '<li class="history-empty">재생 기록이 없습니다.</li>';
    historyCount.textContent = '';
    return;
  }
  historyCount.textContent = `(${history.length})`;
  historyList.innerHTML = '';
  const histFrag = document.createDocumentFragment();
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
        <span class="h-meta">${ago}${dur}</span>
      </span>
      <button class="btn-secondary btn-sm h-add-btn" title="대기열에 추가">↩</button>
    `;
    li.querySelector('.h-add-btn').addEventListener('click', () => {
      const gid = currentGuildId || _playbackGuildId;
      if (!gid) return showToast('서버를 먼저 선택하세요.', 'error');
      socket.emit('cmd:appendItems', { guildId: gid, items: [item] });
    });
    histFrag.appendChild(li);
  });
  historyList.appendChild(histFrag);
}

function fmtAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60)   return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400)return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

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
        const gid = currentGuildId || _playbackGuildId;
        if (!gid) return showToast('서버를 먼저 선택하세요.', 'error');
        socket.emit('cmd:appendItems', { guildId: gid, items: valid });
      } catch (err) {
        showToast(err.message || '파일을 읽을 수 없습니다.', 'error');
      }
    };
    reader.readAsText(file);
  });
  input.click();
});

queueList.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  const gid = currentGuildId || _playbackGuildId;
  if (!btn || !gid) return;
  const action = btn.dataset.action;
  const index = parseInt(btn.dataset.index, 10);
  if (action === 'play') {
    triggerNpAnim('np-skip');
    socket.emit('cmd:play', { guildId: gid, index });
  }
  if (action === 'delete') {
    const li = btn.closest('.queue-item');
    if (li) { li.classList.add('q-anim-delete'); }
    socket.emit('cmd:delete', { guildId: gid, index });
  }
});

const UI_ACTION_MAP = {
  shuffle: 'q-anim-shuffle',
  dedupe:  'q-anim-dedupe',
  purge:   'q-anim-purge',
};
socket.on('uiAction', ({ action }) => {
  const cls = UI_ACTION_MAP[action];
  if (cls) triggerQueueAnim(cls);
});

function triggerQueueAnim(cls) {
  queueList.classList.remove('q-anim-shuffle', 'q-anim-dedupe', 'q-anim-purge');
  void queueList.offsetWidth;
  queueList.classList.add(cls);
  queueList.addEventListener('animationend', () => queueList.classList.remove(cls), { once: true });
}

function triggerNpAnim(cls) {
  const npBody = document.querySelector('.now-playing-body');
  npBody.classList.remove('np-skip', 'np-delete', 'np-transition');
  void npBody.offsetWidth;
  npBody.classList.add(cls);
  npBody.addEventListener('animationend', () => npBody.classList.remove(cls), { once: true });
}

btnPause.addEventListener('click',         () => emit('cmd:pause'));
btnResume.addEventListener('click',        () => emit('cmd:resume'));
btnSkip.addEventListener('click',          () => {
  emit('cmd:skip'); queueList.scrollTop = 0;
  triggerNpAnim('np-skip');
});
btnDeleteCurrent.addEventListener('click', () => {
  emit('cmd:deleteCurrent');
  triggerNpAnim('np-delete');
});
btnShuffle.addEventListener('click',       () => emit('cmd:shuffle'));
btnDedupe.addEventListener('click',        () => emit('cmd:dedupe'));
btnPurge.addEventListener('click',         () => emit('cmd:purge'));
btnLeave.addEventListener('click', () => {
  selectChannel.value = '';
  pendingChannelName = null;
  emit('cmd:leave');
});

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

const btnPlayNow = document.getElementById('btn-play-now');
btnQueue.disabled = true;
btnPlayNow.disabled = true;

formQueue.addEventListener('submit', (e) => {
  e.preventDefault();
  const url = inputUrl.value.trim();
  const gid = currentGuildId || _playbackGuildId;
  if (!url || !gid || isQueueProcessing) return;
  isQueueProcessing = true;
  setQueueInputLock(true);
  socket.emit('cmd:queue', { guildId: gid, url });
});

let _playNowScrollTop = false;

btnPlayNow.addEventListener('click', () => {
  const url = inputUrl.value.trim();
  const gid = currentGuildId || _playbackGuildId;
  if (!url || !gid || isQueueProcessing) return;
  isQueueProcessing = true;
  _playNowScrollTop = true;
  setQueueInputLock(true);
  socket.emit('cmd:playNow', { guildId: gid, url });
});

socket.on('queueProgress', ({ guildId, status, current, total, count }) => {
  if (guildId !== currentGuildId && guildId !== _playbackGuildId) return;

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

function updateQueueBtnState() {
  const empty = !inputUrl.value.trim();
  btnQueue.disabled = empty || isQueueProcessing;
  btnPlayNow.disabled = empty || isQueueProcessing;
}

function setQueueInputLock(locked) {
  inputUrl.disabled = locked;
  if (locked) {
    btnQueue.disabled = true;
    btnPlayNow.disabled = true;
  }
}

inputUrl.addEventListener('input', updateQueueBtnState);
inputUrl.addEventListener('change', updateQueueBtnState);
inputUrl.addEventListener('paste', () => setTimeout(updateQueueBtnState, 0));

function resetQueueBtn() {
  isQueueProcessing = false;
  setQueueInputLock(false);
  updateQueueBtnState();
  btnQueue.textContent = '대기열 추가';
}

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

  const toasts = toastContainer.querySelectorAll('.toast-item');
  if (toasts.length > 4) toasts[0].remove();

  setTimeout(() => {
    el.classList.add('toast-out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, TOAST_DUR);
}

inputSearch.addEventListener('input', renderQueue);

const addQueueCard    = document.getElementById('card-add-queue');
const addQueueHint    = document.getElementById('add-queue-hint');
const nowPlayingHint  = document.getElementById('now-playing-hint');
const voiceCard     = document.querySelector('.voice-card');
const guildProfile  = document.querySelector('.guild-profile');
const colMain       = document.querySelector('.col-main');
const colSide       = document.querySelector('.col-side');

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
  const oldLength = prevQueueLength;
  const itemsAdded = oldLength >= 0 && currentQueue.length > oldLength;
  prevQueueLength = currentQueue.length;
  inputSearch.closest('.queue-search').style.display = hasItems ? '' : 'none';
  if (!hasItems) inputSearch.value = '';

  btnShuffle.disabled = !hasItems;
  btnDedupe.disabled  = !hasItems;
  btnSavePlaylist.disabled = !hasItems;
  btnLoadPlaylist.disabled = false;
  btnPurge.disabled = !hasItems;

  guildProfile.classList.toggle('guild-profile--cta', !currentGuildId);
  voiceCard.classList.toggle('card--inactive', !currentGuildId);
  voiceCard.classList.toggle('card--cta', !!currentGuildId && !isVoiceConnected);

  if (!hasItems && !isCurrentlyPlaying) {
    addQueueCard.classList.remove('card--inactive');
    addQueueCard.classList.add('card--cta');
    addQueueHint.style.display = '';
    addQueueHint.className = 'add-queue-hint add-queue-hint--cta';
    addQueueHint.textContent = '⬇ URL을 입력하여 첫 번째 곡을 추가해보세요';
  } else if (!hasItems && isCurrentlyPlaying) {
    addQueueCard.classList.remove('card--inactive');
    addQueueCard.classList.add('card--cta');
    addQueueHint.style.display = '';
    addQueueHint.className = 'add-queue-hint add-queue-hint--cta';
    addQueueHint.textContent = '⬇ 다음 곡 URL을 입력하여 대기열을 채워보세요';
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
  const frag = document.createDocumentFragment();
  filtered.forEach(({ item, i }) => {
    const li = document.createElement('li');
    li.className = 'queue-item';
    li.draggable = !isFiltering;
    li.dataset.index = i;
    const durStr = item.duration ? `<span class="q-dur">${fmtTime(item.duration)}</span>` : '';
    const uploaderStr = item.uploader ? `<span class="q-uploader">${escHtml(item.uploader)}</span>` : '';
    const thumbSrc = item.thumbnail ? escHtml(item.thumbnail) : '';
    const thumbHtml = `<div class="q-album">
      <div class="q-album-case">${thumbSrc ? `<img src="${thumbSrc}" alt="" loading="lazy">` : '<span class="q-album-note">🎵</span>'}</div>
      <div class="q-album-disc"><div class="q-disc-label">${thumbSrc ? `<img src="${thumbSrc}" alt="" loading="lazy">` : ''}</div><div class="q-disc-hole"></div></div>
    </div>`;
    li.innerHTML = `
      <span class="drag-handle" title="드래그하여 순서 변경" ${isFiltering ? 'style="visibility:hidden"' : ''}>⠿</span>
      <span class="idx">${i + 1}</span>
      ${thumbHtml}
      <span class="track-info">
        <span class="title" title="${escHtml(item.title)}">${highlight(item.title, q)}</span>
        <span class="track-meta">
          <a class="track-url" href="${escHtml(item.url)}" target="_blank" rel="noopener">${escHtml(item.url)}</a>
          ${durStr}${uploaderStr}
        </span>
      </span>
      <span class="actions">
        <button class="btn-secondary btn-sm" data-action="play" data-index="${i + 1}" ${isLoading ? 'disabled' : ''}>▶</button>
        <button class="btn-danger btn-sm"    data-action="delete" data-index="${i + 1}">✕</button>
      </span>
    `;
    if (itemsAdded && !isFiltering && i >= oldLength) {
      li.classList.add('q-anim-add');
      li.addEventListener('animationend', () => li.classList.remove('q-anim-add'), { once: true });
    }
    frag.appendChild(li);
  });
  queueList.appendChild(frag);
  if (itemsAdded && !isFiltering) {
    if (_playNowScrollTop) {
      _playNowScrollTop = false;
      queueList.scrollTop = 0;
    } else {
      setTimeout(() => { queueList.scrollTop = queueList.scrollHeight; }, 100);
    }
  }
}

let currentQueue       = [];
let isVoiceConnected   = false;
let isCurrentlyPlaying = false;
let isLoading          = false;
let dragSrcIndex       = null;

queueList.addEventListener('dragstart', (e) => {
  const li = e.target.closest('.queue-item');
  if (!li) return;
  dragSrcIndex = parseInt(li.dataset.index, 10);
  li.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
});
queueList.addEventListener('dragend', (e) => {
  const li = e.target.closest('.queue-item');
  if (li) li.classList.remove('dragging');
  queueList.querySelectorAll('.queue-item.drag-over').forEach(el => el.classList.remove('drag-over'));
});
queueList.addEventListener('dragover', (e) => {
  const li = e.target.closest('.queue-item');
  if (!li) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  queueList.querySelectorAll('.queue-item.drag-over').forEach(el => el.classList.remove('drag-over'));
  li.classList.add('drag-over');
});
queueList.addEventListener('dragleave', (e) => {
  const li = e.target.closest('.queue-item');
  if (li) li.classList.remove('drag-over');
});
queueList.addEventListener('drop', (e) => {
  const li = e.target.closest('.queue-item');
  if (!li) return;
  e.preventDefault();
  li.classList.remove('drag-over');
  const toIndex = parseInt(li.dataset.index, 10);
  if (dragSrcIndex === null || dragSrcIndex === toIndex) return;
  socket.emit('cmd:reorder', { guildId: currentGuildId || _playbackGuildId, fromIndex: dragSrcIndex, toIndex });
  dragSrcIndex = null;
});

document.addEventListener('keydown', (e) => {
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

function emit(event, extra = {}) {
  const gid = currentGuildId || _playbackGuildId;
  if (!gid) return showToast('서버를 먼저 선택하세요.', 'error');
  socket.emit(event, { guildId: gid, ...extra });
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

const fabListen       = document.getElementById('fab-listen');
const webPlayerPanel  = document.getElementById('web-player');
const webPlayerClose  = document.getElementById('web-player-close');
const webPlayerTrack  = document.getElementById('web-player-track');
const webPlayerVolume = document.getElementById('web-player-volume');
const webPlayerVolLbl = document.getElementById('web-player-vol-label');
const webPlayerStatus = document.getElementById('web-player-status');

let webAudio = null;
let webListenActive = false;
let webListenTrackUrl = null;
let webListenHasAudio = false;
let _webLastPlayStartTs = null;

const savedVol = localStorage.getItem('nambibot_webvol');
if (savedVol !== null) {
  const vol = Math.max(0, Math.min(100, parseInt(savedVol, 10) || 0));
  webPlayerVolume.value = vol;
  webPlayerVolLbl.textContent = vol + '%';
}

fabListen.addEventListener('click', () => {
  if (_webPlayBlocked) {
    _resumeBlockedPlay();
    return;
  }
  if (webListenActive) {
    stopWebListen();
  } else {
    startWebListen();
  }
});

webPlayerClose.addEventListener('click', stopWebListen);

webPlayerPanel.addEventListener('click', (e) => {
  if (_webPlayBlocked && !e.target.closest('.web-player-close')) {
    _resumeBlockedPlay();
  }
});

webPlayerVolume.addEventListener('input', () => {
  const vol = parseInt(webPlayerVolume.value, 10);
  webPlayerVolLbl.textContent = vol + '%';
  localStorage.setItem('nambibot_webvol', vol);
  if (webAudio) webAudio.volume = vol / 100;
});

function startWebListen() {
  webListenActive = true;
  fabListen.classList.add('active');
  fabListen.querySelector('.fab-icon').textContent = '🔊';
  webPlayerPanel.style.display = '';
  localStorage.setItem('nambibot_weblisten', '1');
  nowPlayingHint.style.display = 'none';
  syncWebAudio();
}

function stopWebListen() {
  webListenActive = false;
  fabListen.classList.remove('active');
  fabListen.querySelector('.fab-icon').textContent = '🔇';
  webPlayerPanel.style.display = 'none';
  localStorage.removeItem('nambibot_weblisten');
  destroyWebAudio();
  webListenTrackUrl = null;
  webPlayerTrack.textContent = '재생 중인 곡 없음';
  webPlayerTrack.classList.add('idle');
  webPlayerStatus.textContent = '';
  webPlayerStatus.className = 'web-player-status';
  if (isCurrentlyPlaying && !isVoiceConnected) {
    nowPlayingHint.innerHTML = '음성 채널 연결 없이도 <button class="hint-fab-btn" id="hint-fab-trigger">🔊</button> 버튼으로 브라우저에서 바로 들을 수 있어요';
    nowPlayingHint.style.display = '';
    const hintBtn = document.getElementById('hint-fab-trigger');
    if (hintBtn) hintBtn.addEventListener('click', () => { if (!webListenActive) startWebListen(); }, { once: true });
  }
}

let _webPlayBlocked = false;

function _tryWebPlay() {
  if (!webAudio) return;
  webAudio.play().then(() => {
    _webPlayBlocked = false;
    webPlayerStatus.textContent = '재생 중';
    webPlayerStatus.className = 'web-player-status';
    fabListen.classList.remove('blocked');
  }).catch(() => {
    _webPlayBlocked = true;
    webPlayerStatus.textContent = '🔇 버튼을 클릭하여 재생';
    webPlayerStatus.className = 'web-player-status error';
    fabListen.classList.add('blocked');
  });
}

function _resumeBlockedPlay() {
  if (!_webPlayBlocked || !webAudio) return;
  seekWebAudio();
  webAudio.play().then(() => {
    _webPlayBlocked = false;
    webPlayerStatus.textContent = '재생 중';
    webPlayerStatus.className = 'web-player-status';
    fabListen.classList.remove('blocked');
  }).catch(() => {});
}

const WEB_CROSSFADE_MS = 3000;
let _crossfadeIntervals = [];

function destroyWebAudio() {
  _crossfadeIntervals.forEach(iv => clearInterval(iv));
  _crossfadeIntervals = [];
  if (webAudio) {
    webAudio.pause();
    webAudio.removeAttribute('src');
    webAudio.load();
    webAudio = null;
  }
}

function crossfadeOutOld(oldAudio) {
  if (!oldAudio) return;
  const steps = Math.ceil(WEB_CROSSFADE_MS / 50);
  const startVol = oldAudio.volume;
  const delta = startVol / steps;
  let step = 0;
  const iv = setInterval(() => {
    step++;
    if (step >= steps || oldAudio.paused) {
      clearInterval(iv);
      _crossfadeIntervals = _crossfadeIntervals.filter(x => x !== iv);
      oldAudio.pause();
      oldAudio.removeAttribute('src');
      oldAudio.load();
      return;
    }
    oldAudio.volume = Math.max(0, startVol - delta * step);
  }, 50);
  _crossfadeIntervals.push(iv);
}

function crossfadeInNew(audio, targetVol) {
  if (!audio) return;
  audio.volume = 0;
  const steps = Math.ceil(WEB_CROSSFADE_MS / 50);
  const delta = targetVol / steps;
  let step = 0;
  const iv = setInterval(() => {
    step++;
    if (step >= steps) {
      clearInterval(iv);
      _crossfadeIntervals = _crossfadeIntervals.filter(x => x !== iv);
      audio.volume = targetVol;
      return;
    }
    audio.volume = Math.min(targetVol, delta * step);
  }, 50);
  _crossfadeIntervals.push(iv);
}

function syncWebAudio() {
  const gid = currentGuildId || _playbackGuildId;
  if (!webListenActive || !gid) return;

  const isDownloading = isCurrentlyPlaying && !currentPlayStartTs;
  if (!currentPlayStartTs && !currentIsPaused) {
    destroyWebAudio();
    webListenTrackUrl = null;
    _webLastPlayStartTs = null;
    webPlayerTrack.textContent = isDownloading ? '다운로드 중...' : '재생 중인 곡 없음';
    webPlayerTrack.classList.toggle('idle', !isDownloading);
    webPlayerStatus.textContent = isDownloading ? '오디오 준비 대기 중' : '';
    webPlayerStatus.className = 'web-player-status' + (isDownloading ? ' syncing' : '');
    return;
  }

  if (currentPlayStartTs && currentPlayStartTs !== _webLastPlayStartTs) {
    _webLastPlayStartTs = currentPlayStartTs;
    webListenTrackUrl = null;
  }

  const streamUrl = `/api/stream/${gid}?t=${Date.now()}`;

  const nowTitle = document.querySelector('.track-title')?.textContent || '';
  const trackKey = gid + ':' + nowTitle + ':' + currentPlayStartTs;

  if (webListenTrackUrl !== trackKey) {
    const oldAudio = webAudio;
    webListenTrackUrl = trackKey;

    webAudio = new Audio();
    const targetVol = parseInt(webPlayerVolume.value, 10) / 100;
    webAudio.volume = 0;
    webAudio.preload = 'auto';

    webPlayerTrack.textContent = nowTitle || '로딩 중...';
    webPlayerTrack.classList.remove('idle');
    webPlayerStatus.textContent = '스트림 로딩 중...';
    webPlayerStatus.className = 'web-player-status syncing';

    webAudio.addEventListener('canplay', () => {
      seekWebAudio();
      if (!currentIsPaused) {
        webAudio.play().then(() => {
          _webPlayBlocked = false;
          webPlayerStatus.textContent = '재생 중';
          webPlayerStatus.className = 'web-player-status';
          fabListen.classList.remove('blocked');
          if (oldAudio && !oldAudio.paused) {
            crossfadeOutOld(oldAudio);
          }
          crossfadeInNew(webAudio, targetVol);
        }).catch(() => {
          _webPlayBlocked = true;
          webPlayerStatus.textContent = '🔇 버튼을 클릭하여 재생';
          webPlayerStatus.className = 'web-player-status error';
          fabListen.classList.add('blocked');
          if (oldAudio) { oldAudio.pause(); oldAudio.removeAttribute('src'); }
        });
      } else {
        webPlayerStatus.textContent = '일시정지';
        webPlayerStatus.className = 'web-player-status';
        if (oldAudio) { oldAudio.pause(); oldAudio.removeAttribute('src'); }
      }
    }, { once: true });

    webAudio.addEventListener('error', () => {
      webPlayerStatus.textContent = '스트림 오류';
      webPlayerStatus.className = 'web-player-status error';
    });

    webAudio.addEventListener('ended', () => {
      webPlayerStatus.textContent = '곡 종료';
      webPlayerStatus.className = 'web-player-status';
      webListenTrackUrl = null;
    });

    webAudio.src = streamUrl;
    webAudio.load();
  } else if (webAudio) {
    if (currentIsPaused) {
      webAudio.pause();
      webPlayerStatus.textContent = '일시정지';
      webPlayerStatus.className = 'web-player-status';
    } else {
      seekWebAudio();
      _tryWebPlay();
    }
  }
}

function seekWebAudio() {
  if (!webAudio || !webAudio.duration || isNaN(webAudio.duration)) return;
  let targetSec;
  if (currentIsPaused) {
    targetSec = pausedElapsed;
  } else if (currentPlayStartTs) {
    targetSec = (Date.now() - currentPlayStartTs - currentPausedDuration) / 1000;
  } else {
    return;
  }
  targetSec = Math.max(0, Math.min(targetSec, webAudio.duration));
  if (Math.abs(webAudio.currentTime - targetSec) > 1.5) {
    webAudio.currentTime = targetSec;
  }
}

const _origRenderState = renderState;
renderState = function(state) {
  _origRenderState(state);
  webListenHasAudio = !!state.hasAudioFile;
  if (webListenActive) {
    syncWebAudio();
  }
};

document.addEventListener('visibilitychange', () => {
  document.body.classList.toggle('tab-hidden', document.hidden);
});

localStorage.removeItem('nambibot_weblisten');
