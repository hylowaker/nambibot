const { MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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

  const count = state.queue.length;
  if (count === 0) {
    return interaction.reply({
      content: '❌ 대기열이 이미 비어있습니다.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const gid = state._guildId;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`music:purge_ok:${gid}`)
      .setLabel('🗑️ 삭제')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`music:purge_cancel:${gid}`)
      .setLabel('취소')
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0xFEE75C)
      .setDescription(`⚠️ 대기열 **${count}개** 항목을 모두 삭제합니다. 계속할까요?`)],
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = { execute };
