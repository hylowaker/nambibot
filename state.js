const { createAudioPlayer, AudioPlayerStatus, NoSubscriberBehavior } = require('@discordjs/voice');
const stateBus = require('./web/stateBus');

const states = new Map();

function getState(guildId) {
  if (!states.has(guildId)) {
    const newState = {
      player: createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play, maxMissedFrames: 300 } }),
      queue: [],
      connection: null,
      connectedChannelName: null,
      currentItem: null,
      playStartTs: null,
      pausedDuration: 0,
      _pauseStartTs: null,
      _elapsedAtPause: null,
      history: [],
      _stopRequested: false,
      _playerInitialized: false,
      _disconnectHandlerRegistered: false,
      textChannel: null,
      _guildId: guildId,
      _audioFilePath: null,
      _prefetchedPath: null,
      _prefetchedUrl: null,
      _prefetching: false,
      _autoAdvanceTimer: null,
      _queueVersion: 0,
      _pendingSeekSec: null,
      downloadProgress: null,
    };
    states.set(guildId, newState);
  }
  return states.get(guildId);
}

function disconnectVoice(state) {
  if (state.connection) {
    state.connection.destroy();
    state.connection = null;
  }
  state.connectedChannelName = null;
  state._disconnectHandlerRegistered = false;
  state.textChannel = null;
  stateBus.emit('stateChanged', state._guildId);
}

function clearState(state) {
  if (state.player.state.status !== AudioPlayerStatus.Idle || state.currentItem) {
    state._stopRequested = true;
    state.player.stop();
    state.currentItem = null;
  }
  if (state._prefetchedPath) {
    const { unlink } = require('fs');
    unlink(state._prefetchedPath, () => {});
    state._prefetchedPath = null;
  }
  state._prefetchedUrl = null;
  state._prefetching = false;
  disconnectVoice(state);
}

function getAllStates() {
  return states.values();
}

module.exports = { getState, clearState, disconnectVoice, getAllStates };
