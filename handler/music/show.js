const { getState } = require('../../state');
/** @typedef {import('discord.js').ChatInputCommandInteraction} ChatInputCommandInteraction */

/**
 * @param {ChatInputCommandInteraction} interaction
 */
async function execute(interaction) {

  const state = getState(interaction.guild.id);
  if (!state.currentItem && state.queue.length === 0) {
    return interaction.reply('대기열이 비어있습니다.');
  }
  const lines = [];
  if (state.currentItem) {
    lines.push(`▶ **[재생 중]** ${state.currentItem.title}`);
  }
  lines.push(`\n===== 현재 대기열: ${state.queue.length}개 =====`);
  state.queue.slice(0, 10).forEach((item, i) => lines.push(`${i + 1}. ${item.title}`));
  if (state.queue.length > 10) {
    lines.push(`_... 외 ${state.queue.length - 10}개_`);
  }
  return interaction.reply(lines.join('\n'));
}

module.exports = { execute };
