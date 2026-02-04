'use strict';

const { REST, Routes, ApplicationCommandOptionType } = require('discord.js');
const config = require('../src/config');

if (!config.discord.token || !config.discord.clientId) {
  throw new Error('Missing DISCORD_TOKEN or DISCORD_CLIENT_ID in environment.');
}

const commands = [
  {
    name: 'play',
    description: 'Play a YouTube link, Spotify link, or search query.',
    options: [
      {
        name: 'query',
        description: 'URL or search query',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
    ],
  },
  { name: 'pause', description: 'Pause playback.' },
  { name: 'resume', description: 'Resume playback.' },
  { name: 'skip', description: 'Skip the current track.' },
  { name: 'stop', description: 'Stop playback and clear the queue.' },
  { name: 'leave', description: 'Disconnect from the voice channel.' },
  { name: 'queue', description: 'Show the current queue.' },
];

const rest = new REST({ version: '10' }).setToken(config.discord.token);

async function register() {
  const guildId = process.env.GUILD_ID;

  if (guildId) {
    await rest.put(
      Routes.applicationGuildCommands(config.discord.clientId, guildId),
      { body: commands },
    );
    console.log(`Registered guild commands for ${guildId}.`);
  } else {
    await rest.put(
      Routes.applicationCommands(config.discord.clientId),
      { body: commands },
    );
    console.log('Registered global commands.');
  }
}

register().catch((error) => {
  console.error('Failed to register commands:', error);
  process.exit(1);
});
