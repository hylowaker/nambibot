const { joinVoiceChannel, entersState, VoiceConnectionStatus } = require('@discordjs/voice');
const { ChannelType } = require('discord.js');
const { getState } = require('./state');
const { initPlayer } = require('./player');

async function joinToChannel(guild, member, channelName) {
  let channel;

  if (channelName) {
    channel = guild.channels.cache.find(
      c => c.type === ChannelType.GuildVoice && c.name === channelName
    );
    if (!channel) {
      throw new Error(`음성 채널 "${channelName}"을(를) 찾을 수 없습니다.`);
    }
  } else if (member.voice?.channel) {
    channel = member.voice.channel;
  } else {
    channel = guild.channels.cache
      .filter(c => c.type === ChannelType.GuildVoice)
      .sort((a, b) => a.position - b.position)
      .first();
    if (!channel) {
      throw new Error('서버에 음성 채널이 없습니다.');
    }
  }

  console.log(`[voice] [${guild.name}] 채널 "${channel.name}" 연결 시도... (멤버 수: ${channel.members.size}명)`);

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
  });

  const state = getState(guild.id);
  state.connection = connection;
  initPlayer(guild.id);

  if (!state._disconnectHandlerRegistered) {
    state._disconnectHandlerRegistered = true;
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      console.warn(`[voice] [${guild.name}] 연결 끊김 — 재연결 시도 중...`);
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
        console.log(`[voice] [${guild.name}] 재연결 성공`);
        const stateBus = require('./web/stateBus');
        stateBus.emit('stateChanged', state._guildId);
      } catch {
        console.warn(`[voice] [${guild.name}] 재연결 실패 — 음성 연결 해제 (재생 유지)`);
        connection.destroy();
        state.connection = null;
        state.connectedChannelName = null;
        state._disconnectHandlerRegistered = false;
        const stateBus = require('./web/stateBus');
        stateBus.emit('stateChanged', state._guildId);
      }
    });
  }

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
  } catch {
    console.error(`[voice] [${guild.name}] 채널 "${channel.name}" Ready 상태 진입 실패 (10초 초과)`);
    connection.destroy();
    state.connection = null;
    state.connectedChannelName = null;
    throw new Error('음성 채널 연결에 실패했습니다.');
  }

  state.connectedChannelName = channel.name;
  console.log(`[voice] [${guild.name}] 채널 "${channel.name}" 연결 완료`);

  if (state.currentItem && state.player) {
    connection.subscribe(state.player);
  }

  return channel;
}

module.exports = { joinToChannel };
