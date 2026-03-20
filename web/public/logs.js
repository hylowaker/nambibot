const socket = io();

const connBadge       = document.getElementById('conn-badge');
const offlineOverlay  = document.getElementById('offline-overlay');
const offlineAttempts = document.getElementById('offline-attempts');
const MAX_RECONNECT_SHOW = 5;
const container       = document.getElementById('logs-container');
const logsEmpty       = document.getElementById('logs-empty');
const logCount        = document.getElementById('log-count');
const searchInput     = document.getElementById('input-log-search');
const scrollBottomBtn = document.getElementById('btn-scroll-bottom');
const logsBotAvatar      = document.getElementById('logs-bot-avatar');
const logsAvatarFallback = document.getElementById('logs-avatar-fallback');
const logsBotName        = document.getElementById('logs-bot-name');
const sysinfoBody        = document.getElementById('sysinfo-body');
const btnSysinfoToggle   = document.getElementById('btn-sysinfo-toggle');
const btnSysinfoRefresh  = document.getElementById('btn-sysinfo-refresh');

// 시스템 환경 DOM refs
const si = {
  node:       document.getElementById('si-node'),
  pid:        document.getElementById('si-pid'),
  env:        document.getElementById('si-env'),
  uptime:     document.getElementById('si-uptime'),
  rss:        document.getElementById('si-rss'),
  heapUsed:   document.getElementById('si-heap-used'),
  heapTotal:  document.getElementById('si-heap-total'),
  external:   document.getElementById('si-external'),
  platform:   document.getElementById('si-platform'),
  arch:       document.getElementById('si-arch'),
  release:    document.getElementById('si-release'),
  hostname:   document.getElementById('si-hostname'),
  sysUptime:  document.getElementById('si-sys-uptime'),
  cpu:        document.getElementById('si-cpu'),
  cores:      document.getElementById('si-cores'),
  loadavg:    document.getElementById('si-loadavg'),
  memTotal:   document.getElementById('si-mem-total'),
  memFree:    document.getElementById('si-mem-free'),
  memUsed:    document.getElementById('si-mem-used'),
  ips:        document.getElementById('si-ips'),
  envList:    document.getElementById('si-env-list'),
};

let processStartTs = null;
let uptimeTicker   = null;

let autoScroll   = true;
let activeFilter = 'all';
let searchQuery  = '';
let allEntries   = []; // { el, level, message }

// ── 연결 상태 ──
socket.on('connect', () => {
  connBadge.textContent = '연결됨';
  connBadge.className = 'ok';
  document.body.classList.remove('ui-disabled');
  offlineOverlay.classList.remove('visible');
  socket.emit('cmd:subscribeLogs');
});

socket.on('disconnect', () => {
  connBadge.textContent = '오프라인';
  connBadge.className = 'err';
  document.body.classList.add('ui-disabled');
});

socket.on('reconnect_attempt', (attempt) => {
  connBadge.textContent = '재연결 중...';
  connBadge.className = 'err';
  if (attempt >= MAX_RECONNECT_SHOW) {
    offlineOverlay.classList.add('visible');
    offlineAttempts.textContent = `재연결 시도 ${attempt}회째...`;
  }
});

// ── 봇 프로필 ──
socket.on('botProfile', ({ username, avatar }) => {
  logsBotName.textContent = username;
  if (avatar) {
    logsBotAvatar.src = avatar;
    logsBotAvatar.style.display = '';
    logsAvatarFallback.style.display = 'none';
  }
});

// ── 로그 수신 ──
socket.on('logHistory', (entries) => {
  container.innerHTML = '';
  container.appendChild(logsEmpty);
  allEntries = [];
  entries.forEach(addEntry);
  scrollToBottom();
});

socket.on('log', (entry) => {
  addEntry(entry);
  if (autoScroll) scrollToBottom();
});

// ── 엔트리 렌더링 ──
function addEntry(entry) {
  logsEmpty.style.display = 'none';

  const el = document.createElement('div');
  el.className = `log-entry log-entry--${entry.level}`;
  el.dataset.level = entry.level;

  const d    = new Date(entry.ts);
  const date = d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '-').replace('.', '');
  const hms  = d.toLocaleTimeString('ko-KR', { hour12: false });
  const ms   = String(d.getMilliseconds()).padStart(3, '0');

  el.innerHTML =
    `<span class="log-ts">${date} ${hms}.${ms}</span>` +
    `<span class="log-badge">${entry.level.toUpperCase()}</span>` +
    `<span class="log-msg"></span>`;

  const msgEl = el.querySelector('.log-msg');
  msgEl.innerHTML = highlightMsg(entry.message, searchQuery);

  allEntries.push({ el, level: entry.level, message: entry.message, msgEl });
  container.appendChild(el);

  applyVisibility(allEntries[allEntries.length - 1]);
  updateCount();
}

// ── 가시성 결정 ──
function applyVisibility(record) {
  const levelOk  = activeFilter === 'all' || record.level === activeFilter;
  const searchOk = searchQuery === '' || stripAnsi(record.message).toLowerCase().includes(searchQuery);
  record.el.style.display = (levelOk && searchOk) ? '' : 'none';
}

function applyAllVisibility() {
  allEntries.forEach(r => {
    r.msgEl.innerHTML = highlightMsg(r.message, searchQuery);
    applyVisibility(r);
  });
}

function updateCount() {
  const visible = allEntries.filter(r => r.el.style.display !== 'none').length;
  const total   = allEntries.length;
  if (total === 0) { logCount.textContent = ''; return; }
  logCount.textContent = visible < total ? `${visible} / ${total}개` : `${total}개`;
}

// ── 검색 ──
searchInput.addEventListener('input', () => {
  searchQuery = searchInput.value.trim().toLowerCase();
  applyAllVisibility();
  updateCount();
  if (autoScroll) scrollToBottom();
});

// ── 레벨 필터 ──
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.level;
    applyAllVisibility();
    updateCount();
    if (autoScroll) scrollToBottom();
  });
});

// ── 스크롤 ──
function scrollToBottom() {
  container.scrollTop = container.scrollHeight;
  scrollBottomBtn.classList.remove('visible');
}

container.addEventListener('scroll', () => {
  const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 60;
  if (atBottom) {
    autoScroll = true;
    scrollBottomBtn.classList.remove('visible');
  } else {
    autoScroll = false;
    scrollBottomBtn.classList.add('visible');
  }
});

scrollBottomBtn.addEventListener('click', () => {
  autoScroll = true;
  scrollToBottom();
});

// ── 시스템 환경 정보 ──
socket.on('sysInfo', (info) => {
  // 런타임
  si.node.textContent   = info.nodeVersion;
  si.pid.textContent    = info.pid;
  si.env.textContent    = info.nodeEnv;
  // 프로세스 메모리
  si.rss.textContent      = fmtBytes(info.memRss);
  si.heapUsed.textContent = fmtBytes(info.memHeapUsed);
  si.heapTotal.textContent= fmtBytes(info.memHeapTotal);
  si.external.textContent = fmtBytes(info.memExternal);
  // 시스템
  si.platform.textContent = info.platform;
  si.arch.textContent     = info.arch;
  si.release.textContent  = info.osRelease;
  si.hostname.textContent = info.hostname;
  si.sysUptime.textContent= fmtDuration(info.sysUptime);
  // CPU
  si.cpu.textContent    = info.cpu;
  si.cores.textContent  = `${info.cpuCores}코어`;
  const la = info.loadAvg;
  si.loadavg.textContent = la.every(v => v === 0)
    ? 'N/A (Windows)'
    : `${la[0].toFixed(2)} / ${la[1].toFixed(2)} / ${la[2].toFixed(2)}`;
  // 시스템 메모리
  si.memTotal.textContent = fmtBytes(info.totalMem);
  si.memFree.textContent  = fmtBytes(info.freeMem);
  si.memUsed.textContent  = fmtBytes(info.totalMem - info.freeMem);
  // 네트워크
  if (info.ips && info.ips.length > 0) {
    si.ips.innerHTML = info.ips
      .map(i => `<span style="display:block">${i.address} <span style="opacity:0.5;font-size:0.65rem">(${i.iface} / ${i.family})</span></span>`)
      .join('');
  } else {
    si.ips.textContent = '없음';
  }
  // 환경 변수
  if (info.envVars && info.envVars.length > 0) {
    si.envList.innerHTML = info.envVars.map(([k, v]) =>
      `<div class="sysinfo-env-row">` +
        `<span class="sysinfo-env-key">${escHtml(k)}</span>` +
        `<span class="sysinfo-env-eq">=</span>` +
        `<span class="sysinfo-env-val" title="${escHtml(v)}">${escHtml(v)}</span>` +
      `</div>`
    ).join('');
  }
  // 업타임 ticker
  processStartTs = info.processStartTs;
  clearInterval(uptimeTicker);
  tickUptime();
  uptimeTicker = setInterval(tickUptime, 1000);
});

function tickUptime() {
  if (processStartTs === null) return;
  si.uptime.textContent = fmtDuration((Date.now() - processStartTs) / 1000);
}

function fmtBytes(b) {
  if (b >= 1073741824) return (b / 1073741824).toFixed(2) + ' GB';
  if (b >= 1048576)    return (b / 1048576).toFixed(1) + ' MB';
  return Math.round(b / 1024) + ' KB';
}

function fmtDuration(secs) {
  secs = Math.floor(secs);
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (d > 0) return `${d}일 ${h}시간 ${m}분 ${s}초`;
  if (h > 0) return `${h}시간 ${m}분 ${s}초`;
  if (m > 0) return `${m}분 ${s}초`;
  return `${s}초`;
}

// ── 시스템 환경 카드 토글 / 새로고침 ──
btnSysinfoToggle.addEventListener('click', () => {
  const nowCollapsed = sysinfoBody.classList.toggle('collapsed');
  btnSysinfoToggle.textContent = nowCollapsed ? '▼ 펼치기' : '▲ 접기';
});

btnSysinfoRefresh.addEventListener('click', () => {
  socket.emit('cmd:getSysInfo');
});

// ── 유틸 ──
function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*m/g, '');
}

// ANSI 색상 코드 → CSS color
const ANSI_CSS = {
  '31':   '#e06c75',  // red
  '32':   '#98c379',  // green
  '33':   '#e5c07b',  // yellow
  '34':   '#61afef',  // blue
  '35':   '#c678dd',  // magenta
  '36':   '#56b6c2',  // cyan
  '90':   '#636d83',  // dark gray (DIM)
  '1;31': '#ef8492',  // bold red
  '1;32': '#a8d080',  // bold green
  '1;33': '#e5c07b',  // bold yellow
  '1;34': '#7ab3e0',  // bold blue
  '1;35': '#d4a0e8',  // bold magenta
  '1;36': '#7ab3e0',  // bold cyan
};

function ansiToHtml(text) {
  let result = '';
  let open = false;
  for (const part of text.split(/(\x1B\[[0-9;]*m)/)) {
    const m = part.match(/^\x1B\[([0-9;]*)m$/);
    if (m) {
      if (open) { result += '</span>'; open = false; }
      const color = ANSI_CSS[m[1]];
      if (color) { result += `<span style="color:${color}">`; open = true; }
    } else {
      result += escHtml(part);
    }
  }
  if (open) result += '</span>';
  return result;
}

function highlightMsg(text, query) {
  const html = ansiToHtml(text);
  if (!query) return html;
  const safeQ = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(safeQ, 'gi');
  // HTML 태그 안쪽은 건드리지 않고 텍스트 노드에만 하이라이트 적용
  return html.replace(/<[^>]+>|[^<]+/g, seg =>
    seg.startsWith('<') ? seg : seg.replace(re, m => `<mark class="log-highlight">${m}</mark>`)
  );
}
