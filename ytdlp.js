const { spawn } = require('child_process');
const { unlink } = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
require("dotenv").config({ quiet: true });

const YTDLP_BIN = process.env.YT_DLP_BIN || `yt-dlp${process.platform === 'win32' ? '.exe' : ''}`;
const FFMPEG_BIN = process.env.FFMPEG_BIN || 'ffmpeg';

function ytThumb(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  return m ? `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` : null;
}

function _fetchInfo(url, useFlat, onProgress) {
  return new Promise((resolve, reject) => {
    const args = ['--simulate', '--no-warnings',
      '--print', '%(playlist_count)s\t%(title)s\t%(webpage_url)s\t%(uploader)s\t%(duration)s\t%(thumbnail)s',
      url];
    if (useFlat) args.splice(1, 0, '--flat-playlist');

    const proc = spawn(YTDLP_BIN, args);

    const items = [];
    let total = null;
    let buf = '';
    let stderr = '';

    proc.stdout.on('data', d => {
      buf += d.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.split('\t');
        const playlistCount = parseInt(parts[0], 10);
        if (!isNaN(playlistCount)) total = playlistCount;
        const title = (parts[1] || line).slice(0, 200);
        const itemUrl = parts[2] || url;
        const uploader = (parts[3] && parts[3] !== 'NA') ? parts[3].trim().slice(0, 100) : null;
        const durationRaw = parseFloat(parts[4]);
        const duration = (!isNaN(durationRaw) && durationRaw > 0) ? Math.round(durationRaw) : null;
        let thumbnail = (parts[5] && parts[5] !== 'NA' && parts[5].startsWith('http')) ? parts[5].trim() : null;
        if (!thumbnail) thumbnail = ytThumb(itemUrl);
        const item = { title, url: itemUrl, uploader, duration, thumbnail };
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

async function getInfo(url, onProgress) {
  const items = await _fetchInfo(url, true, null);
  const hasNA = items.some(it => it.title === 'NA');
  if (hasNA && items.length > 0) {
    return _fetchInfo(url, false, onProgress);
  }
  if (onProgress) {
    items.forEach((item, i) => onProgress(i + 1, items.length, item));
  }
  return items;
}

const NOISE = ['BrokenPipeError', 'Broken pipe', 'Exception ignored', 'Error writing', 'pipe:1: Broken'];

const DOWNLOAD_TIMEOUT_MS = 120_000;

function createAudioFile(url, onProgress) {
  const tmpPath = path.join(os.tmpdir(), `nambi-${Date.now()}.ogg`);
  console.log(`[yt-dlp] 다운로드 시작: ${url}  →  ${tmpPath}`);

  return new Promise((resolve, reject) => {
    const ytProc = spawn(YTDLP_BIN, [
      '--format', 'bestaudio[ext=webm]/bestaudio',
      '--no-playlist',
      '--output', '-',
      '--no-warnings',
      '--newline',
      url,
    ]);

    const ffProc = spawn(FFMPEG_BIN, [
      '-hide_banner',
      '-loglevel', 'error',
      '-i', 'pipe:0',
      '-vn',
      '-af', 'loudnorm=I=-14:TP=-1:LRA=11,afade=t=in:d=3',
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

    let lastPct = -1;
    ytProc.stderr.on('data', d => {
      const raw = d.toString();
      for (const line of raw.split('\n')) {
        const m = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
        if (m) {
          const pct = Math.floor(parseFloat(m[1]));
          if (pct !== lastPct) { lastPct = pct; onProgress?.(pct); }
          continue;
        }
        const trimmed = line.trim();
        if (trimmed && !NOISE.some(s => trimmed.includes(s))) console.error('[yt-dlp]', trimmed);
      }
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

function checkEjs() {
  return new Promise((resolve) => {
    const proc = spawn('python3', ['-c', 'import yt_dlp_ejs'], { stdio: 'ignore' });
    proc.on('close', code => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

const NIGHTLY_FETCH_TIMEOUT_MS = 3000;

function getLatestNightlyTag() {
  const fetch = new Promise((resolve) => {
    const req = https.get({
      hostname: 'api.github.com',
      path: '/repos/yt-dlp/yt-dlp-nightly-builds/releases/latest',
      headers: { 'User-Agent': 'nambibot' },
      timeout: NIGHTLY_FETCH_TIMEOUT_MS,
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data).tag_name ?? null); }
        catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });

  const hardCap = new Promise(resolve =>
    setTimeout(() => resolve(null), NIGHTLY_FETCH_TIMEOUT_MS + 500)
  );

  return Promise.race([fetch, hardCap]);
}

module.exports = { YTDLP_BIN, FFMPEG_BIN, getInfo, createAudioFile, getVersion, getLatestNightlyTag, checkEjs };
