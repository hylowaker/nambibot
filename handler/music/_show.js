const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { AudioPlayerStatus } = require('@discordjs/voice');
/** @typedef {import('../../types').PlayerState} PlayerState */

const PAGE_SIZE = 10;

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = String(Math.floor(sec % 60)).padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * Builds the queue embed for a given page.
 * @param {PlayerState} state
 * @param {number} [page=0]
 * @returns {{ embed: EmbedBuilder, page: number, totalPages: number }}
 */
function buildShowEmbed(state, page = 0) {
  const isPaused   = state.player?.state?.status === AudioPlayerStatus.Paused;
  const totalPages = state.queue.length > 0 ? Math.ceil(state.queue.length / PAGE_SIZE) : 1;
  page = Math.max(0, Math.min(page, totalPages - 1));

  const color = isPaused ? 0xFEE75C : (state.currentItem ? 0x57F287 : 0x5865F2);
  const embed = new EmbedBuilder().setColor(color).setTitle('📋 현재 대기열');

  if (state.currentItem) {
    const icon = isPaused ? '⏸️ 일시정지 중' : '▶️ 지금 재생 중';
    let desc = state.currentItem.title;
    if (state.playStartTs) {
      const elapsed = Math.floor((Date.now() - state.playStartTs) / 1000);
      desc += state.currentItem.duration
        ? `\n\`${fmtTime(elapsed)} / ${fmtTime(state.currentItem.duration)}\``
        : `\n\`${fmtTime(elapsed)} 경과\``;
    }
    embed.addFields({ name: icon, value: desc });
  }

  if (state.queue.length > 0) {
    const start    = page * PAGE_SIZE;
    const listText = state.queue.slice(start, start + PAGE_SIZE).map((item, i) => {
      const title = item.title.length > 70 ? item.title.slice(0, 70) + '…' : item.title;
      const dur   = item.duration ? ` \`${fmtTime(item.duration)}\`` : '';
      return `\`${start + i + 1}.\` ${title}${dur}`;
    }).join('\n');
    const pageInfo = totalPages > 1 ? ` · ${page + 1}/${totalPages} 페이지` : '';
    embed.addFields({ name: `대기열 (${state.queue.length}개${pageInfo})`, value: listText });
  } else if (state.currentItem) {
    embed.addFields({ name: '대기열', value: '_비어있음_' });
  }

  return { embed, page, totalPages };
}

/**
 * Builds a pagination button row for the queue embed.
 * @param {string} guildId
 * @param {number} page  current page (0-based)
 * @param {number} totalPages
 */
function buildPageRow(guildId, page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`music:show_pg:${guildId}:${page - 1}`)
      .setLabel('◀ 페이지 이전')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`music:show_pg:${guildId}:${page + 1}`)
      .setLabel('페이지 다음 ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1),
  );
}

module.exports = { buildShowEmbed, buildPageRow, PAGE_SIZE, fmtTime };
