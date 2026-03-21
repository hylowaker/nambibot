const { MessageFlags, EmbedBuilder } = require('discord.js');
/** @typedef {import('discord.js').ChatInputCommandInteraction} ChatInputCommandInteraction */

/**
 * @param {ChatInputCommandInteraction} interaction
 */
async function execute(interaction) {
  const devPrefix = (process.env.DEVELOPE_PREFIX === 'ON' || process.env.DEVELOPE_PREFIX === '1') ? 'dev-' : '';
  const cmd = `/${devPrefix}music`;
  const ver = `/${devPrefix}version`;

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🎵 음악봇 명령어')
    .addFields(
      {
        name: '▶ 재생 제어',
        value: [
          `\`${cmd} jump [index]\` — 대기열 항목 즉시 재생`,
          `\`${cmd} stop\` — 재생 중단`,
          `\`${cmd} skip\` — 다음 항목으로 건너뜀`,
          `\`${cmd} pause\` — 일시정지`,
          `\`${cmd} resume\` — 재생 재개`,
        ].join('\n'),
      },
      {
        name: '📋 대기열 관리',
        value: [
          `\`${cmd} queue [url]\` — 대기열에 추가`,
          `\`${cmd} show\` — 대기열 보기`,
          `\`${cmd} np\` — 현재 재생 중인 항목 확인`,
          `\`${cmd} delete [index]\` — 항목 삭제`,
          `\`${cmd} purge\` — 대기열 초기화`,
          `\`${cmd} shuffle\` — 순서 섞기`,
          `\`${cmd} dedupe\` — 중복 제거`,
          `\`${cmd} move [from] [to]\` — 순서 변경`,
        ].join('\n'),
      },
      {
        name: '🎤 채널',
        value: [
          `\`${cmd} join [channel]\` — 음성 채널 참가`,
          `\`${cmd} leave\` — 음성 채널 퇴장`,
        ].join('\n'),
      },
      {
        name: '⚙️ 기타',
        value: [
          `\`${cmd} webui\` — Web UI 주소 확인`,
          `\`${ver}\` — 버전 정보`,
        ].join('\n'),
      },
    );

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = { execute };
