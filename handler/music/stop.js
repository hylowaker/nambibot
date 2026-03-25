const { MessageFlags, EmbedBuilder } = require('discord.js');
const { AudioPlayerStatus } = require('@discordjs/voice');
const { getState } = require('../../state');
const { initPlayer } = require('../../player');
const stateBus = require('../../web/stateBus');

async function execute(interaction) {
  initPlayer(interaction.guild.id);
  const state = getState(interaction.guild.id);

  if (state.player.state.status === AudioPlayerStatus.Idle) {
    return interaction.reply({
      content: '❌ 현재 재생 중인 음악이 없습니다.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const title = state.currentItem?.title ?? '알 수 없음';
  state._stopRequested = true;
  state.player.stop();
  state.currentItem = null;
  stateBus.emit('notice', interaction.guild.id, `🎧 ${interaction.user.username} · 삭제: "${title}"`);

  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0xFF375F)
      .setDescription(`🗑️ **${title}** 을(를) 삭제했습니다.`)],
  });
}

module.exports = { execute };
