const crypto = require('crypto');

const PASSWORD    = process.env.WEB_PASSWORD || '';
const COOKIE_NAME = 'nambi_sess';
const MAX_AGE_SEC = 30 * 24 * 60 * 60; // 30일

function isSecureRequest(req) {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

// ── 브루트포스 방어 ──────────────────────────────────────────
const MAX_ATTEMPTS  = 10;
const WINDOW_MS     = 10 * 60 * 1000; // 10분 내 실패 카운트 윈도우
const LOCKOUT_MS    = 15 * 60 * 1000; // 잠금 지속 시간
const FAIL_DELAY_MS = 1000;            // 실패 시 응답 딜레이 (브루트포스 속도 저하)

const failMap = new Map(); // ip → { count, windowStart, lockedUntil }

// 오래된 항목 주기적 정리 (메모리 누수 방지)
setInterval(() => {
  const now = Date.now();
  for (const [ip, e] of failMap) {
    if (now > e.lockedUntil && now - e.windowStart > WINDOW_MS) failMap.delete(ip);
  }
}, 60 * 60 * 1000);

/**
 * 보안 결정에 사용할 IP — X-Forwarded-For는 스푸핑 가능하므로 socket 주소만 사용
 */
function getClientIp(req) {
  return req.socket?.remoteAddress ?? 'unknown';
}

/**
 * 요청 허용 여부 확인. 잠금 중이면 { allowed: false, remaining } 반환.
 */
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

// ── 핵심 인증 로직 ────────────────────────────────────────────

function isEnabled() {
  return PASSWORD.length > 0;
}

/** 비밀번호 기반 결정론적 토큰 — 서버 재시작 후에도 쿠키 유효 */
function makeToken() {
  return crypto.createHmac('sha256', PASSWORD).update('nambibot-auth-v1').digest('hex');
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
  const cookies  = parseCookies(req.headers?.cookie);
  const provided = cookies[COOKIE_NAME] ?? '';
  const expected = makeToken();
  // 길이 다르면 즉시 false (timingSafeEqual은 동일 길이 필요)
  if (provided.length !== expected.length) return false;
  try {
    // 타이밍 어택 방지: 상수 시간 비교
    return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}

function setAuthCookie(req, res) {
  const secure = isSecureRequest(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=${makeToken()}; HttpOnly; SameSite=Strict; Max-Age=${MAX_AGE_SEC}; Path=/${secure}`
  );
}

function clearAuthCookie(req, res) {
  const secure = isSecureRequest(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Max-Age=0; Path=/${secure}`
  );
}

const PUBLIC_PATHS = new Set(['/login', '/logout', '/style.css']);

function middleware(req, res, next) {
  if (!isEnabled()) return next();
  if (PUBLIC_PATHS.has(req.path)) return next();
  if (!isAuthenticated(req)) return res.redirect('/login');
  next();
}

module.exports = {
  isEnabled, isAuthenticated, setAuthCookie, clearAuthCookie, middleware,
  getClientIp, checkRateLimit, recordFailure, recordSuccess, FAIL_DELAY_MS,
  COOKIE_NAME,
};
