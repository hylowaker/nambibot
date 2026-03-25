const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const os = require('os');

const NAMBI_DIR = process.env.NAMBI_DIR || path.join(os.homedir(), '.nambi');
const STATE_FILE = path.join(NAMBI_DIR, 'queue-state.json');

console.log(`[persistence] 상태 파일 경로: ${STATE_FILE}`);

const MAX_HISTORY = 20;

let _saveTimer = null;
let _getAllStatesFn = null;
const SAVE_DEBOUNCE_MS = 500;

function _collectData(allStates) {
  const data = {};

  for (const state of allStates) {
    const items = [];
    if (state.currentItem) items.push(state.currentItem);
    items.push(...state.queue);

    const history = (state.history ?? []).slice(0, MAX_HISTORY);

    if (items.length > 0 || state.connectedChannelName || history.length > 0) {
      data[state._guildId] = {
        channelName: state.connectedChannelName || null,
        items,
        history,
      };
    }
  }
  return data;
}

async function saveState(allStates) {
  const data = _collectData(allStates);

  try {
    await fsPromises.mkdir(NAMBI_DIR, { recursive: true });
    await fsPromises.writeFile(STATE_FILE, JSON.stringify(data), 'utf8');
    const total = Object.values(data).reduce((s, v) => s + v.items.length, 0);
    console.log(`[persistence] 저장: ${Object.keys(data).length}개 길드, 총 ${total}곡`);
  } catch (err) {
    console.error('[persistence] 저장 실패:', err);
  }
}

function saveStateSync(allStates) {
  const data = _collectData(allStates);
  try {
    fs.mkdirSync(NAMBI_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(data), 'utf8');
    const total = Object.values(data).reduce((s, v) => s + v.items.length, 0);
    console.log(`[persistence] 동기 저장: ${Object.keys(data).length}개 길드, 총 ${total}곡`);
  } catch (err) {
    console.error('[persistence] 동기 저장 실패:', err);
  }
}

function scheduleSave() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    if (_getAllStatesFn) saveState(_getAllStatesFn());
  }, SAVE_DEBOUNCE_MS);
}

function flushSync() {
  if (_saveTimer) {
    clearTimeout(_saveTimer);
    _saveTimer = null;
    if (_getAllStatesFn) saveStateSync(_getAllStatesFn());
  }
}

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      console.log('[persistence] 저장된 상태 없음 (파일 없음)');
      return {};
    }
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);

    const data = {};
    for (const [guildId, val] of Object.entries(parsed)) {
      if (Array.isArray(val)) {
        data[guildId] = { channelName: null, items: val };
      } else {
        data[guildId] = val;
      }
    }

    const total = Object.values(data).reduce((s, v) => s + (v.items?.length ?? 0), 0);
    console.log(`[persistence] 불러옴: ${Object.keys(data).length}개 길드, 총 ${total}곡`);
    return data;
  } catch (err) {
    console.error('[persistence] 불러오기 실패:', err);
    return {};
  }
}

function init(stateBus, getAllStates) {
  _getAllStatesFn = getAllStates;
  stateBus.on('stateChanged', () => {
    scheduleSave();
  });

  process.on('exit', () => flushSync());
  process.on('SIGINT', () => { flushSync(); process.exit(0); });
  process.on('SIGTERM', () => { flushSync(); process.exit(0); });
}

module.exports = { init, saveState, loadState };
