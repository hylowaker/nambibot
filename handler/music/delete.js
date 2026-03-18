const { MessageFlags } = require('discord.js');
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

  if (state.queue.length === 0) {
    return interaction.reply({ content: '대기열이 비어있습니다.', ephemeral: true });
  }

  const indexOpt = interaction.options.getInteger('index');
  let targetIndex;

  if (indexOpt === null) {
    targetIndex = state.queue.length - 1;
  } else {
    targetIndex = indexOpt - 1;
    if (targetIndex < 0 || targetIndex >= state.queue.length) {
      return interaction.reply({
        content: `INDEX가 범위를 벗어났습니다. (1~${state.queue.length})`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  const [removed] = state.queue.splice(targetIndex, 1);
  await interaction.reply(`큐에서 **${removed.title}** 을(를) 삭제했습니다.`);
}

module.exports = { execute };
