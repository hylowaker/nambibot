const { MessageFlags, EmbedBuilder } = require('discord.js');
const { getState } = require('../../state');
const { joinToChannel } = require('../../voice');
/** @typedef {import('discord.js').ChatInputCommandInteraction} ChatInputCommandInteraction */

/**
 * @param {ChatInputCommandInteraction} interaction
 */
async function execute(interaction) {
  const state = getState(interaction.guild.id);
  const channelName = interaction.options.getString('channel');

  let channel;
  try {
    channel = await joinToChannel(interaction.guild, interaction.member, channelName);
  } catch (err) {
    return interaction.reply({
      content: `❌ ${err.message}`,
      flags: MessageFlags.Ephemeral,
    });
  }

  state.textChannel = interaction.channel;  // TODO 채널 선택 로직 개선
  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x30D158)
      .setDescription(`🎤 **${channel.name}** 채널에 참가했습니다.`)],
  });
}

module.exports = { execute };
