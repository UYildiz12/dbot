# Dbot Music Bot

A Discord bot that plays audio in voice channels from YouTube searches/links and Spotify links.

## Requirements
- Node.js 22.x (or newer)
- `ffmpeg` on your PATH
- `yt-dlp` on your PATH
- A Discord bot token
- A Spotify app client ID/secret (only required for Spotify links)

## Setup
1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example` and fill in your values.

3. Register slash commands:

```bash
# Optional: set GUILD_ID in .env for instant updates
npm run register
```

4. Start the bot:

```bash
npm start
```

## Commands
- `/play <query-or-url>`
- `/pause`
- `/resume`
- `/skip`
- `/stop`
- `/leave`
- `/queue`

## Spotify Behavior
By default, Spotify playback uses the 30-second preview URL if available. Many tracks do not have previews.

To allow YouTube fallback for missing previews, set:

```
SPOTIFY_PREVIEW_ONLY=false
```

## Notes on Compliance
- You are responsible for complying with Discord, YouTube, and Spotify policies.
- Spotify’s Web API does **not** grant rights to stream full tracks; previews may be limited or missing.
- Using Spotify metadata to drive playback from another service may violate Spotify’s developer policies. Keep preview-only mode if you need strict compliance.
