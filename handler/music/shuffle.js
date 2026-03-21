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

  if (state.queue.length === 0) {
    return interaction.reply({
      content: '❌ 대기열이 비어있습니다.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const len = state.queue.length;
  for (let i = len - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [state.queue[i], state.queue[j]] = [state.queue[j], state.queue[i]];
  }
  stateBus.emit('stateChanged', interaction.guild.id);

  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x6080FF)
      .setDescription(`🔀 대기열 **${len}개** 항목을 무작위로 섞었습니다.`)],
  });
}

module.exports = { execute };
