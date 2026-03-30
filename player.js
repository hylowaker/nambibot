const { createAudioResource, StreamType, AudioPlayerStatus } = require('@discordjs/voice');
const { EmbedBuilder } = require('discord.js');
const { createReadStream, unlink, statSync, existsSync } = require('fs');
const { getState } = require('./state');
const ytdlp = require('./ytdlp');
const stateBus = require('./web/stateBus');

const LOADING_TIMEOUT_MS = 60_000;

async function playItem(state, item) {
  const guildId = state._guildId;

  state._stopRequested = false;

  clearTimeout(state._seekCooldownTimer);
  state._seekCooldownTimer = null;
  state._seekCooldown = false;
  state._seekPendingSec = null;
  if (state._seekFfProc) {
    try { state._seekFfProc.kill('SIGKILL'); } catch {}
    state._seekFfProc = null;
  }
  state._pendingSeekSec = null;

  state.currentItem = item;
  state.playStartTs = null;
  state.downloadProgress = null;
  state.pausedDuration = 0;
  state._pauseStartTs = null;
  state._elapsedAtPause = null;

  state.history.unshift({ ...item, playedAt: Date.now() });
  if (state.history.length > 20) state.history.pop();

  stateBus.emit('stateChanged', guildId);

  const loadingTimer = setTimeout(() => {
    if (state.currentItem === item && !state.playStartTs) {
      console.error(`[player] [${guildId}] 로딩 타임아웃 (${LOADING_TIMEOUT_MS / 1000}s): "${item.title}" — 상태 초기화`);
      state.currentItem = null;
      state.playStartTs = null;
      state.downloadProgress = null;
      state._stopRequested = false;
      stateBus.emit('stateChanged', guildId);
      const next = state.queue.shift();
      if (next) {
        state._queueVersion = (state._queueVersion ?? 0) + 1;
        console.log(`[player] [${guildId}] 다음 곡으로 이동: "${next.title}"`);
        playItem(state, next).catch(err => {
          console.error(`[player] [${guildId}] 자동 재생 오류:`, err);
        });
      }
    }
  }, LOADING_TIMEOUT_MS);

  let tmpPath;
  if (state._prefetchedPath && state._prefetchedUrl === item.url && existsSync(state._prefetchedPath)) {
    clearTimeout(loadingTimer);
    tmpPath = state._prefetchedPath;
    state._prefetchedPath = null;
    state._prefetchedUrl = null;
    let fileSize = '?';
    try { fileSize = `${(statSync(tmpPath).size / 1024).toFixed(0)} KB`; } catch {}
    console.log(`[player] [${guildId}] 사전 다운로드 사용: ${fileSize}  파일: ${tmpPath}`);
  } else {
    cleanupPrefetch(state);

    console.log(`[player] [${guildId}] 다운로드 시작: "${item.title}"`);
    const downloadStart = Date.now();
    let lastEmittedPct = -1;
    try {
      tmpPath = await ytdlp.createAudioFile(item.url, (pct) => {
        if (state.currentItem !== item) return;
        if (pct - lastEmittedPct >= 10 || pct === 100) {
          lastEmittedPct = pct;
          state.downloadProgress = pct;
          stateBus.emit('stateChanged', guildId);
        }
      });
    } catch (err) {
      clearTimeout(loadingTimer);
      if (state.currentItem !== item) return;
      console.error(`[player] [${guildId}] 다운로드 실패 — 건너뜀: "${item.title}"  오류: ${err.message}`);
      state.currentItem = null;
      state.playStartTs = null;
      state.downloadProgress = null;
      stateBus.emit('stateChanged', guildId);
      const next = state.queue.shift();
      if (next) {
        state._queueVersion = (state._queueVersion ?? 0) + 1;
        console.log(`[player] [${guildId}] 다음 곡으로 이동: "${next.title}"`);
        await playItem(state, next);
      } else {
        console.log(`[player] [${guildId}] 대기열 소진 — 재생 종료`);
      }
      return;
    }
    clearTimeout(loadingTimer);
    state.downloadProgress = null;
    const elapsed = ((Date.now() - downloadStart) / 1000).toFixed(1);

    let fileSize = '?';
    try { fileSize = `${(statSync(tmpPath).size / 1024).toFixed(0)} KB`; } catch {}
    console.log(`[player] [${guildId}] 다운로드 완료: ${fileSize}  소요: ${elapsed}s  파일: ${tmpPath}`);
  }

  if (state.currentItem !== item) {
    unlink(tmpPath, (err) => { if (err && err.code !== 'ENOENT') console.warn('[player] 임시 파일 삭제 실패:', tmpPath); });
    return;
  }

  if (state._stopRequested) {
    console.log(`[player] [${guildId}] 정지 요청됨 — 재생 취소`);
    state._stopRequested = false;
    unlink(tmpPath, (err) => { if (err && err.code !== 'ENOENT') console.warn('[player] 임시 파일 삭제 실패:', tmpPath); });
    state.currentItem = null;
    stateBus.emit('stateChanged', guildId);
    return;
  }

  if (state._audioFilePath) {
    unlink(state._audioFilePath, (err) => { if (err && err.code !== 'ENOENT') console.warn('[player] 임시 파일 삭제 실패:', state._audioFilePath); });
    state._audioFilePath = null;
  }

  state._audioFilePath = tmpPath;

  const stream = createReadStream(tmpPath);

  const resource = createAudioResource(stream, {
    inputType: StreamType.OggOpus,
  });
  state.playStartTs = Date.now();

  if (state.connection) {
    state.connection.subscribe(state.player);
  }
  state._stopRequested = false;
  state.currentItem = item;
  state.player.play(resource);
  stateBus.emit('stateChanged', guildId);

  scheduleAutoAdvance(state, item);

  const durStr = item.duration ? ` (${Math.floor(item.duration / 60)}:${String(item.duration % 60).padStart(2, '0')})` : '';
  console.log(`[player] [${guildId}] 재생 시작: "${item.title}"${durStr}`);

  if (state.textChannel) {
    await state.textChannel.send({
      embeds: [new EmbedBuilder()
        .setColor(0x30D158)
        .setDescription(`▶️ 지금 재생 중: **${state.currentItem.title}**`)],
    });
  }

  prefetchNext(state);
}

function prefetchNext(state) {
  const guildId = state._guildId;
  const nextItem = state.queue[0];
  if (!nextItem) return;

  if (state._prefetchedUrl === nextItem.url) return;
  if (state._prefetching) return;

  cleanupPrefetch(state);

  state._prefetching = true;
  state._prefetchedUrl = nextItem.url;

  console.log(`[player] [${guildId}] 다음 곡 사전 다운로드: "${nextItem.title}"`);

  ytdlp.createAudioFile(nextItem.url).then((path) => {
    const s = getState(guildId);
    if (s._prefetchedUrl === nextItem.url && s.queue[0]?.url === nextItem.url) {
      s._prefetchedPath = path;
      s._prefetching = false;
      let fileSize = '?';
      try { fileSize = `${(statSync(path).size / 1024).toFixed(0)} KB`; } catch {}
      console.log(`[player] [${guildId}] 사전 다운로드 완료: ${fileSize}  파일: ${path}`);
    } else {
      unlink(path, (err) => { if (err && err.code !== 'ENOENT') console.warn('[player] 임시 파일 삭제 실패:', path); });
      s._prefetching = false;
    }
  }).catch((err) => {
    const s = getState(guildId);
    s._prefetching = false;
    s._prefetchedUrl = null;
    console.warn(`[player] [${guildId}] 사전 다운로드 실패: "${nextItem.title}"  오류: ${err?.message ?? err}`);
  });
}

function cleanupPrefetch(state) {
  if (state._prefetchedPath) {
    unlink(state._prefetchedPath, (err) => { if (err && err.code !== 'ENOENT') console.warn('[player] 임시 파일 삭제 실패:', state._prefetchedPath); });
    state._prefetchedPath = null;
  }
  state._prefetchedUrl = null;
  state._prefetching = false;
}

function scheduleAutoAdvance(state, item) {
  clearAutoAdvanceTimer(state);
  if (!item.duration || item.duration <= 0) return;

  const timeout = (item.duration * 1000) + 5000;
  state._autoAdvanceTimer = setTimeout(() => {
    state._autoAdvanceTimer = null;
    if (state.currentItem !== item) return;
    if (state.player.state.status === AudioPlayerStatus.Paused) return;
    console.warn(`[player] [${state._guildId}] 안전 타이머: Idle 미발생 — 강제 전환`);
    state.player.stop(true);
  }, timeout);
}

function clearAutoAdvanceTimer(state) {
  if (state._autoAdvanceTimer) {
    clearTimeout(state._autoAdvanceTimer);
    state._autoAdvanceTimer = null;
  }
}

function initPlayer(guildId) {
  const state = getState(guildId);
  if (state._playerInitialized) {
    return;
  }
  state._playerInitialized = true;

  state.player.on(AudioPlayerStatus.Idle, () => {
    const s = getState(guildId);

    if (s._stopRequested) {
      s._stopRequested = false;
      s.currentItem = null;
      s.playStartTs = null;
      s.pausedDuration = 0;
      s._pauseStartTs = null;
      s._elapsedAtPause = null;
      clearAutoAdvanceTimer(s);
      cleanupPrefetch(s);
      if (s._audioFilePath) {
        unlink(s._audioFilePath, (err) => { if (err && err.code !== 'ENOENT') console.warn('[player] 임시 파일 삭제 실패:', s._audioFilePath); });
        s._audioFilePath = null;
      }
      stateBus.emit('stateChanged', s._guildId);
      console.log(`[player] [${guildId}] 정지 완료`);
      return;
    }

    if (s._skipAutoAdvance) {
      s._skipAutoAdvance = false;
      if (!s._suppressStateChange) {
        s.playStartTs = null;
        s.pausedDuration = 0;
        s._pauseStartTs = null;
        s._elapsedAtPause = null;
      }
      clearAutoAdvanceTimer(s);
      if (!s._suppressStateChange) stateBus.emit('stateChanged', s._guildId);
      return;
    }

    s.currentItem = null;
    s.playStartTs = null;
    s.pausedDuration = 0;
    s._pauseStartTs = null;
    s._elapsedAtPause = null;
    clearAutoAdvanceTimer(s);
    if (!s._prefetchedPath && s._audioFilePath) {
      unlink(s._audioFilePath, (err) => { if (err && err.code !== 'ENOENT') console.warn('[player] 임시 파일 삭제 실패:', s._audioFilePath); });
      s._audioFilePath = null;
    }
    stateBus.emit('stateChanged', s._guildId);

    setImmediate(async () => {
      const s2 = getState(guildId);
      s2._stopRequested = false;
      if (s2.queue.length === 0) {
        console.log(`[player] [${guildId}] 대기열 소진 — 재생 종료`);
        if (s2._audioFilePath) { unlink(s2._audioFilePath, (err) => { if (err && err.code !== 'ENOENT') console.warn('[player] 임시 파일 삭제 실패:', s2._audioFilePath); }); s2._audioFilePath = null; }
        cleanupPrefetch(s2);
        return;
      }
      if (s2.player.state.status !== AudioPlayerStatus.Idle) return;
      const nextItem = s2.queue.shift();
      s2._queueVersion = (s2._queueVersion ?? 0) + 1;
      console.log(`[player] [${guildId}] 다음 곡 자동 재생 (대기열 잔여: ${s2.queue.length}곡): "${nextItem.title}"`);
      try {
        await playItem(s2, nextItem);
      } catch (err) {
        console.error(`[player] [${guildId}] 자동 재생 오류:`, err);
        s2.currentItem = null;
        s2.playStartTs = null;
        stateBus.emit('stateChanged', s2._guildId);
      }
    });
  });

  state.player.on('stateChange', (oldState, newState) => {
    const s = getState(guildId);
    if (s._suppressStateChange) {
      stateBus.emit('presenceUpdate');
      return;
    }
    if (oldState.status === AudioPlayerStatus.Playing &&
        newState.status === AudioPlayerStatus.Paused) {
      s._pauseStartTs    = Date.now();
      s._elapsedAtPause  = s.playStartTs != null
        ? s._pauseStartTs - s.playStartTs - (s.pausedDuration ?? 0)
        : 0;
    } else if (oldState.status === AudioPlayerStatus.Paused &&
               newState.status === AudioPlayerStatus.Playing) {
      if (s._pauseStartTs != null) {
        s.pausedDuration   = (s.pausedDuration ?? 0) + (Date.now() - s._pauseStartTs);
        s._pauseStartTs    = null;
        s._elapsedAtPause  = null;
      }
    }
    stateBus.emit('stateChanged', guildId);
  });

  state.player.on('error', err => {
    console.error(`[player] [${guildId}] AudioPlayer 오류:`, err);
  });

  console.log(`[player] [${guildId}] 플레이어 초기화 완료`);
}

module.exports = { playItem, initPlayer, prefetchNext, cleanupPrefetch, clearAutoAdvanceTimer, scheduleAutoAdvance };
