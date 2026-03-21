require('../web/logInterceptor');
const { REST, Routes, SlashCommandBuilder } = require("discord.js");
require("dotenv").config({ quiet: true });

const devPrefix = (process.env.DEVELOPE_PREFIX === 'ON' || process.env.DEVELOPE_PREFIX === '1') ? 'dev-' : '';

// /music command with subcommands
const cmdMusic = new SlashCommandBuilder()
  .setName(`${devPrefix}music`)
  .setDescription("음악봇 명령어")
  .addSubcommand(sub => sub
    .setName("help")
    .setDescription("도움말을 출력합니다.")
  )
  .addSubcommand(sub => sub
    .setName("join")
    .setDescription("봇이 음성 채널에 참가합니다.")
    .addStringOption(opt => opt
      .setName("channel")
      .setDescription("참가할 음성 채널 이름")
      .setRequired(false)
    )
  )
  .addSubcommand(sub => sub
    .setName("queue")
    .setDescription("대기열에 항목을 추가합니다.")
    .addStringOption(opt => opt
      .setName("url")
      .setDescription("음악 URL")
      .setRequired(true)
    )
  )
  .addSubcommand(sub => sub
    .setName("show")
    .setDescription("현재 재생 중인 음악과 대기열 내용을 출력합니다.")
    .addBooleanOption(opt => opt
      .setName("hidden")
      .setDescription("나에게만 보이도록 표시")
      .setRequired(false)
    )
  )
  .addSubcommand(sub => sub
    .setName("np")
    .setDescription("현재 재생 중인 항목을 확인합니다.")
  )
  .addSubcommand(sub => sub
    .setName("delete")
    .setDescription("대기열에서 항목을 삭제합니다.")
    .addIntegerOption(opt => opt
      .setName("index")
      .setDescription("항목 인덱스 (1부터 시작)")
      .setMinValue(1)
      .setRequired(false)
    )
  )
  .addSubcommand(sub => sub
    .setName("purge")
    .setDescription("현재 대기열을 전부 삭제합니다.")
  )
  .addSubcommand(sub => sub
    .setName("jump")
    .setDescription("대기열의 특정 항목을 즉시 재생합니다.")
    .addIntegerOption(opt => opt
      .setName("index")
      .setDescription("항목 인덱스 (1부터 시작)")
      .setMinValue(1)
      .setRequired(false)
    )
  )
  .addSubcommand(sub => sub
    .setName("stop")
    .setDescription("현재 음악 재생을 중단합니다.")
  )
  .addSubcommand(sub => sub
    .setName("skip")
    .setDescription("현재 재생을 건너뛰고 대기열의 다음 항목을 재생합니다.")
  )
  .addSubcommand(sub => sub
    .setName("leave")
    .setDescription("음성 채널에서 봇이 퇴장합니다.")
  )
  .addSubcommand(sub => sub
    .setName("pause")
    .setDescription("현재 재생을 일시정지합니다.")
  )
  .addSubcommand(sub => sub
    .setName("resume")
    .setDescription("일시정지된 재생을 재개합니다.")
  )
  .addSubcommand(sub => sub
    .setName("shuffle")
    .setDescription("대기열 항목을 무작위로 섞습니다.")
  )
  .addSubcommand(sub => sub
    .setName("dedupe")
    .setDescription("대기열에서 중복 항목을 제거합니다.")
  )
  .addSubcommand(sub => sub
    .setName("move")
    .setDescription("대기열 항목의 순서를 변경합니다.")
    .addIntegerOption(opt => opt
      .setName("from")
      .setDescription("이동할 항목 인덱스 (1부터 시작)")
      .setMinValue(1)
      .setRequired(true)
    )
    .addIntegerOption(opt => opt
      .setName("to")
      .setDescription("이동할 위치 인덱스 (1부터 시작)")
      .setMinValue(1)
      .setRequired(true)
    )
  )
  .addSubcommand(sub => sub
    .setName("webui")
    .setDescription("Web UI 주소를 표시합니다.")
  )
  .toJSON();

// /version command
const cmdVersion = new SlashCommandBuilder()
  .setName(`${devPrefix}version`)
  .setDescription("봇 버전 정보를 출력합니다.")
  .toJSON();

// /logs command
const cmdLogs = new SlashCommandBuilder()
  .setName(`${devPrefix}logs`)
  .setDescription("서버 로그를 확인합니다.")
  .addIntegerOption(opt => opt
    .setName("count")
    .setDescription("표시할 로그 수 (기본값: 20, 최대 30)")
    .setMinValue(1)
    .setMaxValue(30)
    .setRequired(false)
  )
  .addStringOption(opt => opt
    .setName("level")
    .setDescription("로그 레벨 필터 (기본값: 전체)")
    .setRequired(false)
    .addChoices(
      { name: '전체',  value: 'all' },
      { name: 'INFO',  value: 'info' },
      { name: 'WARN',  value: 'warn' },
      { name: 'ERROR', value: 'error' },
    )
  )
  .toJSON();

const commands = [cmdMusic, cmdVersion, cmdLogs];

const rest = new REST({ version: "10", timeout: 15_000 }).setToken(process.env.DISCORD_TOKEN);

const _hardTimeout = setTimeout(() => {
  console.error('[deploy] 타임아웃: Discord API 응답 없음 — 네트워크를 확인해주세요');
  process.exit(1);
}, 30_000);

(async () => {
  const appId   = process.env.APPLICATION_ID;
  const guildId = process.env.GUILD_ID;
  console.log(`[deploy] 슬래시 커맨드 등록 시작  APP=${appId}  GUILD=${guildId}`);
  console.log(`[deploy] 등록할 명령어: ${commands.map(c => `/${c.name}`).join(', ')}`);
  try {
    const result = await rest.put(
      Routes.applicationGuildCommands(appId, guildId),
      { body: commands },
    );
    clearTimeout(_hardTimeout);
    console.log(`[deploy] 슬래시 커맨드 등록 완료 (${result.length}개)`);
  } catch (error) {
    const status = error.status;
    const code   = error.code;
    if (status === 401) {
      console.error('[deploy] 슬래시 커맨드 등록 실패: DISCORD_TOKEN 이 올바르지 않습니다');
      process.exit(2);
    } else if (code === 10004 || status === 404) {
      console.error('[deploy] 슬래시 커맨드 등록 실패: GUILD_ID 에 해당하는 서버를 찾을 수 없습니다');
      process.exit(2);
    } else if (status === 403) {
      console.error('[deploy] 슬래시 커맨드 등록 실패: GUILD_ID 가 잘못되었거나 봇이 해당 서버에 초대되지 않았습니다');
      process.exit(2);
    } else {
      console.error(`[deploy] 슬래시 커맨드 등록 실패: ${error.message ?? String(error)}`);
      process.exit(1);
    }
  }
})();
