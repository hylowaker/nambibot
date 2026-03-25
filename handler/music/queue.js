const { EmbedBuilder, MessageFlags } = require('discord.js');
const { getState } = require('../../state');
const { joinToChannel } = require('../../voice');
const { playItem, initPlayer } = require('../../player');
const ytdlp = require('../../ytdlp');
const stateBus = require('../../web/stateBus');

async function execute(interaction) {
  const url = interaction.options.getString('url');

  await interaction.deferReply();

  const state = getState(interaction.guild.id);

  initPlayer(interaction.guild.id);

  if (!state.connection) {
    try {
      await joinToChannel(interaction.guild, interaction.member);
      state.textChannel = interaction.channel;
    } catch {}
  }

  let items;
  try {
    items = await ytdlp.getInfo(url);
  } catch (err) {
    return interaction.editReply(`❌ 올바른 URL이 아닙니다: ${err.message}`);
  }

  const shouldPlayNow = state.queue.length === 0 && !state.currentItem;
  state.queue.push(...items);

  const embed = new EmbedBuilder().setColor(0x5865F2);

  if (items.length === 1) {
    embed.setDescription(`🎵 **${items[0].title}**\n대기열에 추가했습니다. (현재 ${state.queue.length}개)`);
  } else {
    embed.setDescription(`🎵 **${items.length}개** 항목을 대기열에 추가했습니다. (현재 ${state.queue.length}개)`);
  }

  await interaction.editReply({ embeds: [embed] });
  stateBus.emit('notice', interaction.guild.id, `🎧 ${interaction.user.username} · 대기열에 ${items.length}곡 추가`);

  if (shouldPlayNow) {
    const item = state.queue.shift();
    const pollInterval = setInterval(async () => {
      const pct = state.downloadProgress;
      if (pct != null && state.playStartTs == null) {
        try {
          await interaction.editReply({
            embeds: [new EmbedBuilder()
              .setColor(0x6080FF)
              .setDescription(`⏳ **${item.title}**\n다운로드 중... ${pct}%`)],
          });
        } catch {}
      }
    }, 1500);
    try {
      await playItem(state, item);
    } catch (err) {
      clearInterval(pollInterval);
      await interaction.followUp(`❌ ${item.title} 재생 오류: ${err.message}`);
      return;
    }
    clearInterval(pollInterval);
  }
}

module.exports = { execute };
