const { MessageFlags } = require('discord.js');
const { getState } = require('../../state');
const { buildShowEmbed, buildPageRow } = require('./_show');
const { buildControlRow } = require('./_controls');
/** @typedef {import('discord.js').ChatInputCommandInteraction} ChatInputCommandInteraction */

/**
 * @param {ChatInputCommandInteraction} interaction
 */
async function execute(interaction) {
  const state  = getState(interaction.guild.id);
  const hidden = interaction.options.getBoolean('hidden') ?? false;
  const flags  = hidden ? MessageFlags.Ephemeral : undefined;

  if (!state.currentItem && state.queue.length === 0) {
    return interaction.reply({ content: '📋 대기열이 비어있습니다.', flags });
  }

  const { embed, page, totalPages } = buildShowEmbed(state, 0);
  const components = [buildControlRow(state)];
  if (totalPages > 1) components.push(buildPageRow(state._guildId, page, totalPages));

  return interaction.reply({ embeds: [embed], components, flags });
}

module.exports = { execute };
