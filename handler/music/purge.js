const { MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getState } = require('../../state');
const { initPlayer } = require('../../player');

async function execute(interaction) {
  initPlayer(interaction.guild.id);
  const state = getState(interaction.guild.id);

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
