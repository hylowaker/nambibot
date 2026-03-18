const { Client, Events, GatewayIntentBits, MessageFlags } = require('discord.js');
require('dotenv').config();
const { getAllStates, clearState } = require('./state');

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

const versionHandler = require('./handler/version');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.once(Events.ClientReady, () => {
  console.log(`Bot ready as ${client.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  // // TODO 채널 선택 로직 개선
  // if (interaction.channelId !== '811483917953007616') {
  //   await interaction.reply({ 
  //     content: '이 채널에서는 명령을 사용할 수 없습니다.',
  //     flags: MessageFlags.Ephemeral
  //   });
  //   return;
  // }

  console.log(`Command received: ${interaction}`);

  try {
    if (interaction.commandName === 'music') {
      const sub = interaction.options.getSubcommand();
      const handler = musicHandlers[sub];
      if (handler) {
        await handler.execute(interaction)
      };
    } else if (interaction.commandName === 'version') {
      await versionHandler.execute(interaction);
    }
  } catch (error) {
    console.error(error);
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
  console.error('Client error:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

async function shutdown(signal) {
  console.log(`Received ${signal}, shutting down...`);
  for (const state of getAllStates()) {
    clearState(state);
  }
  // Wait for voice disconnect packets to be flushed before closing the WebSocket.
  await new Promise(resolve => setTimeout(resolve, 500));
  client.destroy();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

client.login(process.env.DISCORD_TOKEN);
