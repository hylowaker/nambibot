const { AudioPlayerStatus } = require('@discordjs/voice');
const { getState } = require('../../state');
const { playItem } = require('../../player');
/** @typedef {import('discord.js').ChatInputCommandInteraction} ChatInputCommandInteraction */

/**
 * @param {ChatInputCommandInteraction} interaction
 */
async function execute(interaction) {
  const state = getState(interaction.guild.id);

  if (!state.connection) {
    return interaction.reply({ content: '봇이 음성 채널에 참가 중이지 않습니다.', ephemeral: true });
  }

  if (state.queue.length === 0) {
    return interaction.reply({ content: '큐가 비어있습니다.', ephemeral: true });
  }

  if (!state.playStartTs) {
    return interaction.reply({ content: '현재 곡을 불러오는 중입니다. 로딩이 끝난 후 다시 시도해주세요.', ephemeral: true });
  }

  const item = state.queue.shift();

  // Stop current playback without triggering auto-play
  if (state.player.state.status !== AudioPlayerStatus.Idle) {
    state._skipAutoAdvance = true;
    state.player.stop();
  }

  await interaction.reply(`현재 재생 중인 음악을 건너뜁니다.`);
  try {
    await playItem(state, item);
  } catch (err) {
    await interaction.followUp(`${item.title} 재생 오류: ${err.message}`);
  }
}

module.exports = { execute };
