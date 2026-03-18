const { spawn } = require('child_process');
/** @typedef {import('./types').TrackItem} TrackItem */
const path = require('path');
require("dotenv").config({ quiet: true });

const YTDLP_BIN = process.env.YT_DLP_BIN || `yt-dlp${process.platform === 'win32' ? '.exe' : ''}`;
const FFMPEG_BIN = process.env.FFMPEG_BIN || 'ffmpeg';

/** 
 * Fetches metadata from the given URL using yt-dlp.
 * The returned array may contain multiple items if the URL is a playlist.
 * 
 * @param {string} url
 * @returns {Promise<TrackItem[]>}
 */
function getInfo(url) {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP_BIN, [
      '--simulate',
      '--flat-playlist',
      '--no-warnings',
      '--print', '%(title)s\t%(webpage_url)s',
      url,
    ]);

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => stdout += d);
    proc.stderr.on('data', d => stderr += d);

    proc.on('error', reject);
    proc.on('close', code => {
      if (code !== 0) {
        return reject(new Error(stderr.trim() || '알 수 없는 오류가 발생했습니다.'));
      }
      const items = stdout.trim().split('\n').filter(Boolean).map(line => {
        const i = line.indexOf('\t');
        const title = (i >= 0 ? line.slice(0, i) : line).slice(0, 200);
        const resolvedUrl = i >= 0 ? line.slice(i + 1) : line;
        return { title: title, url: resolvedUrl };
      });
      if (items.length === 0) {
        return reject(new Error('항목을 찾을 수 없습니다.'));
      }
      resolve(items);
    });
  });
}

// Returns a readable stream of audio data from the given URL
function createAudioStream(url) {
  const proc = spawn(YTDLP_BIN, [
    '--format', 'bestaudio/best',
    '--no-playlist',
    '--output', '-',
    '--ffmpeg-location', FFMPEG_BIN,
    '--no-warnings',
    url,
  ]);
  proc.on('error', err => console.error('[yt-dlp] error:', err));
  proc.stderr.on('data', d => console.error('[yt-dlp]', d.toString().trim()));
  return proc.stdout;
}

// Returns yt-dlp version string
function getVersion() {
  return new Promise(resolve => {
    const proc = spawn(YTDLP_BIN, ['--version']);
    let out = '';
    proc.stdout.on('data', d => out += d);
    proc.stderr.on('data', d => out += d);
    proc.on('close', () => resolve(out.trim()));
    proc.on('error', () => resolve('(unknown)'));
  });
}

module.exports = { YTDLP_BIN, FFMPEG_BIN, getInfo, createAudioStream, getVersion };
