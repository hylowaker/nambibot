const { MessageFlags, EmbedBuilder } = require('discord.js');
const { AudioPlayerStatus } = require('@discordjs/voice');
const { getState } = require('../../state');
const { buildControlRow } = require('./_controls');
const { fmtTime } = require('./_show');

async function execute(interaction) {
  const state = getState(interaction.guild.id);

  if (!state.currentItem) {
    return interaction.reply({
      content: '❌ 현재 재생 중인 항목이 없습니다.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const isPaused = state.player?.state?.status === AudioPlayerStatus.Paused;
  const icon = isPaused ? '⏸️ 일시정지 중' : '▶️ 지금 재생 중';

  let desc = state.currentItem.title;
  if (state.playStartTs) {
    const elapsed = Math.floor((Date.now() - state.playStartTs) / 1000);
    desc += state.currentItem.duration
      ? `\n\`${fmtTime(elapsed)} / ${fmtTime(state.currentItem.duration)}\``
      : `\n\`${fmtTime(elapsed)} 경과\``;
  }
  if (state.queue.length > 0) {
    desc += `\n-# 대기 중 ${state.queue.length}곡`;
  }

  const embed = new EmbedBuilder()
    .setColor(isPaused ? 0xFEE75C : 0x57F287)
    .setTitle(icon)
    .setDescription(desc);

  await interaction.reply({
    embeds: [embed],
    components: [buildControlRow(state)],
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = { execute };
