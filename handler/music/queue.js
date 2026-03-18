const { getState } = require('../../state');
const { joinToChannel } = require('../../voice');
const { playItem } = require('../../player');
const ytdlp = require('../../ytdlp');
/** @typedef {import('discord.js').ChatInputCommandInteraction} ChatInputCommandInteraction */

/**
 * @param {ChatInputCommandInteraction} interaction
 */
async function execute(interaction) {
  const url = interaction.options.getString('url');

  await interaction.deferReply();

  const state = getState(interaction.guild.id);

  // Auto-join if not in a channel
  if (!state.connection) {
    try {
      await joinToChannel(interaction.guild, interaction.member);
      state.textChannel = interaction.channel;  // TODO 채널 선택 로직 개선
    } catch (err) {
      return interaction.editReply(err.message);
    }
  }

  // Fetch metadata from yt-dlp
  let items;
  try {
    items = await ytdlp.getInfo(url);
  } catch (err) {
    return interaction.editReply(`올바른 URL이 아닙니다: ${err.message}`);
  }

  const shouldPlayNow = state.queue.length === 0 && !state.currentItem;
  state.queue.push(...items);

  if (items.length === 1) {
    await interaction.editReply(`**${items[0].title}** 을(를) 대기열에 추가했습니다. (현재 대기열 ${state.queue.length}개)`);
  } else {
    await interaction.editReply(`${items.length}개 항목을 대기열에 추가했습니다.`);
  }

  if (shouldPlayNow) {
    const item = state.queue.shift();
    try {
      await playItem(state, item);
    } catch (err) {
      await interaction.followUp(`${item.title} 재생 오류: ${err.message}`);
    }
  }
}

module.exports = { execute };
