const { MessageFlags, EmbedBuilder } = require('discord.js');
const { getState } = require('../../state');
const { initPlayer } = require('../../player');
const stateBus = require('../../web/stateBus');

async function execute(interaction) {
  initPlayer(interaction.guild.id);
  const state = getState(interaction.guild.id);

  const before = state.queue.length;
  const seen = new Set();
  state.queue = state.queue.filter(item => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
  const removed = before - state.queue.length;
  stateBus.emit('stateChanged', interaction.guild.id);
  stateBus.emit('notice', interaction.guild.id, `🎧 ${interaction.user.username} · 중복 제거: ${removed}곡 삭제됨`);
  stateBus.emit('uiAction', interaction.guild.id, 'dedupe');

  if (removed === 0) {
    return interaction.reply({
      content: '✅ 중복 항목이 없습니다.',
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x6080FF)
      .setDescription(`✨ 중복 항목 **${removed}개**를 제거했습니다. (${state.queue.length}개 남음)`)],
  });
}

module.exports = { execute };
