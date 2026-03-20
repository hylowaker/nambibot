const { spawn } = require('child_process');
const { unlink } = require('fs');
const os = require('os');
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
 * @param {(current: number, total: number|null, item: TrackItem) => void} [onProgress]
 * @returns {Promise<TrackItem[]>}
 */
function getInfo(url, onProgress) {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP_BIN, [
      '--simulate',
      '--flat-playlist',
      '--no-warnings',
      '--print', '%(playlist_count)s\t%(title)s\t%(webpage_url)s\t%(uploader)s\t%(duration)s',
      url,
    ]);

    const items = [];
    let total = null;
    let buf = '';
    let stderr = '';

    proc.stdout.on('data', d => {
      buf += d.toString();
      const lines = buf.split('\n');
      buf = lines.pop(); // 마지막 불완전한 줄은 버퍼에 유지
      for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.split('\t');
        const playlistCount = parseInt(parts[0], 10);
        if (!isNaN(playlistCount)) total = playlistCount;
        const title = (parts[1] || line).slice(0, 200);
        const itemUrl = parts[2] || url;
        const uploader = (parts[3] && parts[3] !== 'NA') ? parts[3].trim().slice(0, 100) : null;
        const durationRaw = parseInt(parts[4], 10);
        const duration = (!isNaN(durationRaw) && durationRaw > 0) ? durationRaw : null;
        const item = { title, url: itemUrl, uploader, duration };
        items.push(item);
        onProgress?.(items.length, total, item);
      }
    });

    proc.stderr.on('data', d => stderr += d);
    proc.on('error', reject);
    proc.on('close', code => {
      if (code !== 0) {
        return reject(new Error(stderr.trim() || '알 수 없는 오류가 발생했습니다.'));
      }
      if (items.length === 0) {
        return reject(new Error('항목을 찾을 수 없습니다.'));
      }
      resolve(items);
    });
  });
}

const NOISE = ['BrokenPipeError', 'Broken pipe', 'Exception ignored', 'Error writing', 'pipe:1: Broken'];

// Downloads audio from the given URL to a temp OGG/Opus file.
// Resolves with the temp file path when done. Caller is responsible for deleting the file.
const DOWNLOAD_TIMEOUT_MS = 120_000; // 2분 초과 시 강제 종료

function createAudioFile(url) {
  const tmpPath = path.join(os.tmpdir(), `nambi-${Date.now()}.ogg`);
  console.log(`[yt-dlp] 다운로드 시작: ${url}  →  ${tmpPath}`);

  return new Promise((resolve, reject) => {
    const ytProc = spawn(YTDLP_BIN, [
      '--format', 'bestaudio[ext=webm]/bestaudio',
      '--no-playlist',
      '--output', '-',
      '--no-warnings',
      url,
    ]);

    const ffProc = spawn(FFMPEG_BIN, [
      '-hide_banner',
      '-loglevel', 'error',
      '-i', 'pipe:0',
      '-vn',
      '-ar', '48000',
      '-ac', '2',
      '-c:a', 'libopus',
      '-b:a', '128k',
      '-frame_duration', '20',
      '-application', 'audio',
      '-f', 'ogg',
      tmpPath,
    ]);

    let settled = false;
    function abort(err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ytProc.kill('SIGKILL'); } catch {}
      try { ffProc.kill('SIGKILL'); } catch {}
      unlink(tmpPath, () => {});
      reject(err);
    }

    const timer = setTimeout(() => {
      console.error(`[yt-dlp] 타임아웃: ${DOWNLOAD_TIMEOUT_MS / 1000}s 초과 — 프로세스 강제 종료  파일: ${tmpPath}`);
      abort(new Error('다운로드 타임아웃'));
    }, DOWNLOAD_TIMEOUT_MS);

    ytProc.stdout.pipe(ffProc.stdin);

    ytProc.stderr.on('data', d => {
      const msg = d.toString().trim();
      if (msg && !NOISE.some(s => msg.includes(s))) console.error('[yt-dlp]', msg);
    });
    ffProc.stderr.on('data', d => {
      const msg = d.toString().trim();
      if (msg && !NOISE.some(s => msg.includes(s))) console.error('[ffmpeg]', msg);
    });

    ytProc.on('error', abort);
    ffProc.on('error', abort);
    ffProc.stdin.on('error', () => {});

    ffProc.on('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve(tmpPath);
      else {
        unlink(tmpPath, () => {});
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });
  });
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

module.exports = { YTDLP_BIN, FFMPEG_BIN, getInfo, createAudioFile, getVersion };
