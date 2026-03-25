const { MessageFlags, EmbedBuilder } = require('discord.js');
const { getState, disconnectVoice } = require('../../state');
const stateBus = require('../../web/stateBus');

async function execute(interaction) {
  const state = getState(interaction.guild.id);

  if (!state.connection) {
    return interaction.reply({
      content: '❌ 봇이 음성 채널에 참가 중이지 않습니다.',
      flags: MessageFlags.Ephemeral,
    });
  }

  disconnectVoice(state);
  stateBus.emit('notice', interaction.guild.id, `🎧 ${interaction.user.username} · 음성 채널 퇴장`);

  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0xFF375F)
      .setDescription('👋 음성 채널에서 퇴장했습니다.')],
  });
}

module.exports = { execute };
