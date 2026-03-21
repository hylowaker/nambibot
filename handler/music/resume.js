const { MessageFlags, EmbedBuilder } = require('discord.js');
const { AudioPlayerStatus } = require('@discordjs/voice');
const { getState } = require('../../state');
const stateBus = require('../../web/stateBus');
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

  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x30D158)
      .setDescription(`▶️ **${state.currentItem.title}** 재생을 재개합니다.`)],
  });
}

module.exports = { execute };
