const { MessageFlags, EmbedBuilder } = require('discord.js');
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
    return interaction.reply({
      content: '❌ 봇이 음성 채널에 참가 중이지 않습니다.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (state.queue.length === 0) {
    return interaction.reply({
      content: '❌ 대기열이 비어있습니다.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (!state.playStartTs) {
    return interaction.reply({
      content: '⏳ 현재 곡을 불러오는 중입니다. 로딩이 끝난 후 다시 시도해주세요.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const current = state.currentItem;  // 건너뛸 곡
  const item    = state.queue.shift(); // 다음 곡
  if (current) state.queue.push(current); // 건너뛴 곡은 대기열 맨 뒤로

  // Stop current playback without triggering auto-play
  if (state.player.state.status !== AudioPlayerStatus.Idle) {
    state._skipAutoAdvance = true;
    state.player.stop();
  }

  const embed = new EmbedBuilder()
    .setColor(0x6080FF)
    .setDescription(`⏭️ **${item.title}** 재생 중...`);
  if (current) embed.setFooter({ text: `건너뜀: ${current.title} → 대기열 맨 뒤로` });

  await interaction.reply({ embeds: [embed] });
  try {
    await playItem(state, item);
  } catch (err) {
    await interaction.followUp(`❌ ${item.title} 재생 오류: ${err.message}`);
  }
}

module.exports = { execute };
