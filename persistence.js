const fs = require('fs');
const path = require('path');
const os = require('os');
/** @typedef {import('./types').TrackItem} TrackItem */

const NAMBI_DIR = process.env.NAMBI_DIR || path.join(os.homedir(), '.nambi');
const STATE_FILE = path.join(NAMBI_DIR, 'queue-state.json');

console.log(`[persistence] 상태 파일 경로: ${STATE_FILE}`);

/**
 * 모든 길드의 대기열 + 연결 채널 정보를 파일에 저장합니다.
 * @param {IterableIterator<import('./types').PlayerState>} allStates
 */
const MAX_HISTORY = 20;

function saveState(allStates) {
  /** @type {Record<string, { channelName: string|null, items: TrackItem[], history: TrackItem[] }>} */
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

  try {
    fs.mkdirSync(NAMBI_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(data), 'utf8');
    const total = Object.values(data).reduce((s, v) => s + v.items.length, 0);
    console.log(`[persistence] 저장: ${Object.keys(data).length}개 길드, 총 ${total}곡`);
  } catch (err) {
    console.error('[persistence] 저장 실패:', err);
  }
}

/**
 * 저장된 상태를 불러옵니다.
 * @returns {Record<string, { channelName: string|null, items: TrackItem[] }>}
 */
function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      console.log('[persistence] 저장된 상태 없음 (파일 없음)');
      return {};
    }
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);

    // 이전 형식(배열) → 새 형식({ channelName, items }) 변환
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

/**
 * stateBus의 stateChanged 이벤트를 구독하여 상태 변경 시마다 즉시 저장합니다.
 * @param {import('events').EventEmitter} stateBus
 * @param {() => IterableIterator<import('./types').PlayerState>} getAllStates
 */
function init(stateBus, getAllStates) {
  stateBus.on('stateChanged', () => {
    saveState(getAllStates());
  });
}

module.exports = { init, saveState, loadState };
