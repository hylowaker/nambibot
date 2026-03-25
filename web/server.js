const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const { ChannelType, Events } = require('discord.js');
const { getState } = require('../state');
const stateBus = require('./stateBus');
const { logBus, getLogs } = require('./logBus');
const cmds = require('./commands');
const { playItem } = require('../player');
const auth = require('./auth');

const SESSION_KEY = auth.isEnabled() ? Buffer.from(auth.deriveSessionKey(), 'hex') : null;
let _encryptionEnabled = false;

function encryptPayload(data) {
  if (!_encryptionEnabled || !SESSION_KEY) return data;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', SESSION_KEY, iv);
  const json = JSON.stringify(data);
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { _enc: true, iv: iv.toString('hex'), data: encrypted.toString('base64'), tag: tag.toString('hex') };
}

const _lastQueueSnapshot = new Map();

function buildSnapshot(client, guildId) {
  const state = getState(guildId);
  const queueVersion = state._queueVersion ?? 0;

  let queueCopy;
  const cached = _lastQueueSnapshot.get(guildId);
  if (cached && cached.version === queueVersion) {
    queueCopy = cached.queueCopy;
  } else {
    queueCopy = [...state.queue];
    _lastQueueSnapshot.set(guildId, { version: queueVersion, queueCopy });
  }

  return {
    guildId,
    connected: !!state.connection,
    connectedChannelName: state.connectedChannelName ?? null,
    currentItem: state.currentItem,
    queue: queueCopy,
    playerStatus: state.player.state.status,
    playStartTs: state.playStartTs ?? null,
    pausedDuration: state.pausedDuration ?? 0,
    elapsedAtPauseMs: state._elapsedAtPause ?? null,
    downloadProgress: state.downloadProgress ?? null,
    hasAudioFile: !!state._audioFilePath,
    history: (state.history ?? []).slice(0, 30),
  };
}

function getGuildList(client) {
  return [...client.guilds.cache.values()].map(g => {
    const state = getState(g.id);
    return {
      id: g.id,
      name: g.name,
      icon: g.iconURL({ size: 64, extension: 'webp' }) ?? null,
      connected: !!state.connection,
    };
  });
}

function getVoiceChannels(client, guildId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return [];
  return [...guild.channels.cache.values()]
    .filter(c => c.type === ChannelType.GuildVoice)
    .sort((a, b) => a.position - b.position)
    .map(c => ({ id: c.id, name: c.name, memberCount: c.members.size }));
}

const SNOWFLAKE_RE = /^\d{17,20}$/;

function validateGuild(client, guildId) {
  if (typeof guildId !== 'string' || !SNOWFLAKE_RE.test(guildId)) return false;
  return client.guilds.cache.has(guildId);
}

function validateIndex(index, max) {
  return Number.isInteger(index) && index >= 0 && index < max;
}

function validateUrl(url) {
  if (typeof url !== 'string') return false;
  return url.startsWith('http://') || url.startsWith('https://');
}

function sanitizeErrorMessage(msg) {
  if (typeof msg !== 'string') return '오류가 발생했습니다.';
  const firstLine = msg.split('\n')[0];
  return firstLine.replace(/(?:[A-Za-z]:)?[/\\][\w./\\-]+/g, '[path]').slice(0, 200);
}

function start(client) {
  const app = express();
  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    maxHttpBufferSize: 1e6,
    pingTimeout: 30000,
  });

  app.use(express.json());

  app.get('/api/bot-profile', (req, res) => {
    if (!client.user) return res.json({ username: null, avatar: null });
    res.json({
      username: client.user.displayName ?? client.user.username,
      avatar: client.user.displayAvatarURL({ size: 64, extension: 'webp' }),
    });
  });

  app.use(auth.middleware);

  app.get('/login', (req, res, next) => {
    if (auth.isAuthenticated(req)) return res.redirect('/');
    next();
  });
  app.get('/api/auth/challenge', (req, res) => {
    res.json({ nonce: auth.createNonce() });
  });
  app.post('/login', async (req, res) => {
    const ip = auth.getClientIp(req);
    const forwarded = req.headers['x-forwarded-for'];
    const ipLog = ip + (forwarded ? `  x-forwarded-for: ${forwarded}` : '');

    const { allowed, remaining } = auth.checkRateLimit(ip);
    if (!allowed) {
      console.warn(`[auth] 로그인 차단 (잠금 중)  IP: ${ipLog}  잔여: ${remaining}초`);
      return res.status(429).json({ error: `Too many attempts. Try again in ${remaining}s.` });
    }

    const { nonce, hash, password } = req.body ?? {};

    let ok = false;
    if (nonce && hash) {
      ok = auth.verifyChallenge(nonce, hash);
    } else if (password) {
      ok = !auth.isEnabled() || password === process.env.WEB_PASSWORD;
    }

    if (!auth.isEnabled() || ok) {
      auth.recordSuccess(ip);
      auth.setAuthCookie(req, res);
      console.log(`[auth] 로그인 성공  IP: ${ipLog}${nonce ? '  (challenge-response)' : ''}`);
      const sessionKey = auth.isEnabled() ? auth.deriveSessionKey() : null;
      return res.json({ redirect: '/', sessionKey });
    }

    auth.recordFailure(ip);
    await new Promise(r => setTimeout(r, auth.FAIL_DELAY_MS));
    console.warn(`[auth] 로그인 실패  IP: ${ipLog}`);
    res.status(401).json({ error: 'Unauthorized' });
  });
  app.get('/logout', (req, res) => {
    auth.clearAuthCookie(req, res);
    res.redirect('/login');
  });

  app.get('/api/stream/:guildId', (req, res) => {
    const state = getState(req.params.guildId);
    const filePath = state._audioFilePath;
    if (!filePath) {
      return res.status(404).json({ error: 'No audio available' });
    }
    try {
      const stat = fs.statSync(filePath);
      res.setHeader('Content-Type', 'audio/ogg');
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'no-cache');

      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < 0 || start > end || end >= stat.size) {
          res.status(416);
          res.setHeader('Content-Range', `bytes */${stat.size}`);
          return res.end();
        }
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
        res.setHeader('Content-Length', end - start + 1);
        fs.createReadStream(filePath, { start, end }).pipe(res);
      } else {
        fs.createReadStream(filePath).pipe(res);
      }
    } catch {
      res.status(404).json({ error: 'Audio file not found' });
    }
  });

  const minifyCache = new Map();
  let terserModule = null;
  try { terserModule = require('terser'); } catch {}

  if (terserModule) {
    const publicDir = path.join(__dirname, 'public');
    app.get(/\.js$/, async (req, res, next) => {
      const filePath = path.join(publicDir, req.path);
      if (!filePath.startsWith(publicDir)) return next();
      try {
        const stat = fs.statSync(filePath);
        const cached = minifyCache.get(filePath);
        if (cached && cached.mtime === stat.mtimeMs) {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          return res.send(cached.content);
        }
        const source = fs.readFileSync(filePath, 'utf8');
        const result = await terserModule.minify(source, {
          compress: { drop_console: false, passes: 2 },
          mangle: { toplevel: false },
          format: { comments: false },
        });
        if (result.code) {
          minifyCache.set(filePath, { mtime: stat.mtimeMs, content: result.code });
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          return res.send(result.code);
        }
        next();
      } catch {
        next();
      }
    });
    console.log('[web] JS 난독화(minify) 활성화');
  }

  let htmlMinifier = null;
  try { htmlMinifier = require('html-minifier-terser'); } catch {}

  if (htmlMinifier) {
    const publicDir = path.join(__dirname, 'public');
    const htmlCache = new Map();
    app.get(/\.html$|^\/$|^\/login$|^\/logs$/, async (req, res, next) => {
      let htmlPath;
      if (req.path === '/' || req.path === '/index.html') {
        htmlPath = path.join(publicDir, 'index.html');
      } else if (req.path === '/login') {
        htmlPath = path.join(publicDir, 'login.html');
      } else if (req.path === '/logs') {
        htmlPath = path.join(publicDir, 'logs.html');
      } else {
        htmlPath = path.join(publicDir, req.path);
      }
      if (!htmlPath.startsWith(publicDir)) return next();
      try {
        const stat = fs.statSync(htmlPath);
        const cached = htmlCache.get(htmlPath);
        if (cached && cached.mtime === stat.mtimeMs) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          return res.send(cached.content);
        }
        const source = fs.readFileSync(htmlPath, 'utf8');
        const minified = await htmlMinifier.minify(source, {
          collapseWhitespace: true,
          removeComments: true,
          minifyCSS: true,
          minifyJS: terserModule ? { compress: { drop_console: false }, mangle: true } : true,
          removeRedundantAttributes: true,
          removeEmptyAttributes: true,
        });
        htmlCache.set(htmlPath, { mtime: stat.mtimeMs, content: minified });
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(minified);
      } catch {
        next();
      }
    });
    console.log('[web] HTML 난독화(minify) 활성화');
  }

  app.use(express.static(path.join(__dirname, 'public')));
  if (!htmlMinifier) {
    app.get('/logs', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'logs.html'));
    });
  }

  io.use((socket, next) => {
    if (!auth.isEnabled()) return next();
    if (auth.isAuthenticated(socket.handshake)) return next();
    next(new Error('Unauthorized'));
  });

  logBus.on('log', (entry) => {
    io.to('logs').emit('log', encryptPayload(entry));
  });

  const _stateTimers = new Map();
  stateBus.on('stateChanged', (guildId) => {
    if (_stateTimers.has(guildId)) clearTimeout(_stateTimers.get(guildId));
    _stateTimers.set(guildId, setTimeout(() => {
      _stateTimers.delete(guildId);
      io.to(guildId).emit('state', encryptPayload(buildSnapshot(client, guildId)));
    }, 100));
  });

  stateBus.on('notice', (guildId, message) => {
    io.to(guildId).emit('notice', { message });
  });

  stateBus.on('uiAction', (guildId, action) => {
    io.to(guildId).emit('uiAction', { action });
  });

  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    const guildId = newState.guild?.id ?? oldState.guild?.id;
    if (!guildId) return;
    io.to(guildId).emit('channels', getVoiceChannels(client, guildId));
  });

  io.on('connection', (socket) => {
    const ip = socket.handshake.address;
    const forwarded = socket.handshake.headers['x-forwarded-for'];
    const ipLog = ip + (forwarded ? `  x-forwarded-for: ${forwarded}` : '');
    console.log(`[web] 소켓 연결: ${socket.id}  IP: ${ipLog}`);
    socket.on('disconnect', (reason) => {
      clearTimeout(_rlResetTimer);
      console.log(`[web] 소켓 해제: ${socket.id}  사유: ${reason}`);
    });

    let _rlCount = 0;
    let _rlResetTimer = null;
    function checkSocketRateLimit() {
      if (!_rlResetTimer) {
        _rlResetTimer = setTimeout(() => { _rlCount = 0; _rlResetTimer = null; }, 10000);
      }
      _rlCount++;
      if (_rlCount > 30) {
        socket.emit('cmdError', { message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' });
        return false;
      }
      return true;
    }

    function requireGuild(guildId) {
      if (!validateGuild(client, guildId)) {
        socket.emit('cmdError', { message: '유효하지 않은 서버입니다.' });
        return false;
      }
      return true;
    }

    const rawIp = (forwarded || ip || '').replace(/^::ffff:/, '');
    const userLabel = rawIp.includes(':')
      ? rawIp.split(':').pop().slice(-4)
      : rawIp.split('.').slice(-2).join('.');

    function userLog(action, guildId, detail) {
      const guildName = guildId ? (client.guilds.cache.get(guildId)?.name ?? guildId) : '';
      const guildStr = guildName ? `  [${guildName}]` : '';
      const detailStr = detail ? `  ${detail}` : '';
      console.log(`[web] ${ipLog}${guildStr}  →  ${action}${detailStr}`);
    }

    function broadcast(guildId, message, uiAction) {
      io.to(guildId).emit('notice', { message: `🎧 ${rawIp || '?'} · ${message}` });
      if (uiAction) io.to(guildId).emit('uiAction', { action: uiAction });
    }

    socket.on('subscribe', ({ guildId }) => {
      if (!validateGuild(client, guildId)) return;
      socket.join(guildId);
      const guildName = client.guilds.cache.get(guildId)?.name ?? guildId;
      console.log(`[web] ${socket.id} → 서버 구독: ${guildName}`);
      socket.emit('state', encryptPayload(buildSnapshot(client, guildId)));
    });

    function buildSysInfo() {
      const cpus = os.cpus();
      const mem  = process.memoryUsage();
      const nets = os.networkInterfaces();
      const ips  = [];
      Object.entries(nets).forEach(([iface, addrs]) => {
        addrs.filter(a => !a.internal).forEach(a => {
          ips.push({ iface, address: a.address, family: a.family });
        });
      });
      return {
        nodeVersion: process.version,
        pid: process.pid,
        nodeEnv: process.env.NODE_ENV || '미설정',
        processStartTs: Date.now() - Math.floor(process.uptime() * 1000),
        memRss: mem.rss,
        memHeapUsed: mem.heapUsed,
        memHeapTotal: mem.heapTotal,
        memExternal: mem.external,
        platform: os.platform(),
        arch: os.arch(),
        osRelease: os.release(),
        hostname: os.hostname(),
        sysUptime: os.uptime(),
        cpu: cpus.length > 0 ? cpus[0].model.trim() : '알 수 없음',
        cpuCores: cpus.length,
        loadAvg: os.loadavg(),
        totalMem: os.totalmem(),
        freeMem: os.freemem(),
        ips,
        envVars: Object.entries(process.env)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, /TOKEN|SECRET|PASSWORD|PASSPHRASE|KEY|PRIVATE|CREDENTIAL|CERT|AUTH|DATABASE|URL|DSN|MONGO|REDIS|MYSQL|POSTGRES/i.test(k) ? '••••••' : v]),
      };
    }

    socket.on('cmd:subscribeLogs', () => {
      socket.join('logs');
      socket.emit('logHistory', encryptPayload(getLogs()));
      socket.emit('sysInfo', encryptPayload(buildSysInfo()));
      if (client.user) {
        socket.emit('botProfile', {
          username: client.user.displayName ?? client.user.username,
          avatar: client.user.displayAvatarURL({ size: 64, extension: 'webp' }),
        });
      }
    });

    socket.on('cmd:getSysInfo', () => {
      socket.emit('sysInfo', encryptPayload(buildSysInfo()));
    });

    socket.on('cmd:listGuilds', () => {
      socket.emit('guilds', getGuildList(client));
      socket.emit('botProfile', {
        username: client.user.displayName ?? client.user.username,
        avatar: client.user.displayAvatarURL({ size: 64, extension: 'webp' }),
      });
      try {
        const pkg = require('../package.json');
        let imageTag = null;
        try { imageTag = fs.readFileSync(path.join(__dirname, '..', '.image-tag'), 'utf8').trim(); } catch {}
        socket.emit('buildInfo', { version: pkg.version, build: imageTag });
      } catch {}
    });

    socket.on('cmd:listChannels', ({ guildId }) => {
      if (!requireGuild(guildId)) return;
      socket.emit('channels', getVoiceChannels(client, guildId));
    });

    async function handle(fn) {
      try {
        return await fn();
      } catch (err) {
        console.error(`[web] ${ipLog}  →  오류: ${err.message}`);
        socket.emit('cmdError', { message: sanitizeErrorMessage(err.message) });
      }
    }

    socket.on('cmd:queue', ({ guildId, url }) => {
      if (!checkSocketRateLimit()) return;
      if (!requireGuild(guildId)) return;
      if (!validateUrl(url)) { socket.emit('cmdError', { message: '유효하지 않은 URL입니다.' }); return; }
      userLog('대기열 추가', guildId, url);
      broadcast(guildId, `대기열에 추가 중...`);
      handle(async () => {
        await cmds.queue(client, guildId, url, (progress) =>
          socket.emit('queueProgress', { guildId, ...progress })
        );
        const state = getState(guildId);
        broadcast(guildId, `대기열에 추가 완료 (${state.queue.length}곡)`);
      });
    });
    socket.on('cmd:playNow', ({ guildId, url }) => {
      if (!checkSocketRateLimit()) return;
      if (!requireGuild(guildId)) return;
      if (!validateUrl(url)) { socket.emit('cmdError', { message: '유효하지 않은 URL입니다.' }); return; }
      userLog('바로 재생', guildId, url);
      broadcast(guildId, `바로 재생 준비 중...`);
      handle(async () => {
        await cmds.playNow(client, guildId, url, (progress) =>
          socket.emit('queueProgress', { guildId, ...progress })
        );
        const state = getState(guildId);
        const title = state.currentItem?.title ?? '알 수 없음';
        const queueCount = state.queue.length;
        broadcast(guildId, queueCount > 0
          ? `바로 재생: "${title}" + 대기열에 ${queueCount}곡 추가`
          : `바로 재생: "${title}"`);
      });
    });
    socket.on('cmd:play', ({ guildId, index }) => {
      if (!checkSocketRateLimit()) return;
      if (!requireGuild(guildId)) return;
      if (!Number.isInteger(index) || index < 1) { socket.emit('cmdError', { message: '유효하지 않은 인덱스입니다.' }); return; }
      const state = getState(guildId);
      const itemTitle = state.queue[index - 1]?.title ?? `#${index}`;
      userLog('재생', guildId, `#${index} "${itemTitle}"`);
      handle(async () => {
        const notice = await cmds.play(client, guildId, index);
        broadcast(guildId, `재생: "${itemTitle}"`);
      });
    });
    socket.on('cmd:pause', ({ guildId }) => {
      if (!checkSocketRateLimit()) return;
      if (!requireGuild(guildId)) return;
      userLog('일시정지', guildId);
      handle(() => {
        cmds.pause(client, guildId);
        broadcast(guildId, '일시정지');
      });
    });
    socket.on('cmd:resume', ({ guildId }) => {
      if (!checkSocketRateLimit()) return;
      if (!requireGuild(guildId)) return;
      userLog('재개', guildId);
      handle(() => {
        cmds.resume(client, guildId);
        broadcast(guildId, '재개');
      });
    });
    socket.on('cmd:seek', ({ guildId, seconds }) => {
      if (!checkSocketRateLimit()) return;
      if (!requireGuild(guildId)) return;
      if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) { socket.emit('cmdError', { message: '유효하지 않은 탐색 위치입니다.' }); return; }
      const timeStr = `${Math.floor(seconds / 60)}:${String(Math.floor(seconds) % 60).padStart(2, '0')}`;
      userLog('탐색', guildId, timeStr);
      handle(() => {
        cmds.seek(client, guildId, seconds);
        broadcast(guildId, `${timeStr}(으)로 이동`);
      });
    });
    socket.on('cmd:deleteCurrent', ({ guildId }) => {
      if (!checkSocketRateLimit()) return;
      if (!requireGuild(guildId)) return;
      const state = getState(guildId);
      const title = state.currentItem?.title ?? '알 수 없음';
      userLog('삭제', guildId, `"${title}"`);
      handle(() => {
        cmds.deleteCurrent(client, guildId);
        broadcast(guildId, `삭제: "${title}"`);
      });
    });
    socket.on('cmd:skip', ({ guildId }) => {
      if (!checkSocketRateLimit()) return;
      if (!requireGuild(guildId)) return;
      const state = getState(guildId);
      const title = state.currentItem?.title ?? '알 수 없음';
      userLog('스킵', guildId, `"${title}"`);
      broadcast(guildId, `스킵: "${title}"`);
      handle(() => cmds.skip(client, guildId));
    });
    socket.on('cmd:reorder', ({ guildId, fromIndex, toIndex }) => {
      if (!checkSocketRateLimit()) return;
      if (!requireGuild(guildId)) return;
      const state = getState(guildId);
      if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex) || fromIndex < 0 || toIndex < 0 || fromIndex >= state.queue.length || toIndex >= state.queue.length) { socket.emit('cmdError', { message: '유효하지 않은 인덱스입니다.' }); return; }
      const itemTitle = state.queue[fromIndex]?.title ?? `#${fromIndex + 1}`;
      userLog('순서 변경', guildId, `#${fromIndex + 1} → #${toIndex + 1} "${itemTitle}"`);
      handle(() => {
        cmds.reorder(client, guildId, fromIndex, toIndex);
        broadcast(guildId, `순서 변경: "${itemTitle}" #${fromIndex + 1} → #${toIndex + 1}`);
      });
    });
    socket.on('cmd:delete', ({ guildId, index }) => {
      if (!checkSocketRateLimit()) return;
      if (!requireGuild(guildId)) return;
      if (!Number.isInteger(index) || index < 1) { socket.emit('cmdError', { message: '유효하지 않은 인덱스입니다.' }); return; }
      const state = getState(guildId);
      const itemTitle = state.queue[index - 1]?.title ?? `#${index}`;
      userLog('대기열 삭제', guildId, `#${index} "${itemTitle}"`);
      handle(() => {
        cmds.del(client, guildId, index);
        broadcast(guildId, `대기열 삭제: "${itemTitle}"`);
      });
    });
    socket.on('cmd:shuffle', ({ guildId }) => {
      if (!checkSocketRateLimit()) return;
      if (!requireGuild(guildId)) return;
      const state = getState(guildId);
      userLog('대기열 섞기', guildId, `${state.queue.length}곡`);
      handle(() => {
        cmds.shuffle(client, guildId);
        broadcast(guildId, `대기열 섞기 (${state.queue.length}곡)`, 'shuffle');
      });
    });
    socket.on('cmd:dedupe', ({ guildId }) => {
      if (!checkSocketRateLimit()) return;
      if (!requireGuild(guildId)) return;
      const state = getState(guildId);
      const before = state.queue.length;
      userLog('중복 제거', guildId, `${before}곡`);
      handle(() => {
        cmds.dedupe(client, guildId);
        const after = getState(guildId).queue.length;
        const removed = before - after;
        broadcast(guildId, removed > 0 ? `중복 제거: ${removed}곡 삭제됨` : '중복 없음', 'dedupe');
      });
    });
    socket.on('cmd:purge', ({ guildId }) => {
      if (!checkSocketRateLimit()) return;
      if (!requireGuild(guildId)) return;
      const state = getState(guildId);
      const count = state.queue.length;
      userLog('대기열 전체 삭제', guildId, `${count}곡`);
      handle(() => {
        cmds.purge(client, guildId);
        broadcast(guildId, `대기열 전체 삭제 (${count}곡)`, 'purge');
      });
    });
    socket.on('cmd:join', ({ guildId, channelName }) => {
      if (!checkSocketRateLimit()) return;
      if (!requireGuild(guildId)) return;
      userLog('음성 채널 참가', guildId, channelName);
      handle(async () => {
        await cmds.join(client, guildId, channelName);
        broadcast(guildId, `음성 채널 참가: ${channelName}`);
      });
    });
    socket.on('cmd:leave', ({ guildId }) => {
      if (!checkSocketRateLimit()) return;
      if (!requireGuild(guildId)) return;
      const state = getState(guildId);
      const ch = state.connectedChannelName ?? '';
      userLog('음성 채널 퇴장', guildId, ch);
      handle(() => {
        cmds.leave(client, guildId);
        broadcast(guildId, '음성 채널 퇴장');
      });
    });

    socket.on('cmd:migrateState', ({ fromGuildId, toGuildId }) => {
      if (!checkSocketRateLimit()) return;
      if (!requireGuild(fromGuildId) || !requireGuild(toGuildId)) return;
      handle(() => {
      if (!fromGuildId || !toGuildId || fromGuildId === toGuildId) return;
      const from = getState(fromGuildId);
      const to = getState(toGuildId);

      if (from.queue.length > 0) {
        to.queue.push(...from.queue);
        from.queue = [];
      }

      if (from.history.length > 0) {
        const urls = new Set(to.history.map(h => h.url));
        const newItems = from.history.filter(h => !urls.has(h.url));
        to.history = [...newItems, ...to.history].slice(0, 20);
        from.history = [];
      }

      if (from.currentItem) {
        if (from.playStartTs) {
          to.queue.unshift(from.currentItem);
          from._stopRequested = true;
          from.player.stop();
          from.currentItem = null;
          from.playStartTs = null;
          from.pausedDuration = 0;
          from._pauseStartTs = null;
          from._elapsedAtPause = null;
          from.downloadProgress = null;
        }
      }

      from._queueVersion = (from._queueVersion ?? 0) + 1;
      to._queueVersion = (to._queueVersion ?? 0) + 1;
      userLog(`상태 이관: ${fromGuildId} → ${toGuildId}`, toGuildId);
      stateBus.emit('stateChanged', fromGuildId);
      stateBus.emit('stateChanged', toGuildId);
    });
    });

    socket.on('cmd:appendItems', ({ guildId, items }) => {
      if (!checkSocketRateLimit()) return;
      if (!requireGuild(guildId)) return;
      handle(async () => {
      if (!Array.isArray(items) || !items.length) throw new Error('유효한 항목이 없습니다.');
      if (items.length > 500) throw new Error('한 번에 최대 500곡까지만 추가할 수 있습니다.');
      const itemTitles = items.slice(0, 3).map(i => i.title).join(', ');
      userLog('대기열 추가 (히스토리/플레이리스트)', guildId, `${items.length}곡 — ${itemTitles}`);
      const sanitized = items
        .filter(it => it && typeof it.title === 'string' && typeof it.url === 'string'
          && (it.url.startsWith('http://') || it.url.startsWith('https://')))
        .map(it => ({
          title: String(it.title).slice(0, 200),
          url: String(it.url).slice(0, 500),
          uploader: it.uploader ? String(it.uploader).slice(0, 100) : null,
          duration: (typeof it.duration === 'number' && it.duration > 0) ? Math.floor(it.duration) : null,
          thumbnail: it.thumbnail ? String(it.thumbnail).slice(0, 500) : null,
        }));
      if (!sanitized.length) throw new Error('유효한 항목이 없습니다.');
      const state = getState(guildId);
      const { initPlayer, prefetchNext, cleanupPrefetch } = require('../player');
      initPlayer(guildId);
      state.queue.push(...sanitized);
      state._queueVersion = (state._queueVersion ?? 0) + 1;
      if (state.currentItem && !state._prefetchedUrl && state.queue[0]) {
        const { prefetchNext } = require('../player');
        prefetchNext(state);
      }
      stateBus.emit('stateChanged', guildId);
      broadcast(guildId, `대기열에 ${sanitized.length}곡 추가`);
    });
    });
  });

  const port = process.env.WEB_PORT || 3000;
  const listenUrl = `http://localhost:${port}`;
  const publicUrl = process.env.WEB_UI_URL || listenUrl;
  _encryptionEnabled = publicUrl.startsWith('https://');

  httpServer.listen(port, () => {
    if (publicUrl !== listenUrl) {
      console.log(`[web] Web UI 시작: ${publicUrl}  (listen: ${listenUrl})`);
    } else {
      console.log(`[web] Web UI 시작: ${listenUrl}`);
    }
    if (auth.isEnabled()) {
      console.log('[auth] 비밀번호 인증 활성화됨');
    } else {
      console.warn('[auth] WEB_PASSWORD 미설정 — 인증 없이 접근 가능');
    }
    if (_encryptionEnabled) {
      console.log('[web] 소켓 메시지 암호화 활성화 (AES-256-GCM)');
    } else {
      console.warn('[web] 소켓 메시지 암호화 비활성화 (HTTP 환경)');
    }
  });

}

module.exports = { start };
