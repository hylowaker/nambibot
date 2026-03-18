const { createAudioResource, StreamType, AudioPlayerStatus } = require('@discordjs/voice');
const { getState } = require('./state');
const ytdlp = require('./ytdlp');
/** @typedef {import('./types').PlayerState} PlayerState */
/** @typedef {import('./types').TrackItem} TrackItem */

/**
 * 
 * @param {PlayerState} state 
 * @param {TrackItem} item 
 */
async function playItem(state, item) {
  const stream = ytdlp.createAudioStream(item.url);
  const resource = createAudioResource(stream, { inputType: StreamType.Arbitrary });
  state.currentItem = item;
  state.player.play(resource);

  if (state.connection) {
    state.connection.subscribe(state.player);
  }

  if (state.textChannel) {
    await state.textChannel.send(`▶ 지금 재생 중: **${state.currentItem.title}**`);
  }
}

function initPlayer(guildId) {
  const state = getState(guildId);
  if (state._playerInitialized) {
    return;
  }
  state._playerInitialized = true;

  state.player.on(AudioPlayerStatus.Idle, async () => {
    const s = getState(guildId);
    s.currentItem = null;

    if (s._stopRequested) {
      s._stopRequested = false;
      return;
    }

    if (s.queue.length > 0) {
      const nextItem = s.queue.shift();
      try {
        await playItem(s, nextItem);
      } catch (err) {
        console.error('[player] 자동 재생 오류:', err);
      }
    }
  });

  state.player.on('error', err => {
    console.error('[player] 오류:', err);
  });
}

module.exports = { playItem, initPlayer };
