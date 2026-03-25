const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { AudioPlayerStatus } = require('@discordjs/voice');

function buildControlRow(state) {
  const isPaused = state.player?.state?.status === AudioPlayerStatus.Paused;
  const isActive = !!state.currentItem;
  const hasNext  = state.queue.length > 0;
  const gid      = state._guildId;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`music:toggle:${gid}`)
      .setLabel(isPaused ? '▶ 재개' : '⏸ 일시정지')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!isActive),
    new ButtonBuilder()
      .setCustomId(`music:skip:${gid}`)
      .setLabel('⏭ 스킵')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!isActive || !hasNext),
    new ButtonBuilder()
      .setCustomId(`music:stop:${gid}`)
      .setLabel('✕ 삭제')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!isActive),
  );
}

module.exports = { buildControlRow };
