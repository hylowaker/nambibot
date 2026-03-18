const { joinVoiceChannel, entersState, VoiceConnectionStatus } = require('@discordjs/voice');
const { ChannelType } = require('discord.js');
const { getState } = require('./state');
const { initPlayer } = require('./player');

/**
 * 봇을 음성 채널에 연결합니다.
 *
 * 채널 선택 우선순위:
 * 1. `channelName`이 주어진 경우 해당 이름의 채널
 * 2. `member`가 이미 입장해 있는 채널
 * 3. 서버 음성 채널 목록에서 첫번째 채널
 *
 * @param {import('discord.js').Guild} guild - 대상 서버
 * @param {import('discord.js').GuildMember} member - 명령을 실행한 멤버
 * @param {string} [channelName] - 입장할 음성 채널 이름 (생략 시 자동 선택)
 * @returns {Promise<import('discord.js').VoiceChannel>} 연결된 음성 채널
 * @throws {Error} 지정한 이름의 채널을 찾을 수 없을 때
 * @throws {Error} 서버에 음성 채널이 하나도 없을 때
 * @throws {Error} 음성 채널 연결이 10초 내에 Ready 상태가 되지 않을 때
 */
async function joinToChannel(guild, member, channelName) {
  let channel;

  // Select voice channel to join
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

  // Join the channel
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
  });

  // Save connection in state
  const state = getState(guild.id);
  state.connection = connection;
  initPlayer(guild.id);

  // Handle unexpected disconnection
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      connection.destroy();
      state.connection = null;
      state.currentItem = null;
    }
  });

  // Wait until ready
  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
  } catch {
    connection.destroy();
    state.connection = null;
    throw new Error('음성 채널 연결에 실패했습니다.');
  }

  return channel;
}

module.exports = { joinToChannel };
