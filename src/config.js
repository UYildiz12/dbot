'use strict';

const dotenv = require('dotenv');

dotenv.config();

function toBool(value, fallback) {
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true' || value === '1';
}

function toNumber(value, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const config = {
  discord: {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
  },
  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    market: process.env.SPOTIFY_MARKET || 'US',
    previewOnly: toBool(process.env.SPOTIFY_PREVIEW_ONLY, true),
    maxTracks: toNumber(process.env.SPOTIFY_MAX_TRACKS, 100),
  },
  player: {
    ytdlpPath: process.env.YTDLP_PATH || 'yt-dlp',
    ytdlpJsRuntime: process.env.YTDLP_JS_RUNTIME || '',
    ytdlpCookiesPath: process.env.YTDLP_COOKIES_PATH || '',
    ytdlpRemoteComponents: process.env.YTDLP_REMOTE_COMPONENTS || '',
    ytdlpExtraArgs: process.env.YTDLP_EXTRA_ARGS || '',
    ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg',
    autoDisconnectMs: toNumber(process.env.AUTO_DISCONNECT_MS, 60_000),
  },
};

module.exports = config;
