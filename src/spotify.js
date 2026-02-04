'use strict';

const config = require('./config');

const SPOTIFY_URL_RE = /(?:open\.spotify\.com\/|spotify:)(track|album|playlist)[/:]([A-Za-z0-9]+)/i;

let spotifyToken = null;
let spotifyTokenExpiresAt = 0;

function isSpotifyUrl(input) {
  return SPOTIFY_URL_RE.test(input);
}

function parseSpotifyUrl(input) {
  const match = input.match(SPOTIFY_URL_RE);
  if (!match) return null;
  return { type: match[1].toLowerCase(), id: match[2] };
}

async function getSpotifyToken() {
  const now = Date.now();
  if (spotifyToken && now < spotifyTokenExpiresAt - 60_000) {
    return spotifyToken;
  }

  if (!config.spotify.clientId || !config.spotify.clientSecret) {
    throw new Error('Missing Spotify client credentials. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.');
  }

  const credentials = Buffer.from(
    `${config.spotify.clientId}:${config.spotify.clientSecret}`,
  ).toString('base64');

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Spotify token error (${response.status}): ${text}`);
  }

  const data = await response.json();
  spotifyToken = data.access_token;
  spotifyTokenExpiresAt = now + data.expires_in * 1000;
  return spotifyToken;
}

async function spotifyGet(pathOrUrl) {
  const token = await getSpotifyToken();
  const url = pathOrUrl.startsWith('http')
    ? pathOrUrl
    : `https://api.spotify.com/v1/${pathOrUrl}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Spotify API error (${response.status}): ${text}`);
  }

  return response.json();
}

function normalizeTrack(track) {
  if (!track) return null;
  const title = track.name || 'Unknown track';
  const artists = Array.isArray(track.artists)
    ? track.artists.map((artist) => artist.name).filter(Boolean)
    : [];
  const spotifyUrl = track.external_urls?.spotify
    || (track.id ? `https://open.spotify.com/track/${track.id}` : null);

  return {
    title,
    artists,
    previewUrl: track.preview_url || null,
    spotifyUrl,
  };
}

async function getTrack(id, market) {
  const data = await spotifyGet(`tracks/${id}?market=${encodeURIComponent(market)}`);
  return normalizeTrack(data);
}

async function getPlaylistTracks(id, market, maxTracks) {
  const tracks = [];
  let nextUrl = `https://api.spotify.com/v1/playlists/${id}/tracks?limit=100&market=${encodeURIComponent(market)}`;

  while (nextUrl && tracks.length < maxTracks) {
    const data = await spotifyGet(nextUrl);
    for (const item of data.items || []) {
      if (tracks.length >= maxTracks) break;
      const normalized = normalizeTrack(item.track);
      if (normalized) tracks.push(normalized);
    }
    nextUrl = data.next;
  }

  return tracks;
}

async function getAlbumTracks(id, market, maxTracks) {
  const tracks = [];
  let nextUrl = `https://api.spotify.com/v1/albums/${id}/tracks?limit=50&market=${encodeURIComponent(market)}`;

  while (nextUrl && tracks.length < maxTracks) {
    const data = await spotifyGet(nextUrl);
    for (const item of data.items || []) {
      if (tracks.length >= maxTracks) break;
      const normalized = normalizeTrack(item);
      if (normalized) tracks.push(normalized);
    }
    nextUrl = data.next;
  }

  return tracks;
}

async function resolveSpotify(input, options = {}) {
  const parsed = parseSpotifyUrl(input);
  if (!parsed) return [];

  const market = options.market || config.spotify.market;
  const maxTracks = options.maxTracks || config.spotify.maxTracks;

  if (parsed.type === 'track') {
    const track = await getTrack(parsed.id, market);
    return track ? [track] : [];
  }

  if (parsed.type === 'playlist') {
    return getPlaylistTracks(parsed.id, market, maxTracks);
  }

  if (parsed.type === 'album') {
    return getAlbumTracks(parsed.id, market, maxTracks);
  }

  return [];
}

module.exports = {
  isSpotifyUrl,
  parseSpotifyUrl,
  resolveSpotify,
};
