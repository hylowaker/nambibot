const { MessageFlags, EmbedBuilder } = require('discord.js');
const { AudioPlayerStatus } = require('@discordjs/voice');
const { getState } = require('../../state');
const { initPlayer } = require('../../player');
const stateBus = require('../../web/stateBus');

async function execute(interaction) {
  initPlayer(interaction.guild.id);
  const state = getState(interaction.guild.id);

  if (!state.currentItem) {
    return interaction.reply({
      content: '❌ 재생 중인 항목이 없습니다.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (state.player.state.status !== AudioPlayerStatus.Paused) {
    return interaction.reply({
      content: '❌ 현재 일시정지 상태가 아닙니다.',
      flags: MessageFlags.Ephemeral,
    });
  }

  state.player.unpause();
  stateBus.emit('stateChanged', interaction.guild.id);
  stateBus.emit('notice', interaction.guild.id, `🎧 ${interaction.user.username} · 재개`);

  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x30D158)
      .setDescription(`▶️ **${state.currentItem.title}** 재생을 재개합니다.`)],
  });
}

module.exports = { execute };
