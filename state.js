const { createAudioPlayer, AudioPlayerStatus } = require('@discordjs/voice');
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
      player: createAudioPlayer(),
      queue: [],
      connection: null,     // VoiceConnection
      currentItem: null,
      _stopRequested: false,
      _playerInitialized: false,
      textChannel: null,        // TextChannel for sending messages
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
  if (state.player.state.status !== AudioPlayerStatus.Idle) {
    state._stopRequested = true;
    state.player.stop();
    state.currentItem = null;
  }
  if (state.connection) {
    state.connection.destroy();
    state.connection = null;
  }
  state.textChannel = null;
  // TODO: 큐 초기화 여부 고민 필요 (현재는 유지)
}

/**
 * @returns {IterableIterator<PlayerState>}
 */
function getAllStates() {
  return states.values();
}

module.exports = { getState, clearState, getAllStates };
