const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');
const { ChannelType, Events } = require('discord.js');
const { getState } = require('../state');
const stateBus = require('./stateBus');
const { logBus, getLogs } = require('./logBus');
const cmds = require('./commands');
const { playItem } = require('../player');
const auth = require('./auth');

function buildSnapshot(client, guildId) {
  const state = getState(guildId);
  return {
    guildId,
    connected: !!state.connection,
    connectedChannelName: state.connectedChannelName ?? null,
    currentItem: state.currentItem,
    queue: [...state.queue],
    playerStatus: state.player.state.status,
    playStartTs: state.playStartTs ?? null,
    downloadProgress: state.downloadProgress ?? null,
    history: (state.history ?? []).slice(0, 30),
  };
}

function getGuildList(client) {
  return [...client.guilds.cache.values()].map(g => ({
    id: g.id,
    name: g.name,
    icon: g.iconURL({ size: 64, extension: 'webp' }) ?? null,
  }));
}

function getVoiceChannels(client, guildId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return [];
  return [...guild.channels.cache.values()]
    .filter(c => c.type === ChannelType.GuildVoice)
    .sort((a, b) => a.position - b.position)
    .map(c => ({ id: c.id, name: c.name, memberCount: c.members.size }));
}

function start(client) {
  const app = express();
  const httpServer = http.createServer(app);
  const io = new Server(httpServer);

  app.use(express.json());

  // Public: bot profile (auth 불필요 — 로그인 페이지에서 사용)
  app.get('/api/bot-profile', (req, res) => {
    if (!client.user) return res.json({ username: null, avatar: null });
    res.json({
      username: client.user.displayName ?? client.user.username,
      avatar: client.user.displayAvatarURL({ size: 64, extension: 'webp' }),
    });
  });

  app.use(auth.middleware);

  // Auth routes
  app.get('/login', (req, res) => {
    if (auth.isAuthenticated(req)) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
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

    const { password } = req.body ?? {};
    if (!auth.isEnabled() || password === process.env.WEB_PASSWORD) {
      auth.recordSuccess(ip);
      auth.setAuthCookie(req, res);
      console.log(`[auth] 로그인 성공  IP: ${ipLog}`);
      return res.json({ redirect: '/' });
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

  app.use(express.static(path.join(__dirname, 'public')));
  app.get('/logs', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'logs.html'));
  });

  // Socket.io auth middleware
  io.use((socket, next) => {
    if (!auth.isEnabled()) return next();
    if (auth.isAuthenticated(socket.handshake)) return next();
    next(new Error('Unauthorized'));
  });

  logBus.on('log', (entry) => {
    io.to('logs').emit('log', entry);
  });

  stateBus.on('stateChanged', (guildId) => {
    io.to(guildId).emit('state', buildSnapshot(client, guildId));
    io.to(guildId).emit('channels', getVoiceChannels(client, guildId));
  });

  // 유저가 음성 채널 입/퇴장 시 인원수 실시간 갱신
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
      console.log(`[web] 소켓 해제: ${socket.id}  사유: ${reason}`);
    });

    function userLog(action, guildId) {
      const guildName = guildId ? (client.guilds.cache.get(guildId)?.name ?? guildId) : '';
      const guildStr = guildName ? `  [${guildName}]` : '';
      console.log(`[web] ${ipLog}${guildStr}  →  ${action}`);
    }

    socket.on('subscribe', ({ guildId }) => {
      socket.join(guildId);
      const guildName = client.guilds.cache.get(guildId)?.name ?? guildId;
      console.log(`[web] ${socket.id} → 서버 구독: ${guildName}`);
      socket.emit('state', buildSnapshot(client, guildId));
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
        // 런타임
        nodeVersion: process.version,
        pid: process.pid,
        nodeEnv: process.env.NODE_ENV || '미설정',
        processStartTs: Date.now() - Math.floor(process.uptime() * 1000),
        // 프로세스 메모리
        memRss: mem.rss,
        memHeapUsed: mem.heapUsed,
        memHeapTotal: mem.heapTotal,
        memExternal: mem.external,
        // 시스템
        platform: os.platform(),
        arch: os.arch(),
        osRelease: os.release(),
        hostname: os.hostname(),
        sysUptime: os.uptime(),
        // CPU
        cpu: cpus.length > 0 ? cpus[0].model.trim() : '알 수 없음',
        cpuCores: cpus.length,
        loadAvg: os.loadavg(),
        // 시스템 메모리
        totalMem: os.totalmem(),
        freeMem: os.freemem(),
        // 네트워크
        ips,
        // 환경 변수 (민감한 키는 마스킹)
        envVars: Object.entries(process.env)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, /TOKEN|SECRET|PASSWORD|KEY|PRIVATE|CREDENTIAL|CERT|AUTH/i.test(k) ? '••••••' : v]),
      };
    }

    socket.on('cmd:subscribeLogs', () => {
      socket.join('logs');
      socket.emit('logHistory', getLogs());
      socket.emit('sysInfo', buildSysInfo());
      if (client.user) {
        socket.emit('botProfile', {
          username: client.user.displayName ?? client.user.username,
          avatar: client.user.displayAvatarURL({ size: 64, extension: 'webp' }),
        });
      }
    });

    socket.on('cmd:getSysInfo', () => {
      socket.emit('sysInfo', buildSysInfo());
    });

    socket.on('cmd:listGuilds', () => {
      socket.emit('guilds', getGuildList(client));
      socket.emit('botProfile', {
        username: client.user.displayName ?? client.user.username,
        avatar: client.user.displayAvatarURL({ size: 64, extension: 'webp' }),
      });
    });

    socket.on('cmd:listChannels', ({ guildId }) => {
      socket.emit('channels', getVoiceChannels(client, guildId));
    });

    async function handle(fn) {
      try {
        return await fn();
      } catch (err) {
        console.error(`[web] ${ipLog}  →  오류: ${err.message}`);
        socket.emit('cmdError', { message: err.message });
      }
    }

    socket.on('cmd:queue', ({ guildId, url }) => {
      userLog(`URL 추가: ${url}`, guildId);
      handle(() =>
        cmds.queue(client, guildId, url, (progress) =>
          socket.emit('queueProgress', { guildId, ...progress })
        )
      );
    });
    socket.on('cmd:play', ({ guildId, index }) => {
      userLog(`재생: 대기열 #${index + 1}`, guildId);
      handle(async () => {
        const notice = await cmds.play(client, guildId, index);
        if (notice) socket.emit('notice', { message: notice });
      });
    });
    socket.on('cmd:pause', ({ guildId }) => {
      userLog('일시정지', guildId);
      handle(() => cmds.pause(client, guildId));
    });
    socket.on('cmd:resume', ({ guildId }) => {
      userLog('재개', guildId);
      handle(() => cmds.resume(client, guildId));
    });
    socket.on('cmd:deleteCurrent', ({ guildId }) => {
      userLog('현재 곡 삭제', guildId);
      handle(() => cmds.deleteCurrent(client, guildId));
    });
    socket.on('cmd:skip', ({ guildId }) => {
      userLog('스킵', guildId);
      handle(async () => {
        const title = await cmds.skip(client, guildId);
        socket.emit('notice', { message: `"${title}" 이(가) 대기열 맨 아래로 이동했습니다.` });
      });
    });
    socket.on('cmd:reorder', ({ guildId, fromIndex, toIndex }) => {
      userLog(`순서 변경: #${fromIndex + 1} → #${toIndex + 1}`, guildId);
      handle(() => cmds.reorder(client, guildId, fromIndex, toIndex));
    });
    socket.on('cmd:delete', ({ guildId, index }) => {
      userLog(`대기열 삭제: #${index + 1}`, guildId);
      handle(() => cmds.del(client, guildId, index));
    });
    socket.on('cmd:shuffle', ({ guildId }) => {
      userLog('대기열 섞기', guildId);
      handle(() => cmds.shuffle(client, guildId));
    });
    socket.on('cmd:dedupe', ({ guildId }) => {
      userLog('중복 제거', guildId);
      handle(() => cmds.dedupe(client, guildId));
    });
    socket.on('cmd:purge', ({ guildId }) => {
      userLog('대기열 전체 삭제', guildId);
      handle(() => cmds.purge(client, guildId));
    });
    socket.on('cmd:join', ({ guildId, channelName }) => {
      userLog(`음성 채널 참가: ${channelName}`, guildId);
      handle(() => cmds.join(client, guildId, channelName));
    });
    socket.on('cmd:leave', ({ guildId }) => {
      userLog('음성 채널 퇴장', guildId);
      handle(() => cmds.leave(client, guildId));
    });

    socket.on('cmd:appendItems', ({ guildId, items }) => handle(async () => {
      if (!Array.isArray(items) || !items.length) throw new Error('유효한 항목이 없습니다.');
      userLog(`히스토리에서 ${items.length}곡 추가`, guildId);
      const sanitized = items
        .filter(it => it && typeof it.title === 'string' && typeof it.url === 'string')
        .map(it => ({
          title: String(it.title).slice(0, 200),
          url: String(it.url).slice(0, 500),
          uploader: it.uploader ? String(it.uploader).slice(0, 100) : null,
          duration: (typeof it.duration === 'number' && it.duration > 0) ? Math.floor(it.duration) : null,
        }));
      if (!sanitized.length) throw new Error('유효한 항목이 없습니다.');
      const state = getState(guildId);
      const shouldAutoPlay = state.connection && state.queue.length === 0 && !state.currentItem;
      state.queue.push(...sanitized);
      stateBus.emit('stateChanged', guildId);
      socket.emit('notice', { message: `${sanitized.length}곡 추가됨` });
      if (shouldAutoPlay) {
        const item = state.queue.shift();
        await playItem(state, item);
      }
    }));
  });

  const port = process.env.WEB_PORT || 3000;
  httpServer.listen(port, () => {
    console.log(`[web] Web UI 시작: http://localhost:${port}`);
    if (auth.isEnabled()) {
      console.log('[auth] 비밀번호 인증 활성화됨');
    } else {
      console.warn('[auth] WEB_PASSWORD 미설정 — 인증 없이 접근 가능');
    }
  });

}

module.exports = { start };
