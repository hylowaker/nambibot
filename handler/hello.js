/** @typedef {import('discord.js').ChatInputCommandInteraction} ChatInputCommandInteraction */

module.exports = {
  name: 'hello',
  /**
   * @param {ChatInputCommandInteraction} interaction
   */
  async execute(interaction) {
    const param1 = interaction.options.getString('param1') ?? '';

    const parts = ['Hello World!', param1].filter(Boolean);

    console.log(`명령 실행: ${interaction.commandName} ${param1}`);
    
    await interaction.reply(parts.join(' '));
  },
};
