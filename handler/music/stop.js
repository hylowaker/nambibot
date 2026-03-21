const { MessageFlags, EmbedBuilder } = require('discord.js');
const { AudioPlayerStatus } = require('@discordjs/voice');
const { getState } = require('../../state');
/** @typedef {import('discord.js').ChatInputCommandInteraction} ChatInputCommandInteraction */

/**
 * @param {ChatInputCommandInteraction} interaction
 */
async function execute(interaction) {
  const state = getState(interaction.guild.id);

  if (!state.connection) {
    return interaction.reply({
      content: '❌ 봇이 음성 채널에 참가 중이지 않습니다.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (state.player.state.status === AudioPlayerStatus.Idle) {
    return interaction.reply({
      content: '❌ 현재 재생 중인 음악이 없습니다.',
      flags: MessageFlags.Ephemeral,
    });
  }

  state._stopRequested = true;
  state.player.stop();
  state.currentItem = null;

  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0xFF375F)
      .setDescription('⏹️ 재생을 중단했습니다.')],
  });
}

module.exports = { execute };
