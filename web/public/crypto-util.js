const _sessionKeyHex = sessionStorage.getItem('nambibot_sk');
let _cryptoKey = null;
const _canSubtle = typeof crypto !== 'undefined' && !!crypto.subtle;

async function _ensureKey() {
  if (_cryptoKey || !_sessionKeyHex || !_canSubtle) return;
  try {
    const raw = new Uint8Array(_sessionKeyHex.match(/.{2}/g).map(b => parseInt(b, 16)));
    _cryptoKey = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  } catch {
    _cryptoKey = null;
  }
}

async function decryptPayload(payload) {
  if (!payload || !payload._enc) return payload;
  if (!_canSubtle) return null;
  await _ensureKey();
  if (!_cryptoKey) return null;
  try {
    const iv = new Uint8Array(payload.iv.match(/.{2}/g).map(b => parseInt(b, 16)));
    const data = Uint8Array.from(atob(payload.data), c => c.charCodeAt(0));
    const tag = new Uint8Array(payload.tag.match(/.{2}/g).map(b => parseInt(b, 16)));
    const combined = new Uint8Array(data.length + tag.length);
    combined.set(data);
    combined.set(tag, data.length);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, _cryptoKey, combined);
    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch {
    return null;
  }
}
