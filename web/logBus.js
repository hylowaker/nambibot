const { EventEmitter } = require('events');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const MAX_ENTRIES    = 500;   // 메모리 버퍼 최대 항목 수
const MAX_FILE_LINES = 2000;  // 파일 최대 줄 수
const TRIM_TO_LINES  = 1500;  // 초과 시 이 줄 수로 트림

const NAMBI_DIR = process.env.NAMBI_DIR || path.join(os.homedir(), '.nambi');
const LOG_FILE  = path.join(NAMBI_DIR, 'logs.jsonl');

const buffer = [];
const logBus = new EventEmitter();
let fileLineCount = 0;

// ── 시작 시 파일에서 복원 ─────────────────────────────────
try { fs.mkdirSync(NAMBI_DIR, { recursive: true }); } catch {}

try {
  if (fs.existsSync(LOG_FILE)) {
    const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(l => l.trim());
    fileLineCount = lines.length;
    for (const line of lines.slice(-MAX_ENTRIES)) {
      try { buffer.push(JSON.parse(line)); } catch {}
    }
  }
} catch {}

function trimFile() {
  try {
    const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(l => l.trim());
    const trimmed = lines.slice(-TRIM_TO_LINES);
    fs.writeFileSync(LOG_FILE, trimmed.join('\n') + '\n', 'utf8');
    fileLineCount = trimmed.length;
  } catch {}
}

function addLog(entry) {
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.shift();
  logBus.emit('log', entry);

  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
    fileLineCount++;
    if (fileLineCount > MAX_FILE_LINES) trimFile();
  } catch {}
}

function getLogs() {
  return [...buffer];
}

module.exports = { logBus, getLogs, addLog };
