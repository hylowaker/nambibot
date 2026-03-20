require('./web/logInterceptor'); // console 패치 — 가장 먼저 로드
const { Client, Events, GatewayIntentBits, MessageFlags } = require('discord.js');
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { getState, getAllStates, clearState } = require('./state');
const stateBus = require('./web/stateBus');
const persistence = require('./persistence');

const devPrefix = (process.env.DEVELOPE_PREFIX === 'ON' || process.env.DEVELOPE_PREFIX === '1') ? 'dev-' : '';
const CMD_MUSIC = `${devPrefix}music`;
const CMD_VERSION = `${devPrefix}version`;

// Music subcommand handlers
const musicHandlers = {
  help:   require('./handler/music/help'),
  join:   require('./handler/music/join'),
  queue:  require('./handler/music/queue'),
  show:   require('./handler/music/show'),
  delete: require('./handler/music/delete'),
  purge:  require('./handler/music/purge'),
  play:   require('./handler/music/play'),
  stop:   require('./handler/music/stop'),
  skip:   require('./handler/music/skip'),
  leave:  require('./handler/music/leave'),
};

const { joinToChannel } = require('./voice');
const versionHandler = require('./handler/version');
const webServer = require('./web/server');

console.log(`[boot] Node.js ${process.version}  PID=${process.pid}  platform=${process.platform}`);

// PID=1이면 컨테이너(Docker exec) 환경으로 판단 — NAMBI_DOCKER=1 환경변수로도 명시 가능
const isDockerMode = process.env.NAMBI_DOCKER === '1' || process.pid === 1;

console.log(`[boot] 환경: ${process.env.NODE_ENV || 'production'}${isDockerMode ? '  Docker모드' : ''}${devPrefix ? '  개발 프리픽스: "dev-"' : ''}`);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.once(Events.ClientReady, async () => {
  const guilds = [...client.guilds.cache.values()];
  console.log(`[discord] 봇 준비 완료: ${client.user.tag}  (ID: ${client.user.id})`);
  console.log(`[discord] 참여 중인 서버: ${guilds.length}개`);
  guilds.forEach(g => console.log(`[discord]   └ ${g.name}  (ID: ${g.id})`));

  if (devPrefix) {
    console.log(`[discord] 개발 모드: 명령어 /${CMD_MUSIC}, /${CMD_VERSION}`);
  }

  webServer.start(client);

  // 저장된 대기열 및 음성 채널 복원
  const saved = persistence.loadState();
  const savedEntries = Object.entries(saved);
  if (savedEntries.length === 0) {
    console.log('[boot] 복원할 저장 상태 없음');
  }
  await Promise.all(
    savedEntries.map(async ([guildId, { channelName, items, history }]) => {
      if (!client.guilds.cache.has(guildId)) {
        console.warn(`[boot] 저장된 길드 ${guildId} 는 현재 참여 중이지 않음 — 건너뜀`);
        return;
      }
      const state = getState(guildId);
      const guildName = client.guilds.cache.get(guildId)?.name ?? guildId;

      if (items?.length > 0) {
        state.queue.push(...items);
        console.log(`[boot] [${guildName}] 대기열 복원: ${items.length}곡`);
      }

      if (history?.length > 0) {
        state.history = history;
        console.log(`[boot] [${guildName}] 재생 히스토리 복원: ${history.length}곡`);
      }

      if (channelName) {
        const guild = client.guilds.cache.get(guildId);
        console.log(`[boot] [${guildName}] 음성 채널 "${channelName}" 재연결 시도...`);
        try {
          await joinToChannel(guild, { voice: {} }, channelName);
          console.log(`[boot] [${guildName}] 음성 채널 "${channelName}" 재연결 완료`);
        } catch (err) {
          console.error(`[boot] [${guildName}] 음성 채널 "${channelName}" 재연결 실패: ${err.message}`);
        }
      }

      stateBus.emit('stateChanged', guildId);
    })
  );

  // 이후 상태 변경마다 실시간 저장
  persistence.init(stateBus, getAllStates);
  console.log('[boot] 초기화 완료');
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const guildName = interaction.guild?.name ?? interaction.guildId;
  const userName  = `${interaction.user.username}#${interaction.user.discriminator}`;

  if (interaction.commandName === CMD_MUSIC) {
    const sub = interaction.options.getSubcommand();
    console.log(`[cmd] /${interaction.commandName} ${sub}  사용자: ${userName}  서버: ${guildName}`);
  } else {
    console.log(`[cmd] /${interaction.commandName}  사용자: ${userName}  서버: ${guildName}`);
  }

  try {
    if (interaction.commandName === CMD_MUSIC) {
      const sub = interaction.options.getSubcommand();
      const handler = musicHandlers[sub];
      if (handler) {
        await handler.execute(interaction);
      }
    } else if (interaction.commandName === CMD_VERSION) {
      await versionHandler.execute(interaction);
    }
  } catch (error) {
    console.error(`[cmd] 처리 중 오류 (/${interaction.commandName}):`, error);
    const msg = {
      content: '명령 처리 중 오류가 발생했습니다.',
      flags: MessageFlags.Ephemeral
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(msg);
    } else {
      await interaction.reply(msg);
    }
  }
});

client.on(Events.Error, (error) => {
  console.error('[discord] 클라이언트 오류:', error);
});

process.on('uncaughtException', (error) => {
  console.error('[process] 처리되지 않은 예외:', error);
});

process.on('unhandledRejection', (reason) => {
  if (reason?.code === 'TokenInvalid') {
    console.error('[discord] 로그인 실패: DISCORD_TOKEN 이 올바르지 않습니다');
    const nambiDir = process.env.NAMBI_DIR || path.join(require('os').homedir(), '.nambi');
    try {
      fs.unlinkSync(path.join(nambiDir, '.env.enc'));
      fs.unlinkSync(path.join(nambiDir, '.passphrase'));
      console.error('[discord] 설정 파일을 초기화했습니다. 다음 배포 시 setup-env 설정이 자동으로 시작됩니다');
    } catch (_) {}
    process.exit(0);
  }
  console.error('[process] 처리되지 않은 Promise 거부:', reason?.message ?? reason);
});

async function shutdown(signal) {
  console.log(`[process] 종료 신호 수신: ${signal}`);
  const states = [...getAllStates()];
  console.log(`[process] ${states.length}개 길드 상태 정리 중...`);
  for (const state of states) {
    clearState(state);
  }
  console.log('[process] 음성 연결 해제 대기 중...');
  await new Promise(resolve => setTimeout(resolve, 500));
  console.log('[process] Discord 연결 종료');
  client.destroy();
  process.exit(0);
}

// Docker 환경에서는 SIGINT 무시 (docker stop → SIGTERM으로만 종료)
// 로컬 개발 환경에서는 Ctrl+C(SIGINT)도 정상 종료
if (isDockerMode) {
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => {});
} else {
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

console.log('[boot] Discord 로그인 중...');
client.login(process.env.DISCORD_TOKEN);
