const { MessageFlags, EmbedBuilder } = require('discord.js');
const { AudioPlayerStatus } = require('@discordjs/voice');
const { getState } = require('../../state');
const { playItem, initPlayer } = require('../../player');
const stateBus = require('../../web/stateBus');

async function execute(interaction) {
  initPlayer(interaction.guild.id);
  const state = getState(interaction.guild.id);

  if (state.queue.length === 0) {
    return interaction.reply({
      content: '❌ 대기열이 비어있습니다.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const current = state.currentItem;
  const item    = state.queue.shift();
  if (current) state.queue.push(current);

  state._skipAutoAdvance = true;
  state.player.stop();

  const embed = new EmbedBuilder()
    .setColor(0x6080FF)
    .setDescription(`⏭️ **${item.title}** 재생 중...`);
  if (current) embed.setFooter({ text: `건너뜀: ${current.title} → 대기열 맨 뒤로` });

  await interaction.reply({ embeds: [embed] });
  stateBus.emit('notice', interaction.guild.id, `🎧 ${interaction.user.username} · 스킵: "${current?.title ?? '알 수 없음'}"`);

  try {
    await playItem(state, item);
  } catch (err) {
    await interaction.followUp(`❌ ${item.title} 재생 오류: ${err.message}`);
  }
}

module.exports = { execute };
