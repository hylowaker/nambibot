const { createAudioResource, StreamType, AudioPlayerStatus } = require('@discordjs/voice');
const { EmbedBuilder } = require('discord.js');
const { createReadStream, unlink, statSync } = require('fs');
const { getState } = require('./state');
const ytdlp = require('./ytdlp');
const stateBus = require('./web/stateBus');
/** @typedef {import('./types').PlayerState} PlayerState */
/** @typedef {import('./types').TrackItem} TrackItem */

/**
 *
 * @param {PlayerState} state
 * @param {TrackItem} item
 */
async function playItem(state, item) {
  const guildId = state._guildId;

  // Show loading state in UI while downloading
  state.currentItem = item;
  state.playStartTs = null;

  // 히스토리는 재생 의도가 생긴 시점에 즉시 기록 (로딩 중 삭제해도 기록 유지)
  state.history.unshift({ ...item, playedAt: Date.now() });
  if (state.history.length > 20) state.history.pop();

  stateBus.emit('stateChanged', guildId);

  console.log(`[player] [${guildId}] 다운로드 시작: "${item.title}"`);
  const downloadStart = Date.now();
  let tmpPath;
  let lastEmittedPct = -1;
  try {
    tmpPath = await ytdlp.createAudioFile(item.url, (pct) => {
      if (pct - lastEmittedPct >= 5 || pct === 100) {
        lastEmittedPct = pct;
        state.downloadProgress = pct;
        stateBus.emit('stateChanged', guildId);
      }
    });
  } catch (err) {
    console.error(`[player] [${guildId}] 다운로드 실패 — 건너뜀: "${item.title}"  오류: ${err.message}`);
    state.currentItem = null;
    state.playStartTs = null;
    state.downloadProgress = null;
    stateBus.emit('stateChanged', guildId);
    const next = state.queue.shift();
    if (next) {
      console.log(`[player] [${guildId}] 다음 곡으로 이동: "${next.title}"`);
      await playItem(state, next);
    } else {
      console.log(`[player] [${guildId}] 대기열 소진 — 재생 종료`);
    }
    return;
  }
  state.downloadProgress = null;
  const elapsed = ((Date.now() - downloadStart) / 1000).toFixed(1);

  let fileSize = '?';
  try { fileSize = `${(statSync(tmpPath).size / 1024).toFixed(0)} KB`; } catch {}
  console.log(`[player] [${guildId}] 다운로드 완료: ${fileSize}  소요: ${elapsed}s  파일: ${tmpPath}`);

  // Check if stop was requested while downloading
  if (state._stopRequested) {
    console.log(`[player] [${guildId}] 정지 요청됨 — 재생 취소`);
    state._stopRequested = false; // 다음 재생을 위해 플래그 해제 (Idle 이벤트가 없으면 영구 잔류)
    unlink(tmpPath, () => {});
    state.currentItem = null;
    stateBus.emit('stateChanged', guildId);
    return;
  }

  const stream = createReadStream(tmpPath);
  stream.on('close', () => unlink(tmpPath, () => {}));

  const resource = createAudioResource(stream, { inputType: StreamType.OggOpus });
  state.playStartTs = Date.now();

  if (state.connection) {
    state.connection.subscribe(state.player);
  }
  state._stopRequested = false; // 재생 직전 해제 — Idle 핸들러 이후 시점이라 자동 재생 경쟁 없음
  state.currentItem = item;     // Idle 핸들러가 다운로드 중 currentItem을 null로 지웠을 수 있으므로 재설정
  state.player.play(resource);
  stateBus.emit('stateChanged', guildId);

  const durStr = item.duration ? ` (${Math.floor(item.duration / 60)}:${String(item.duration % 60).padStart(2, '0')})` : '';
  console.log(`[player] [${guildId}] 재생 시작: "${item.title}"${durStr}`);

  if (state.textChannel) {
    await state.textChannel.send({
      embeds: [new EmbedBuilder()
        .setColor(0x30D158)
        .setDescription(`▶️ 지금 재생 중: **${state.currentItem.title}**`)],
    });
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
      // 실제 정지 (stop/deleteCurrent) — 호출부에서 currentItem을 이미 null로 처리
      s._stopRequested = false;
      s.playStartTs = null;
      stateBus.emit('stateChanged', s._guildId);
      console.log(`[player] [${guildId}] 정지 완료`);
      return;
    }

    if (s._skipAutoAdvance) {
      // 대기열 재생/skip — playItem이 직접 재생을 이어받음, 자동 재생 건너뜀
      s._skipAutoAdvance = false;
      s.playStartTs = null;
      stateBus.emit('stateChanged', s._guildId);
      return;
    }

    // 자연 종료 (곡 끝)
    s.currentItem = null;
    s.playStartTs = null;
    stateBus.emit('stateChanged', s._guildId);

    setImmediate(async () => {
      const s2 = getState(guildId);
      if (s2._stopRequested || s2.queue.length === 0) {
        if (s2.queue.length === 0) console.log(`[player] [${guildId}] 대기열 소진 — 재생 종료`);
        return;
      }
      if (s2.player.state.status !== AudioPlayerStatus.Idle) return;
      const nextItem = s2.queue.shift();
      console.log(`[player] [${guildId}] 다음 곡 자동 재생 (대기열 잔여: ${s2.queue.length}곡): "${nextItem.title}"`);
      try {
        await playItem(s2, nextItem);
      } catch (err) {
        console.error(`[player] [${guildId}] 자동 재생 오류:`, err);
        stateBus.emit('stateChanged', s2._guildId);
      }
    });
  });

  state.player.on('error', err => {
    console.error(`[player] [${guildId}] AudioPlayer 오류:`, err);
  });

  console.log(`[player] [${guildId}] 플레이어 초기화 완료`);
}

module.exports = { playItem, initPlayer };
