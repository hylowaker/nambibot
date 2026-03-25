const crypto = require('crypto');

const PASSWORD    = process.env.WEB_PASSWORD || '';
const COOKIE_NAME = 'nambi_sess';
const MAX_AGE_SEC = 30 * 24 * 60 * 60;

if (PASSWORD.length > 0 && PASSWORD.length < 8) {
  console.warn('[auth] 경고: WEB_PASSWORD가 8자 미만입니다. 보안을 위해 더 긴 비밀번호를 사용하세요.');
}

function isSecureRequest(req) {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

const MAX_ATTEMPTS  = 10;
const WINDOW_MS     = 10 * 60 * 1000;
const LOCKOUT_MS    = 15 * 60 * 1000;
const FAIL_DELAY_MS = 1000;

const failMap = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [ip, e] of failMap) {
    if (now > e.lockedUntil && now - e.windowStart > WINDOW_MS) failMap.delete(ip);
  }
}, 60 * 60 * 1000);

function getClientIp(req) {
  return req.socket?.remoteAddress ?? req.address ?? 'unknown';
}

function checkRateLimit(ip) {
  const now = Date.now();
  const e = failMap.get(ip) ?? { count: 0, windowStart: now, lockedUntil: 0 };

  if (now < e.lockedUntil) {
    return { allowed: false, remaining: Math.ceil((e.lockedUntil - now) / 1000) };
  }
  return { allowed: true };
}

function recordFailure(ip) {
  const now = Date.now();
  const e = failMap.get(ip) ?? { count: 0, windowStart: now, lockedUntil: 0 };

  if (now - e.windowStart > WINDOW_MS) {
    e.count = 0;
    e.windowStart = now;
  }
  e.count += 1;
  if (e.count >= MAX_ATTEMPTS) {
    e.lockedUntil = now + LOCKOUT_MS;
    console.warn(`[auth] IP ${ip} 잠금: ${MAX_ATTEMPTS}회 연속 실패 → ${LOCKOUT_MS / 60000}분 차단`);
  }
  failMap.set(ip, e);
}

function recordSuccess(ip) {
  failMap.delete(ip);
}

function isEnabled() {
  return PASSWORD.length > 0;
}

function makeToken(ip) {
  return crypto.createHmac('sha256', PASSWORD).update(`nambibot-auth-v1:${ip || ''}`).digest('hex');
}

function deriveSessionKey() {
  return crypto.createHmac('sha256', PASSWORD).update('nambibot-socket-enc-v1').digest('hex');
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=');
    if (idx < 0) continue;
    out[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return out;
}

function isAuthenticated(req) {
  if (!isEnabled()) return true;
  const ip = getClientIp(req);
  const cookies  = parseCookies(req.headers?.cookie);
  const provided = cookies[COOKIE_NAME] ?? '';
  const expected = makeToken(ip);
  if (provided.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}

function setAuthCookie(req, res) {
  const ip = getClientIp(req);
  const secure = isSecureRequest(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=${makeToken(ip)}; HttpOnly; SameSite=Strict; Max-Age=${MAX_AGE_SEC}; Path=/${secure}`
  );
}

function clearAuthCookie(req, res) {
  const secure = isSecureRequest(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Max-Age=0; Path=/${secure}`
  );
}

const nonceMap = new Map();
const NONCE_TTL_MS = 60_000;

function createNonce() {
  const nonce = crypto.randomBytes(32).toString('hex');
  nonceMap.set(nonce, { createdAt: Date.now() });
  return nonce;
}

function verifyChallenge(nonce, hash) {
  const entry = nonceMap.get(nonce);
  if (!entry) return false;
  nonceMap.delete(nonce);
  if (Date.now() - entry.createdAt > NONCE_TTL_MS) return false;
  const expected = crypto.createHash('sha256').update(PASSWORD + nonce).digest('hex');
  if (hash.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expected));
  } catch { return false; }
}

setInterval(() => {
  const now = Date.now();
  for (const [n, e] of nonceMap) {
    if (now - e.createdAt > NONCE_TTL_MS) nonceMap.delete(n);
  }
}, 60_000);

const PUBLIC_PATHS = new Set(['/login', '/logout', '/style.css', '/api/auth/challenge']);

function middleware(req, res, next) {
  if (!isEnabled()) return next();
  if (PUBLIC_PATHS.has(req.path)) return next();
  if (/\.(js|css|svg|png|ico|woff2?)$/i.test(req.path)) return next();
  if (!isAuthenticated(req)) return res.redirect('/login');
  next();
}

module.exports = {
  isEnabled, isAuthenticated, setAuthCookie, clearAuthCookie, middleware,
  getClientIp, checkRateLimit, recordFailure, recordSuccess, FAIL_DELAY_MS,
  COOKIE_NAME, createNonce, verifyChallenge, deriveSessionKey,
};
