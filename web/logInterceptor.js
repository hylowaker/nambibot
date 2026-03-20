const { addLog } = require('./logBus');

// ── ANSI ──────────────────────────────────────────────────
const R  = '\x1b[0m';           // reset
const DIM    = '\x1b[90m';      // dark gray  (timestamp)
const BCYAN  = '\x1b[1;36m';   // bold cyan  (INFO label)
const BYELLOW= '\x1b[1;33m';   // bold yellow(WARN label)
const BRED   = '\x1b[1;31m';   // bold red   (ERROR label)

// tag → color
const TAG_COLOR = {
  boot:        '\x1b[1;32m',   // bold green
  discord:     '\x1b[1;34m',   // bold blue
  cmd:         '\x1b[1;35m',   // bold magenta
  player:      '\x1b[1;36m',   // bold cyan
  voice:       '\x1b[35m',     // magenta
  'yt-dlp':    '\x1b[32m',     // green
  web:         '\x1b[34m',     // blue
  auth:        '\x1b[33m',     // yellow
  process:     '\x1b[31m',     // red
  persistence: '\x1b[90m',     // dark gray
  boot:        '\x1b[32m',     // green
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
    if (/^\d+$/.test(inner)) return `${DIM}${match}${R}`;   // guild ID → gray
    const c = TAG_COLOR[inner.toLowerCase()];
    return c ? `${c}${match}${R}` : `\x1b[36m${match}${R}`; // unknown → cyan
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
    } catch { /* ignore */ }
  };
}

console.log   = patch('info',  _stdout);
console.info  = patch('info',  _stdout);
console.warn  = patch('warn',  _stderr);
console.error = patch('error', _stderr);
