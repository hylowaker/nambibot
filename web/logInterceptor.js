const { addLog } = require('./logBus');

const R  = '\x1b[0m';
const DIM    = '\x1b[90m';
const BCYAN  = '\x1b[1;36m';
const BYELLOW= '\x1b[1;33m';
const BRED   = '\x1b[1;31m';

const TAG_COLOR = {
  boot:        '\x1b[1;32m',
  discord:     '\x1b[1;34m',
  cmd:         '\x1b[1;35m',
  player:      '\x1b[1;36m',
  voice:       '\x1b[35m',
  'yt-dlp':    '\x1b[32m',
  web:         '\x1b[34m',
  auth:        '\x1b[33m',
  process:     '\x1b[31m',
  persistence: '\x1b[90m',
  boot:        '\x1b[32m',
};

const LEVEL = {
  info:  { color: BCYAN,   label: 'INFO ' },
  warn:  { color: BYELLOW, label: 'WARN ' },
  error: { color: BRED,    label: 'ERROR' },
};

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 23);
}

function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*[mGKHFJ]/g, '');
}

function formatArgs(args) {
  return args.map(a => {
    if (a instanceof Error) return a.stack || a.message;
    if (a !== null && typeof a === 'object') {
      try { return JSON.stringify(a); } catch { return String(a); }
    }
    return String(a);
  }).join(' ');
}

function colorTags(msg) {
  return msg.replace(/\[([^\]]+)\]/g, (match, inner) => {
    if (/^\d+$/.test(inner)) return `${DIM}${match}${R}`;
    const c = TAG_COLOR[inner.toLowerCase()];
    return c ? `${c}${match}${R}` : `\x1b[36m${match}${R}`;
  });
}

function resolveLevel(requested, message) {
  if (requested === 'error' && !/error/i.test(message)) return 'info';
  return requested;
}

const _stdout = process.stdout;
const _stderr = process.stderr;

function patch(level, fd) {
  return function (...args) {
    try {
      const raw     = formatArgs(args);
      const resolved = resolveLevel(level, raw);
      const { color, label } = LEVEL[resolved];
      const line = `${DIM}${ts()}${R}  ${color}${label}${R}  ${colorTags(raw)}\n`;
      fd.write(line);
      addLog({ ts: Date.now(), level: resolved, message: colorTags(raw) });
    } catch {  }
  };
}

console.log   = patch('info',  _stdout);
console.info  = patch('info',  _stdout);
console.warn  = patch('warn',  _stderr);
console.error = patch('error', _stderr);
