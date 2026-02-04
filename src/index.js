'use strict';

const {
  Client,
  GatewayIntentBits,
} = require('discord.js');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  StreamType,
  NoSubscriberBehavior,
  entersState,
  VoiceConnectionStatus,
} = require('@discordjs/voice');
const { spawn } = require('node:child_process');

const config = require('./config');
const { isYouTubeUrl, resolveYouTube, getYouTubeAudioUrl } = require('./youtube');
const { isSpotifyUrl, resolveSpotify } = require('./spotify');

if (!config.discord.token) {
  throw new Error('Missing DISCORD_TOKEN in environment.');
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const queues = new Map();

function createGuildQueue(guildId) {
  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
  });

  const state = {
    guildId,
    player,
    connection: null,
    queue: [],
    current: null,
    currentProcess: null,
    textChannelId: null,
    idleTimer: null,
    processing: false,
  };

  player.on(AudioPlayerStatus.Idle, () => {
    cleanupProcess(state);
    void playNext(state);
  });

  player.on('error', (error) => {
    console.error(`[${guildId}] Audio player error:`, error.message);
    cleanupProcess(state);
    void playNext(state);
  });

  return state;
}

function getQueue(guildId) {
  if (!queues.has(guildId)) {
    queues.set(guildId, createGuildQueue(guildId));
  }
  return queues.get(guildId);
}

function cleanupProcess(state) {
  if (state.currentProcess && !state.currentProcess.killed) {
    state.currentProcess.kill('SIGKILL');
  }
  state.currentProcess = null;
}

function scheduleDisconnect(state) {
  if (state.idleTimer) clearTimeout(state.idleTimer);
  state.idleTimer = setTimeout(() => {
    if (state.connection) {
      state.connection.destroy();
      state.connection = null;
    }
  }, config.player.autoDisconnectMs);
}

async function connectToVoice(state, voiceChannel) {
  if (state.connection?.joinConfig.channelId === voiceChannel.id) {
    return state.connection;
  }

  if (state.connection) {
    state.connection.destroy();
  }

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: true,
  });

  state.connection = connection;

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  } catch (error) {
    connection.destroy();
    state.connection = null;
    throw error;
  }

  connection.subscribe(state.player);
  return connection;
}

function createAudioResourceFromUrl(url, title) {
  const args = [
    '-reconnect', '1',
    '-reconnect_streamed', '1',
    '-reconnect_delay_max', '5',
    '-i', url,
    '-analyzeduration', '0',
    '-loglevel', '0',
    '-vn',
    '-c:a', 'libopus',
    '-b:a', '96k',
    '-f', 'ogg',
    'pipe:1',
  ];

  const ffmpeg = spawn(config.player.ffmpegPath, args, {
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  const resource = createAudioResource(ffmpeg.stdout, {
    inputType: StreamType.OggOpus,
    metadata: { title },
  });

  return { resource, process: ffmpeg };
}

async function createResourceForTrack(track) {
  if (track.source === 'youtube') {
    const audioUrl = await getYouTubeAudioUrl(track.url);
    return createAudioResourceFromUrl(audioUrl, track.title);
  }

  if (track.source === 'spotify-preview') {
    return createAudioResourceFromUrl(track.url, track.title);
  }

  throw new Error(`Unsupported track source: ${track.source}`);
}

async function playNext(state) {
  if (state.processing) return;
  state.processing = true;

  try {
    if (state.queue.length === 0) {
      state.current = null;
      scheduleDisconnect(state);
      return;
    }

    const next = state.queue.shift();
    state.current = next;

  if (state.idleTimer) {
    clearTimeout(state.idleTimer);
    state.idleTimer = null;
  }

    try {
      const { resource, process } = await createResourceForTrack(next);
      cleanupProcess(state);
      state.currentProcess = process;
      state.player.play(resource);
      void announceNowPlaying(state, next);
    } catch (error) {
      console.error(`[${state.guildId}] Failed to play track:`, error.message);
      await announceError(state, `Failed to play: ${next.title}`);
    }
  } finally {
    state.processing = false;
  }

  if (state.queue.length === 0 && state.player.state.status === AudioPlayerStatus.Idle) {
    scheduleDisconnect(state);
  }

  if (state.queue.length > 0 && state.player.state.status === AudioPlayerStatus.Idle) {
    void playNext(state);
  }
}

async function announceNowPlaying(state, track) {
  if (!state.textChannelId) return;
  const channel = await client.channels.fetch(state.textChannelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const linkText = track.displayUrl ? ` (${track.displayUrl})` : '';
  await channel.send(`Now playing: ${track.title}${linkText}`);
}

async function announceError(state, message) {
  if (!state.textChannelId) return;
  const channel = await client.channels.fetch(state.textChannelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;
  await channel.send(message);
}

async function resolveTracks(input) {
  const warnings = [];

  if (isSpotifyUrl(input)) {
    const spotifyTracks = await resolveSpotify(input, {
      market: config.spotify.market,
      maxTracks: config.spotify.maxTracks,
    });

    if (spotifyTracks.length === 0) {
      return { tracks: [], warnings: ['No Spotify tracks found.'] };
    }

    const tracks = [];
    const previewMissing = [];

    for (const track of spotifyTracks) {
      if (track.previewUrl) {
        tracks.push({
          source: 'spotify-preview',
          title: `${track.title} — ${track.artists.join(', ')}`,
          url: track.previewUrl,
          displayUrl: track.spotifyUrl,
        });
      } else {
        previewMissing.push(track);
      }
    }

    if (previewMissing.length > 0 && config.spotify.previewOnly) {
      warnings.push(
        `Skipped ${previewMissing.length} Spotify track(s) without previews. ` +
        'Set SPOTIFY_PREVIEW_ONLY=false to allow YouTube fallback.'
      );
    }

    if (previewMissing.length > 0 && !config.spotify.previewOnly) {
      for (const track of previewMissing) {
        const searchQuery = `${track.title} ${track.artists.join(' ')}`.trim();
        const yt = await resolveYouTube(searchQuery);
        tracks.push({
          source: 'youtube',
          title: `${track.title} — ${track.artists.join(', ')}`,
          url: yt.url,
          displayUrl: track.spotifyUrl,
        });
      }
    }

    return { tracks, warnings };
  }

  const yt = await resolveYouTube(input);
  return {
    tracks: [
      {
        source: 'youtube',
        title: yt.title,
        url: yt.url,
        displayUrl: yt.url,
      },
    ],
    warnings,
  };
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;
  const guildId = interaction.guildId;

  if (!guildId) {
    await interaction.reply({ content: 'This command only works in servers.', ephemeral: true });
    return;
  }

  const state = getQueue(guildId);

  if (commandName === 'play') {
    const input = interaction.options.getString('query', true);
    const voiceChannel = interaction.member?.voice?.channel;

    if (!voiceChannel) {
      await interaction.reply({ content: 'Join a voice channel first.', ephemeral: true });
      return;
    }

    state.textChannelId = interaction.channelId;

    await interaction.deferReply();

    try {
      await connectToVoice(state, voiceChannel);
      const result = await resolveTracks(input);

      if (result.tracks.length === 0) {
        await interaction.editReply(result.warnings[0] || 'No tracks found.');
        return;
      }

      const requester = interaction.user.username;
      for (const track of result.tracks) {
        track.requestedBy = requester;
        state.queue.push(track);
      }

      const warningText = result.warnings.length > 0 ? `\n${result.warnings.join('\n')}` : '';
      await interaction.editReply(
        `Queued ${result.tracks.length} track(s).${warningText}`,
      );

      if (state.player.state.status === AudioPlayerStatus.Idle) {
        void playNext(state);
      }
    } catch (error) {
      console.error('Play command failed:', error.message);
      await interaction.editReply('Failed to start playback. Check logs for details.');
    }
  }

  if (commandName === 'pause') {
    if (state.player.pause()) {
      await interaction.reply('Paused.');
    } else {
      await interaction.reply('Nothing is playing.');
    }
  }

  if (commandName === 'resume') {
    if (state.player.unpause()) {
      await interaction.reply('Resumed.');
    } else {
      await interaction.reply('Nothing is paused.');
    }
  }

  if (commandName === 'skip') {
    if (state.player.state.status === AudioPlayerStatus.Idle) {
      await interaction.reply('Nothing to skip.');
      return;
    }
    cleanupProcess(state);
    state.player.stop(true);
    await interaction.reply('Skipped.');
  }

  if (commandName === 'stop') {
    state.queue = [];
    cleanupProcess(state);
    state.player.stop(true);
    if (state.connection) {
      state.connection.destroy();
      state.connection = null;
    }
    await interaction.reply('Stopped and cleared the queue.');
  }

  if (commandName === 'leave') {
    state.queue = [];
    cleanupProcess(state);
    state.player.stop(true);
    if (state.connection) {
      state.connection.destroy();
      state.connection = null;
    }
    await interaction.reply('Disconnected.');
  }

  if (commandName === 'queue') {
    const lines = [];
    if (state.current) {
      lines.push(`Now: ${state.current.title}`);
    } else {
      lines.push('Now: (nothing)');
    }

    const upcoming = state.queue.slice(0, 10).map((track, index) => {
      return `${index + 1}. ${track.title}`;
    });

    if (upcoming.length > 0) {
      lines.push('Up next:');
      lines.push(...upcoming);
    }

    await interaction.reply(lines.join('\n'));
  }
});

client.login(config.discord.token);
