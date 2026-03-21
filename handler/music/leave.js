const { MessageFlags, EmbedBuilder } = require('discord.js');
const { getState, clearState } = require('../../state');
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

  const current = state.currentItem;
  clearState(state);
  if (current) state.queue.unshift(current);

  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0xFF375F)
      .setDescription('👋 음성 채널에서 퇴장했습니다.')],
  });
}

module.exports = { execute };
