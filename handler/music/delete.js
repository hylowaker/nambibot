const { MessageFlags, EmbedBuilder } = require('discord.js');
const { getState } = require('../../state');
const { initPlayer } = require('../../player');
const stateBus = require('../../web/stateBus');

async function execute(interaction) {
  initPlayer(interaction.guild.id);
  const state = getState(interaction.guild.id);

  if (state.queue.length === 0) {
    return interaction.reply({
      content: '❌ 대기열이 비어있습니다.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const indexOpt = interaction.options.getInteger('index');
  let targetIndex;

  if (indexOpt === null) {
    targetIndex = state.queue.length - 1;
  } else {
    targetIndex = indexOpt - 1;
    if (targetIndex < 0 || targetIndex >= state.queue.length) {
      return interaction.reply({
        content: `❌ INDEX가 범위를 벗어났습니다. (1~${state.queue.length})`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  const [removed] = state.queue.splice(targetIndex, 1);
  stateBus.emit('stateChanged', interaction.guild.id);
  stateBus.emit('notice', interaction.guild.id, `🎧 ${interaction.user.username} · 대기열 삭제: "${removed.title}"`);
  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0xFF375F)
      .setDescription(`🗑️ **${removed.title}** 을(를) 대기열에서 삭제했습니다.`)],
  });
}

module.exports = { execute };
