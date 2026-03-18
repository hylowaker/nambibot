/**
 * @typedef {Object} TrackItem
 * @property {string} url - URL of the track
 * @property {string} title - Title of the track
 */


/**
 * @typedef {Object} PlayerState
 * @property {import('@discordjs/voice').AudioPlayer} player - Audio player instance
 * @property {TrackItem[]} queue - Music queue
 * @property {TrackItem|null} currentItem - Currently playing item
 * @property {import('@discordjs/voice').VoiceConnection|null} connection - Voice connection
 * @property {import('discord.js').TextChannel|null} textChannel - Text channel for sending messages
 * @property {boolean} _stopRequested - Whether a stop has been requested
 * @property {boolean} _playerInitialized - Whether the player has been initialized
 */


module.exports = {};
