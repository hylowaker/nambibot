const { getState } = require('../../state');
/** @typedef {import('discord.js').ChatInputCommandInteraction} ChatInputCommandInteraction */

/**
 * @param {ChatInputCommandInteraction} interaction
 */
async function execute(interaction) {
  const state = getState(interaction.guild.id);

  if (!state.connection) {
    return interaction.reply({ content: '봇이 음성 채널에 참가 중이지 않습니다.', ephemeral: true });
  }

  const count = state.queue.length;
  state.queue = [];

  await interaction.reply(
    count > 0 ? `대기열에서 ${count}개 항목을 모두 삭제했습니다.` : '대기열이 이미 비어있습니다.'
  );
}

module.exports = { execute };
