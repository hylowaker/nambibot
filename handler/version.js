const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const { EmbedBuilder } = require('discord.js');
const { YTDLP_BIN, FFMPEG_BIN } = require('../ytdlp');

const execFileAsync = promisify(execFile);

async function runCommand(cmd, args) {
  try {
    const { stdout } = await execFileAsync(cmd, args);
    return stdout.trim();
  } catch (err) {
    return err.stdout?.trim() || err.message;
  }
}

function detectRuntime() {
  if (typeof globalThis.Deno !== 'undefined') {
    return { name: 'Deno', version: `v${globalThis.Deno.version.deno}` };
  }
  if (process.versions.bun) {
    return { name: 'Bun', version: `v${process.versions.bun}` };
  }
  return { name: 'Node.js', version: process.version };
}

async function execute(interaction) {
  await interaction.deferReply();

  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const runtime = detectRuntime();

  const [ytdlpVer, ffmpegVer] = await Promise.all([
    runCommand(YTDLP_BIN, ['--version']),
    runCommand(FFMPEG_BIN, ['-version']).then(s => s.split('\n')[0]),
  ]);

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`${pkg.name}  v${pkg.version}`)
    .addFields(
      { name: 'Runtime', value: `\`${runtime.name} ${runtime.version}\``, inline: true },
      { name: 'yt-dlp', value: `\`${ytdlpVer}\``, inline: true },
      { name: 'ffmpeg', value: `\`${ffmpegVer}\``, inline: false },
    );

  if (pkg.description) embed.setDescription(pkg.description);

  await interaction.editReply({ embeds: [embed] });
}

module.exports = { execute };
