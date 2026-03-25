const { createAudioResource, StreamType, AudioPlayerStatus } = require('@discordjs/voice');
const { spawn } = require('child_process');
const { getState, clearState, disconnectVoice } = require('../state');
const { joinToChannel } = require('../voice');
const { playItem, initPlayer, cleanupPrefetch, prefetchNext, clearAutoAdvanceTimer } = require('../player');
const ytdlp = require('../ytdlp');
const stateBus = require('./stateBus');

function bumpQueue(state) { state._queueVersion = (state._queueVersion ?? 0) + 1; }

async function queue(client, guildId, url, onProgress) {
  if (typeof url !== 'string' || !(url.startsWith('http://') || url.startsWith('https://'))) {
    throw new Error('유효하지 않은 URL입니다. http:// 또는 https://로 시작해야 합니다.');
  }
  const guild = client.guilds.cache.get(guildId);
  const state = getState(guildId);

  onProgress?.({ status: 'fetching', current: 0, total: null });
  const items = await ytdlp.getInfo(url, (current, total) => {
    onProgress?.({ status: 'downloading', current, total });
  });
  onProgress?.({ status: 'done', count: items.length });

  if (items.length > 1) {
    const existingUrls = new Set(state.queue.map(q => q.url));
    if (state.currentItem) existingUrls.add(state.currentItem.url);
    const unique = items.filter(it => !existingUrls.has(it.url));
    state.queue.push(...unique);
  } else {
    state.queue.push(...items);
  }
  initPlayer(guildId);
  syncPrefetch(state);
  bumpQueue(state);
  stateBus.emit('stateChanged', guildId);

}

async function play(client, guildId, index) {
  initPlayer(guildId);
  const state = getState(guildId);
  const i = (index ?? 1) - 1;
  if (i < 0 || i >= state.queue.length) throw new Error('유효하지 않은 인덱스입니다.');

  if (state.currentItem && !state.playStartTs) {
    throw new Error('현재 곡을 불러오는 중입니다. 로딩이 끝난 후 다시 시도해주세요.');
  }

  const [item] = state.queue.splice(i, 1);
  cleanupPrefetch(state);

  let notice = null;
  if (state.currentItem) {
    state.queue.splice(i, 0, state.currentItem);
    notice = `"${state.currentItem.title}" 이(가) 대기열 ${i + 1}번으로 이동했습니다.`;
  }

  if (state.player.state.status !== AudioPlayerStatus.Idle) {
    state._skipAutoAdvance = true;
    state.player.stop();
  }
  bumpQueue(state);
  stateBus.emit('stateChanged', guildId);
  setImmediate(() => playItem(state, item).catch((err) => {
    console.error(`[player] [${guildId}] 재생 오류:`, err);
    state.currentItem = null;
    state.playStartTs = null;
    stateBus.emit('stateChanged', guildId);
  }));
  return notice;
}

function pause(client, guildId) {
  initPlayer(guildId);
  const state = getState(guildId);
  if (!state.currentItem) throw new Error('재생 중인 항목이 없습니다.');
  state.player.pause();
  stateBus.emit('stateChanged', guildId);
}

function resume(client, guildId) {
  initPlayer(guildId);
  const state = getState(guildId);
  if (!state.currentItem) throw new Error('재생 중인 항목이 없습니다.');

  if (state._pendingSeekSec != null) {
    if (state.player.state.status !== AudioPlayerStatus.Paused &&
        state.player.state.status !== AudioPlayerStatus.Idle) {
      state._pendingSeekSec = null;
      state.player.unpause();
    } else {
      const seekSec = state._pendingSeekSec;
      state._pendingSeekSec = null;

      const ffProc = spawn(ytdlp.FFMPEG_BIN, [
        '-ss', String(seekSec),
        '-i', state._audioFilePath,
        '-vn', '-c:a', 'libopus', '-b:a', '128k', '-f', 'ogg', 'pipe:1',
      ], { stdio: ['ignore', 'pipe', 'ignore'] });

      const resource = createAudioResource(ffProc.stdout, { inputType: StreamType.OggOpus });

      state._suppressStateChange = true;
      try {
        state._skipAutoAdvance = true;
        state.player.stop();
        state._skipAutoAdvance = false;

        state.playStartTs = Date.now() - (seekSec * 1000);
        state.pausedDuration = 0;
        state._pauseStartTs = null;
        state._elapsedAtPause = null;

        if (state.connection) state.connection.subscribe(state.player);
        state.player.play(resource);
      } finally {
        state._suppressStateChange = false;
      }

      const { scheduleAutoAdvance } = require('../player');
      const remainDur = state.currentItem.duration ? state.currentItem.duration - seekSec : 0;
      if (remainDur > 0) scheduleAutoAdvance(state, { ...state.currentItem, duration: remainDur });
    }
  } else {
    state.player.unpause();
  }

  stateBus.emit('stateChanged', guildId);
}

function deleteCurrent(client, guildId) {
  initPlayer(guildId);
  const state = getState(guildId);
  if (!state.currentItem) throw new Error('재생 중인 항목이 없습니다.');
  state._stopRequested = true;
  state.currentItem = null;
  state.player.stop();
  stateBus.emit('stateChanged', guildId);
}

async function skip(client, guildId) {
  initPlayer(guildId);
  const state = getState(guildId);
  if (!state.currentItem) throw new Error('재생 중인 항목이 없습니다.');
  if (!state.playStartTs) throw new Error('현재 곡을 불러오는 중입니다. 로딩이 끝난 후 다시 시도해주세요.');

  const skipped = state.currentItem;
  const nextItem = state.queue.shift() ?? null;
  state.queue.push(skipped);

  state._skipAutoAdvance = true;
  state.player.stop();

  if (nextItem) {
    await playItem(state, nextItem);
  }

  bumpQueue(state);
  stateBus.emit('stateChanged', guildId);
  return skipped.title;
}

function syncPrefetch(state) {
  const nextUrl = state.queue[0]?.url;
  if (!nextUrl || !state.currentItem) {
    if (state._prefetchedUrl) cleanupPrefetch(state);
    return;
  }
  if (state._prefetchedUrl === nextUrl) return;
  cleanupPrefetch(state);
  prefetchNext(state);
}

function reorder(client, guildId, fromIndex, toIndex) {
  const state = getState(guildId);
  const len = state.queue.length;
  if (fromIndex < 0 || fromIndex >= len || toIndex < 0 || toIndex >= len) {
    throw new Error('유효하지 않은 인덱스입니다.');
  }
  const [item] = state.queue.splice(fromIndex, 1);
  state.queue.splice(toIndex, 0, item);
  syncPrefetch(state);
  bumpQueue(state);
  stateBus.emit('stateChanged', guildId);
}

function del(client, guildId, index) {
  const state = getState(guildId);
  const i = (index ?? state.queue.length) - 1;
  if (i < 0 || i >= state.queue.length) throw new Error('유효하지 않은 인덱스입니다.');
  state.queue.splice(i, 1);
  syncPrefetch(state);
  bumpQueue(state);
  stateBus.emit('stateChanged', guildId);
}

function dedupe(client, guildId) {
  const state = getState(guildId);
  const seen = new Set();
  state.queue = state.queue.filter(item => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
  syncPrefetch(state);
  bumpQueue(state);
  stateBus.emit('stateChanged', guildId);
}

function shuffle(client, guildId) {
  const state = getState(guildId);
  for (let i = state.queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [state.queue[i], state.queue[j]] = [state.queue[j], state.queue[i]];
  }
  syncPrefetch(state);
  bumpQueue(state);
  stateBus.emit('stateChanged', guildId);
}

function purge(client, guildId) {
  const state = getState(guildId);
  state.queue = [];
  cleanupPrefetch(state);
  bumpQueue(state);
  stateBus.emit('stateChanged', guildId);
}

async function join(client, guildId, channelName) {
  const guild = client.guilds.cache.get(guildId);
  const channel = await joinToChannel(guild, { voice: {} }, channelName);
  stateBus.emit('stateChanged', guildId);
  return channel.name;
}

function leave(client, guildId) {
  const state = getState(guildId);
  disconnectVoice(state);
}

async function playNow(client, guildId, url, onProgress) {
  if (typeof url !== 'string' || !(url.startsWith('http://') || url.startsWith('https://'))) {
    throw new Error('유효하지 않은 URL입니다. http:// 또는 https://로 시작해야 합니다.');
  }
  initPlayer(guildId);
  const state = getState(guildId);

  if (state.currentItem && !state.playStartTs) {
    throw new Error('현재 곡을 불러오는 중입니다. 로딩이 끝난 후 다시 시도해주세요.');
  }

  onProgress?.({ status: 'fetching', current: 0, total: null });
  const items = await ytdlp.getInfo(url, (current, total) => {
    onProgress?.({ status: 'downloading', current, total });
  });
  onProgress?.({ status: 'done', count: items.length });

  cleanupPrefetch(state);

  const [first, ...rest] = items;
  if (rest.length > 0) {
    state.queue.unshift(...rest);
  }

  if (state.currentItem) {
    state.queue.unshift(state.currentItem);
    if (state.player.state.status !== AudioPlayerStatus.Idle) {
      state._skipAutoAdvance = true;
      state.player.stop();
    }
  }

  bumpQueue(state);
  stateBus.emit('stateChanged', guildId);
  await playItem(state, first);
}

function seek(client, guildId, seconds) {
  initPlayer(guildId);
  const state = getState(guildId);
  if (!state.currentItem) throw new Error('재생 중인 항목이 없습니다.');
  if (!state._audioFilePath) throw new Error('오디오 파일이 없습니다.');
  if (!state.playStartTs) throw new Error('아직 로딩 중입니다.');

  const seekSec = Math.max(0, seconds);
  const wasPaused = state.player.state.status === AudioPlayerStatus.Paused;
  clearAutoAdvanceTimer(state);

  if (wasPaused) {
    state._pendingSeekSec = seekSec;
    state.playStartTs = Date.now() - (seekSec * 1000);
    state.pausedDuration = 0;
    state._pauseStartTs = Date.now();
    state._elapsedAtPause = seekSec * 1000;
    stateBus.emit('stateChanged', guildId);
  } else {
    const ffProc = spawn(ytdlp.FFMPEG_BIN, [
      '-ss', String(seekSec),
      '-i', state._audioFilePath,
      '-vn',
      '-c:a', 'libopus',
      '-b:a', '128k',
      '-f', 'ogg',
      'pipe:1',
    ], { stdio: ['ignore', 'pipe', 'ignore'] });

    const resource = createAudioResource(ffProc.stdout, {
      inputType: StreamType.OggOpus,
    });
    state._suppressStateChange = true;
    try {
      state._skipAutoAdvance = true;
      state.player.stop();
      state._skipAutoAdvance = false;

      state.playStartTs = Date.now() - (seekSec * 1000);
      state.pausedDuration = 0;
      state._pauseStartTs = null;
      state._elapsedAtPause = null;

      if (state.connection) {
        state.connection.subscribe(state.player);
      }
      state.player.play(resource);
    } finally {
      state._suppressStateChange = false;
    }
    const { scheduleAutoAdvance } = require('../player');
    const remainDur = state.currentItem.duration ? state.currentItem.duration - seekSec : 0;
    if (remainDur > 0) {
      scheduleAutoAdvance(state, { ...state.currentItem, duration: remainDur });
    }
    stateBus.emit('stateChanged', guildId);
  }
  console.log(`[player] [${guildId}] 탐색: ${Math.floor(seekSec / 60)}:${String(Math.floor(seekSec) % 60).padStart(2, '0')}${wasPaused ? ' (일시정지 유지)' : ''}`);
}

module.exports = { queue, play, pause, resume, deleteCurrent, skip, reorder, del, purge, shuffle, dedupe, join, leave, playNow, seek };
