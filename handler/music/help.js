const { MessageFlags } = require('discord.js');
/** @typedef {import('discord.js').ChatInputCommandInteraction} ChatInputCommandInteraction */

/**
 * @param {ChatInputCommandInteraction} interaction
 */
async function execute(interaction) {
  const lines = [
    '`/music join` — 음성 채널에 참가',
    '`/music show` — 현재 재생 중인 항목과 대기열 출력',
    '`/music queue [url]` — 대기열에 음악 추가',
    '`/music delete [index]` — 대기열 항목 삭제',
    '`/music purge` — 대기열 초기화',
    '`/music play [index]` — 재생 시작',
    '`/music stop` — 재생 중단',
    '`/music skip` — 현재 재생을 건너뛰고 다음 항목 재생',
    '`/music leave` — 음성 채널 퇴장',
  ];
  await interaction.reply({
    content: lines.join('\n'),
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = { execute };
