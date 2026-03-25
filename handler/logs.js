const { MessageFlags, EmbedBuilder } = require('discord.js');
const { getLogs } = require('../web/logBus');

const RESET = '\x1b[0m';
const DIM   = '\x1b[2m';
const LEVEL_COLOR = {
  info:  '\x1b[36m',
  warn:  '\x1b[33m',
  error: '\x1b[31m',
};
const LEVEL_EMBED_COLOR = {
  all:   0x6080FF,
  info:  0x6080FF,
  warn:  0xFEE75C,
  error: 0xFF375F,
};

function stripAnsi(s) {
  return s.replace(/\x1B\[[0-9;]*[mGKHFJ]/g, '');
}

function fmtTs(ms) {
  return new Date(ms).toTimeString().slice(0, 8);
}

async function execute(interaction) {
  const count = interaction.options.getInteger('count') ?? 20;
  const level = interaction.options.getString('level') ?? 'all';

  let entries = getLogs();
  if (level !== 'all') {
    entries = entries.filter(e => e.level === level);
  }
  entries = entries.slice(-count);

  if (entries.length === 0) {
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x5865F2)
        .setDescription('📋 표시할 로그가 없습니다.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  const lines = entries.map(e => {
    const ts    = fmtTs(e.ts);
    const color = LEVEL_COLOR[e.level] || '';
    const label = e.level.toUpperCase().padEnd(5);
    const msg   = stripAnsi(e.message).slice(0, 90);
    return `${DIM}${ts}${RESET}  ${color}${label}${RESET}  ${msg}`;
  }).join('\n');

  const levelLabel = level === 'all' ? '전체' : level.toUpperCase();
  const block = `\`\`\`ansi\n${lines}\n\`\`\``;

  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(LEVEL_EMBED_COLOR[level])
      .setTitle(`📋 서버 로그`)
      .setDescription(block)
      .setFooter({ text: `최근 ${entries.length}개 · ${levelLabel}` })],
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = { execute };
