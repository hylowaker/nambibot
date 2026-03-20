const { createAudioPlayer, AudioPlayerStatus, NoSubscriberBehavior } = require('@discordjs/voice');
const stateBus = require('./web/stateBus');
/** @typedef {import('./types').TrackItem} TrackItem */
/** @typedef {import('./types').PlayerState} PlayerState */

/** @type {Map<string, PlayerState>} */
const states = new Map();

/**
 *
 * @param {string} guildId
 */
function getState(guildId) {
  if (!states.has(guildId)) {
    /** @type {PlayerState} */
    const newState = {
      player: createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play, maxMissedFrames: 300 } }),
      queue: [],
      connection: null,     // VoiceConnection
      connectedChannelName: null,
      currentItem: null,
      playStartTs: null,
      history: [],
      _stopRequested: false,
      _playerInitialized: false,
      _disconnectHandlerRegistered: false,
      textChannel: null,        // TextChannel for sending messages
      _guildId: guildId,
    };
    states.set(guildId, newState);
  }
  return states.get(guildId);
}

/**
 * Stop playback and destroy the voice connection for the given state.
 * @param {PlayerState} state
 */
function clearState(state) {
  // 재생 중이거나 로딩 중(다운로드 중, player=Idle이지만 currentItem 존재)일 때 모두 취소
  if (state.player.state.status !== AudioPlayerStatus.Idle || state.currentItem) {
    state._stopRequested = true;
    state.player.stop();
    state.currentItem = null;
  }
  if (state.connection) {
    state.connection.destroy();
    state.connection = null;
  }
  state.connectedChannelName = null;
  state._disconnectHandlerRegistered = false;
  state.textChannel = null;
  // TODO: 큐 초기화 여부 고민 필요 (현재는 유지)
  stateBus.emit('stateChanged', state._guildId);
}

/**
 * @returns {IterableIterator<PlayerState>}
 */
function getAllStates() {
  return states.values();
}

module.exports = { getState, clearState, getAllStates };
