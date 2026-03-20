const { MessageFlags } = require('discord.js');
/** @typedef {import('discord.js').ChatInputCommandInteraction} ChatInputCommandInteraction */

/**
 * @param {ChatInputCommandInteraction} interaction
 */
async function execute(interaction) {
  const devPrefix = (process.env.DEVELOPE_PREFIX === 'ON' || process.env.DEVELOPE_PREFIX === '1') ? 'dev-' : '';
  const cmd = `/${devPrefix}music`;
  const lines = [
    `\`${cmd} join\` — 음성 채널에 참가`,
    `\`${cmd} show\` — 현재 재생 중인 항목과 대기열 출력`,
    `\`${cmd} queue [url]\` — 대기열에 음악 추가`,
    `\`${cmd} delete [index]\` — 대기열 항목 삭제`,
    `\`${cmd} purge\` — 대기열 초기화`,
    `\`${cmd} play [index]\` — 재생 시작`,
    `\`${cmd} stop\` — 재생 중단`,
    `\`${cmd} skip\` — 현재 재생을 건너뛰고 다음 항목 재생`,
    `\`${cmd} leave\` — 음성 채널 퇴장`,
  ];
  await interaction.reply({
    content: lines.join('\n'),
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = { execute };
