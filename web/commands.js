const { AudioPlayerStatus } = require('@discordjs/voice');
const { getState, clearState } = require('../state');
const { joinToChannel } = require('../voice');
const { playItem } = require('../player');
const ytdlp = require('../ytdlp');
const stateBus = require('./stateBus');

async function queue(client, guildId, url, onProgress) {
  const guild = client.guilds.cache.get(guildId);
  const state = getState(guildId);

  onProgress?.({ status: 'fetching', current: 0, total: null });
  const items = await ytdlp.getInfo(url, (current, total) => {
    onProgress?.({ status: 'downloading', current, total });
  });
  onProgress?.({ status: 'done', count: items.length });

  state.queue.push(...items);
  stateBus.emit('stateChanged', guildId);

  if (!state.connection) return;

  const shouldPlayNow = state.queue.length > 0 && !state.currentItem;
  if (shouldPlayNow) {
    const item = state.queue.shift();
    await playItem(state, item);
  }
}

async function play(client, guildId, index) {
  const state = getState(guildId);
  const i = (index ?? 1) - 1;
  if (i < 0 || i >= state.queue.length) throw new Error('유효하지 않은 인덱스입니다.');

  // 다운로드 중(로딩 상태)엔 중복 재생 요청 거부
  if (state.currentItem && !state.playStartTs) {
    throw new Error('현재 곡을 불러오는 중입니다. 로딩이 끝난 후 다시 시도해주세요.');
  }

  const [item] = state.queue.splice(i, 1);

  let notice = null;
  if (state.currentItem) {
    state.queue.splice(i, 0, state.currentItem);
    notice = `"${state.currentItem.title}" 이(가) 대기열 ${i + 1}번으로 이동했습니다.`;
  }

  // _skipAutoAdvance: 자동 재생만 차단, playItem 다운로드는 취소하지 않음
  // (_stopRequested는 playItem 내 다운로드 취소를 유발하므로 사용 불가)
  if (state.player.state.status !== AudioPlayerStatus.Idle) {
    state._skipAutoAdvance = true;
    state.player.stop();
  }
  await playItem(state, item);
  stateBus.emit('stateChanged', guildId);
  return notice;
}

function pause(client, guildId) {
  const state = getState(guildId);
  if (!state.currentItem) throw new Error('재생 중인 항목이 없습니다.');
  state.player.pause();
  stateBus.emit('stateChanged', guildId);
}

function resume(client, guildId) {
  const state = getState(guildId);
  if (!state.currentItem) throw new Error('재생 중인 항목이 없습니다.');
  state.player.unpause();
  stateBus.emit('stateChanged', guildId);
}

function deleteCurrent(client, guildId) {
  const state = getState(guildId);
  if (!state.currentItem) throw new Error('재생 중인 항목이 없습니다.');
  state._stopRequested = true;
  state.currentItem = null;
  state.player.stop();
  stateBus.emit('stateChanged', guildId);
}

async function skip(client, guildId) {
  const state = getState(guildId);
  if (!state.currentItem) throw new Error('재생 중인 항목이 없습니다.');
  if (!state.playStartTs) throw new Error('현재 곡을 불러오는 중입니다. 로딩이 끝난 후 다시 시도해주세요.');

  const skipped = state.currentItem;
  const nextItem = state.queue.shift() ?? null;  // 다음 곡 미리 꺼내기
  state.queue.push(skipped);                     // 현재 곡 맨 뒤로

  state._skipAutoAdvance = true;
  state.player.stop();

  if (nextItem) {
    await playItem(state, nextItem);
  }

  stateBus.emit('stateChanged', guildId);
  return skipped.title;
}

function reorder(client, guildId, fromIndex, toIndex) {
  const state = getState(guildId);
  const len = state.queue.length;
  if (fromIndex < 0 || fromIndex >= len || toIndex < 0 || toIndex >= len) {
    throw new Error('유효하지 않은 인덱스입니다.');
  }
  const [item] = state.queue.splice(fromIndex, 1);
  state.queue.splice(toIndex, 0, item);
  stateBus.emit('stateChanged', guildId);
}

function del(client, guildId, index) {
  const state = getState(guildId);
  const i = (index ?? state.queue.length) - 1;
  if (i < 0 || i >= state.queue.length) throw new Error('유효하지 않은 인덱스입니다.');
  state.queue.splice(i, 1);
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
  stateBus.emit('stateChanged', guildId);
}

function shuffle(client, guildId) {
  const state = getState(guildId);
  for (let i = state.queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [state.queue[i], state.queue[j]] = [state.queue[j], state.queue[i]];
  }
  stateBus.emit('stateChanged', guildId);
}

function purge(client, guildId) {
  const state = getState(guildId);
  state.queue = [];
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
  const current = state.currentItem;
  clearState(state);
  if (current) state.queue.unshift(current);
}

module.exports = { queue, play, pause, resume, deleteCurrent, skip, reorder, del, purge, shuffle, dedupe, join, leave };
