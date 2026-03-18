const { REST, Routes, SlashCommandBuilder } = require("discord.js");
require("dotenv").config({ quiet: true });

// /music command with subcommands
const cmdMusic = new SlashCommandBuilder()
  .setName("music")
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
    .setName("play")
    .setDescription("대기열의 항목을 즉시 재생합니다.")
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
  .toJSON();

// /version command
const cmdVersion = new SlashCommandBuilder()
  .setName("version")
  .setDescription("봇 버전 정보를 출력합니다.")
  .toJSON();

const commands = [cmdMusic, cmdVersion];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("슬래시 커맨드 등록 중...");
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.APPLICATION_ID,
        process.env.GUILD_ID,
      ),
      { body: commands },
    );
    console.log("슬래시 커맨드 등록 완료.");
  } catch (error) {
    console.error(error);
  }
})();
