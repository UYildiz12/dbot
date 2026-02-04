'use strict';

const config = require('./config');
const { runCommand } = require('./utils');

const YT_URL_RE = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\//i;

function isYouTubeUrl(input) {
  return YT_URL_RE.test(input);
}

async function ytDlpJson(input) {
  const output = await runCommand(config.player.ytdlpPath, [
    '-j',
    '--no-playlist',
    '--skip-download',
    input,
  ]);
  const line = output.split('\n').find((item) => item.trim().length > 0);
  if (!line) {
    throw new Error('yt-dlp returned no data');
  }
  return JSON.parse(line);
}

async function resolveYouTube(input) {
  const query = isYouTubeUrl(input) ? input : `ytsearch1:${input}`;
  const data = await ytDlpJson(query);
  return {
    title: data.title || 'Unknown title',
    url: data.webpage_url || input,
    duration: data.duration_string || null,
  };
}

async function getYouTubeAudioUrl(input) {
  const output = await runCommand(config.player.ytdlpPath, [
    '-f',
    'bestaudio',
    '-g',
    '--no-playlist',
    input,
  ]);
  const line = output.split('\n').find((item) => item.trim().length > 0);
  if (!line) {
    throw new Error('yt-dlp returned no audio URL');
  }
  return line;
}

module.exports = {
  isYouTubeUrl,
  resolveYouTube,
  getYouTubeAudioUrl,
};
