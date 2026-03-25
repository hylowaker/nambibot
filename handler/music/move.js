const { MessageFlags, EmbedBuilder } = require('discord.js');
const { getState } = require('../../state');
const { initPlayer } = require('../../player');
const stateBus = require('../../web/stateBus');

async function execute(interaction) {
  initPlayer(interaction.guild.id);
  const state = getState(interaction.guild.id);

  const from = interaction.options.getInteger('from');
  const to   = interaction.options.getInteger('to');
  const len  = state.queue.length;

  if (len === 0) {
    return interaction.reply({
      content: '❌ 대기열이 비어있습니다.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (from < 1 || from > len || to < 1 || to > len) {
    return interaction.reply({
      content: `❌ 유효하지 않은 인덱스입니다. (1~${len} 사이의 숫자)`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (from === to) {
    return interaction.reply({
      content: '❌ 이동 전후 위치가 같습니다.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const [item] = state.queue.splice(from - 1, 1);
  state.queue.splice(to - 1, 0, item);
  stateBus.emit('stateChanged', interaction.guild.id);
  stateBus.emit('notice', interaction.guild.id, `🎧 ${interaction.user.username} · 순서 변경: "${item.title}" #${from} → #${to}`);

  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x6080FF)
      .setDescription(`↕️ **${from}번 → ${to}번**: "${item.title}" 이동 완료`)],
  });
}

module.exports = { execute };
