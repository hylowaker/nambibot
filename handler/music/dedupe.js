const { MessageFlags, EmbedBuilder } = require('discord.js');
const { getState } = require('../../state');
const stateBus = require('../../web/stateBus');
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

  const before = state.queue.length;
  const seen = new Set();
  state.queue = state.queue.filter(item => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
  const removed = before - state.queue.length;
  stateBus.emit('stateChanged', interaction.guild.id);

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
