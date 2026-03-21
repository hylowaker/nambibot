require('./web/logInterceptor'); // console 패치 — 가장 먼저 로드
const { Client, Events, GatewayIntentBits, MessageFlags, EmbedBuilder } = require('discord.js');
const { AudioPlayerStatus } = require('@discordjs/voice');
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { getState, getAllStates, clearState } = require('./state');
const stateBus = require('./web/stateBus');
const persistence = require('./persistence');

const devPrefix = (process.env.DEVELOPE_PREFIX === 'ON' || process.env.DEVELOPE_PREFIX === '1') ? 'dev-' : '';
const CMD_MUSIC   = `${devPrefix}music`;
const CMD_VERSION = `${devPrefix}version`;
const CMD_LOGS    = `${devPrefix}logs`;

// Music subcommand handlers
const musicHandlers = {
  help:   require('./handler/music/help'),
  join:   require('./handler/music/join'),
  queue:  require('./handler/music/queue'),
  show:   require('./handler/music/show'),
  delete: require('./handler/music/delete'),
  purge:  require('./handler/music/purge'),
  jump:   require('./handler/music/jump'),
  np:     require('./handler/music/np'),
  stop:   require('./handler/music/stop'),
  skip:   require('./handler/music/skip'),
  leave:  require('./handler/music/leave'),
  webui:  require('./handler/music/webui'),
  pause:  require('./handler/music/pause'),
  resume: require('./handler/music/resume'),
  shuffle: require('./handler/music/shuffle'),
  dedupe: require('./handler/music/dedupe'),
  move:   require('./handler/music/move'),
};

const { joinToChannel } = require('./voice');
const { playItem } = require('./player');
const logsHandler = require('./handler/logs');
const { buildShowEmbed, buildPageRow } = require('./handler/music/_show');
const { buildControlRow } = require('./handler/music/_controls');
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

async function handleMusicButton(interaction) {
  const parts   = interaction.customId.split(':');
  const action  = parts[1];
  const guildId = parts[2];
  const extra   = parts[3]; // page number for show_pg

  try {
    // --- 페이지네이션 ---
    if (action === 'show_pg') {
      const page  = parseInt(extra, 10);
      const state = getState(guildId);
      const { embed, page: p, totalPages } = buildShowEmbed(state, page);
      const components = [buildControlRow(state)];
      if (totalPages > 1) components.push(buildPageRow(guildId, p, totalPages));
      return interaction.update({ embeds: [embed], components });
    }

    // --- 대기열 초기화 확인 ---
    if (action === 'purge_ok') {
      const state = getState(guildId);
      const count = state.queue.length;
      state.queue = [];
      stateBus.emit('stateChanged', guildId);
      return interaction.update({
        embeds: [new EmbedBuilder().setColor(0xFF375F).setDescription(`🧹 대기열 **${count}개** 항목을 모두 삭제했습니다.`)],
        components: [],
      });
    }
    if (action === 'purge_cancel') {
      return interaction.update({ embeds: [], content: '취소했습니다.', components: [] });
    }

    // --- 재생 제어 ---
    const state = getState(guildId);
    if (!state.connection) {
      return interaction.reply({ content: '❌ 봇이 음성 채널에 참가 중이지 않습니다.', flags: MessageFlags.Ephemeral });
    }

    if (action === 'toggle') {
      if (!state.currentItem) {
        return interaction.reply({ content: '❌ 재생 중인 항목이 없습니다.', flags: MessageFlags.Ephemeral });
      }
      if (state.player.state.status === AudioPlayerStatus.Paused) {
        state.player.unpause();
        stateBus.emit('stateChanged', guildId);
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(0x30D158).setDescription(`▶️ **${state.currentItem.title}** 재생을 재개합니다.`)],
          flags: MessageFlags.Ephemeral,
        });
      } else {
        state.player.pause();
        stateBus.emit('stateChanged', guildId);
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription(`⏸️ **${state.currentItem.title}** 일시정지했습니다.`)],
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    if (action === 'stop') {
      if (!state.currentItem) {
        return interaction.reply({ content: '❌ 재생 중인 항목이 없습니다.', flags: MessageFlags.Ephemeral });
      }
      state._stopRequested = true;
      state.player.stop();
      state.currentItem = null;
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xFF375F).setDescription('⏹️ 재생을 중단했습니다.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (action === 'skip') {
      if (!state.currentItem) {
        return interaction.reply({ content: '❌ 재생 중인 항목이 없습니다.', flags: MessageFlags.Ephemeral });
      }
      if (state.queue.length === 0) {
        return interaction.reply({ content: '❌ 대기열이 비어있습니다.', flags: MessageFlags.Ephemeral });
      }
      if (!state.playStartTs) {
        return interaction.reply({ content: '⏳ 현재 곡을 불러오는 중입니다.', flags: MessageFlags.Ephemeral });
      }
      const current = state.currentItem;
      const item    = state.queue.shift();
      if (current) state.queue.push(current);
      if (state.player.state.status !== AudioPlayerStatus.Idle) {
        state._skipAutoAdvance = true;
        state.player.stop();
      }
      const skipEmbed = new EmbedBuilder().setColor(0x6080FF).setDescription(`⏭️ **${item.title}** 재생 중...`);
      if (current) skipEmbed.setFooter({ text: `건너뜀: ${current.title} → 대기열 맨 뒤로` });
      await interaction.reply({ embeds: [skipEmbed], flags: MessageFlags.Ephemeral });
      playItem(state, item).catch(async (err) => {
        try { await interaction.followUp({ content: `❌ ${item.title} 재생 오류: ${err.message}`, flags: MessageFlags.Ephemeral }); } catch {}
      });
    }
  } catch (error) {
    console.error(`[button] 처리 중 오류 (${interaction.customId}):`, error);
    try {
      const msg = { content: '명령 처리 중 오류가 발생했습니다.', flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
      else await interaction.reply(msg);
    } catch {}
  }
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton() && interaction.customId.startsWith('music:')) {
    await handleMusicButton(interaction);
    return;
  }
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
    } else if (interaction.commandName === CMD_LOGS) {
      await logsHandler.execute(interaction);
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
  if (error.code === 'EPIPE') return; // stdout/stderr 파이프 종료 — 무시
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
