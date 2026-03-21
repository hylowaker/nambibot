const { MessageFlags, EmbedBuilder } = require('discord.js');
/** @typedef {import('discord.js').ChatInputCommandInteraction} ChatInputCommandInteraction */

/**
 * @param {ChatInputCommandInteraction} interaction
 */
async function execute(interaction) {
  const port = process.env.WEB_PORT || 3000;
  const url = process.env.WEB_UI_URL || `http://localhost:${port}`;

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🖥️ Web UI')
    .setDescription(url);

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = { execute };
