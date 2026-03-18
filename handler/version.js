const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
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
    return { name: 'deno', version: `v${globalThis.Deno.version.deno}` };
  }
  if (process.versions.bun) {
    return { name: 'bun', version: `v${process.versions.bun}` };
  }
  return { name: 'node', version: process.version };
}

async function execute(interaction) {
  await interaction.deferReply();

  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const runtime = detectRuntime();

  const [ytdlpVer, ffmpegVer] = await Promise.all([
    runCommand(YTDLP_BIN, ['--version']),
    runCommand(FFMPEG_BIN, ['-version']).then(s => s.split('\n')[0]),
  ]);

  const lines = [
    `**${pkg.name}** v${pkg.version}`,
    pkg.description ? `> ${pkg.description}` : null,
    '',
    `${runtime.name}: \`${runtime.version}\``,
    `yt-dlp: \`${ytdlpVer}\``,
    `ffmpeg: \`${ffmpegVer}\``,
  ].filter(l => l !== null);

  await interaction.editReply(lines.join('\n'));
}

module.exports = { execute };
