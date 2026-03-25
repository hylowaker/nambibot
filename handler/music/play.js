const { MessageFlags, EmbedBuilder } = require('discord.js');
const { AudioPlayerStatus } = require('@discordjs/voice');
const { getState } = require('../../state');
const { playItem, initPlayer } = require('../../player');
const stateBus = require('../../web/stateBus');

async function execute(interaction) {
  const state = getState(interaction.guild.id);
  initPlayer(interaction.guild.id);

  if (state.queue.length === 0) {
    return interaction.reply({
      content: '❌ 대기열이 비어있습니다.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (state.currentItem && !state.playStartTs) {
    return interaction.reply({
      content: '⏳ 현재 곡을 불러오는 중입니다. 로딩이 끝난 후 다시 시도해주세요.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const indexOpt = interaction.options.getInteger('index');
  let targetIndex;

  if (indexOpt === null) {
    targetIndex = 0;
  } else {
    targetIndex = indexOpt - 1;
    if (targetIndex < 0 || targetIndex >= state.queue.length) {
      return interaction.reply({
        content: `❌ INDEX가 범위를 벗어났습니다. (1~${state.queue.length})`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  const [item] = state.queue.splice(targetIndex, 1);

  if (state.player.state.status !== AudioPlayerStatus.Idle) {
    state._skipAutoAdvance = true;
    state.player.stop();
  }

  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x30D158)
      .setDescription(`▶️ **${item.title}** 재생을 시작합니다.`)],
  });
  stateBus.emit('notice', interaction.guild.id, `🎧 ${interaction.user.username} · 재생: "${item.title}"`);
  try {
    await playItem(state, item);
  } catch (err) {
    await interaction.followUp(`❌ ${item.title} 재생 오류: ${err.message}`);
  }
}

module.exports = { execute };
