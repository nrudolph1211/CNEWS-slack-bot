# CNEWS Digest Bot 🤖📰

An AI-powered Slack bot that scans your unread channels and DMs, then delivers a clean summary with action items — built for the Chapman News workflow.

## What It Does

| Command | What You Get |
|---------|-------------|
| `/catchup` | Summary of **all unread** messages across every channel & DM |
| `/digest` | Summary of everything **since midnight today** |
| `/digest 4h` | Summary of the **last 4 hours** |
| `/digest 2d` | Summary of the **last 2 days** |
| *(automatic)* | **Daily digest DM** every morning at 8 AM PT |

Every summary includes:
- 🔥 **Needs Your Attention** — questions and decisions waiting on you
- 📋 **Action Items / To-Do** — tasks extracted from messages
- 💬 **Channel Summaries** — what happened in each channel
- 💡 **FYI / Low Priority** — interesting but non-urgent stuff

---

## Setup (Step by Step)

### 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**
2. Name it `CNEWS Digest` (or whatever you want), select your workspace

### 2. Configure Permissions

Go to **OAuth & Permissions** and add these **Bot Token Scopes**:

```
channels:history       — Read messages in public channels
channels:read          — List public channels
groups:history         — Read messages in private channels
groups:read            — List private channels
im:history             — Read direct messages
im:read                — List DMs
mpim:history           — Read group DMs
mpim:read              — List group DMs
chat:write             — Send messages (for the digest DM)
users:read             — Resolve user IDs to names
commands               — Register slash commands
```

### 3. Enable Socket Mode

1. Go to **Settings → Socket Mode** → Toggle ON
2. Generate an **App-Level Token** with `connections:write` scope
3. Copy it — this is your `SLACK_APP_TOKEN` (starts with `xapp-`)

### 4. Create Slash Commands

Go to **Slash Commands** → Create these two:

| Command | Request URL | Description |
|---------|------------|-------------|
| `/catchup` | *(leave blank for Socket Mode)* | Catch up on unread messages |
| `/digest` | *(leave blank for Socket Mode)* | Get a digest of recent messages |

### 5. Install to Workspace

Go to **Install App** → **Install to Workspace** → Authorize

Copy the **Bot User OAuth Token** (starts with `xoxb-`) → this is your `SLACK_BOT_TOKEN`

### 6. Get Your Remaining Credentials

- **Signing Secret**: Settings → Basic Information → App Credentials → Signing Secret
- **Your Slack User ID**: In Slack, click your profile pic → ⋮ → Copy Member ID
- **Anthropic API Key**: [console.anthropic.com](https://console.anthropic.com)

### 7. Configure Environment

```bash
cp .env.example .env
```

Fill in all the values in `.env`.

### 8. Install & Run

```bash
npm install
npm start
```

You should see:
```
⚡ CNEWS Digest Bot is running!
   Daily digest scheduled: 0 8 * * * (America/Los_Angeles)
   Commands: /catchup, /digest
```

### 9. Invite the Bot

In Slack, invite the bot to every channel you want it to scan:

```
/invite @CNEWS Digest
```

> **Note:** The bot can only read channels it's been invited to. For DMs, it needs the `im:history` scope (already added above) and will automatically have access.

---

## Deployment Options

### Run on Your Machine
```bash
npm start          # production
npm run dev        # development (auto-restarts on changes)
```

### Run on a Server (always-on)
Use **Railway**, **Render**, **Fly.io**, or any VPS. Example with PM2:

```bash
npm install -g pm2
pm2 start src/app.js --name cnews-digest
pm2 save
pm2 startup   # auto-start on reboot
```

### Run on Railway (free tier available)
1. Push to a GitHub repo
2. Connect to [railway.app](https://railway.app)
3. Add your env vars in the Railway dashboard
4. Deploy — it'll stay running 24/7

---

## How It Works

```
┌──────────────┐     ┌──────────────────┐     ┌───────────────┐
│  /catchup or │     │  Slack Fetcher    │     │  Claude API   │
│  /digest or  │────▶│  Pulls messages   │────▶│  Summarizes + │
│  daily cron  │     │  from all channels│     │  extracts TODOs│
└──────────────┘     └──────────────────┘     └───────┬───────┘
                                                       │
                                                       ▼
                                               ┌───────────────┐
                                               │  DM to you    │
                                               │  with digest  │
                                               └───────────────┘
```

1. **Trigger** → Slash command or daily cron fires
2. **Fetch** → Bot pulls messages from all channels/DMs it has access to
3. **Filter** → Removes bot messages and system events, resolves user names
4. **Summarize** → Sends everything to Claude with a newsroom-aware prompt
5. **Deliver** → Posts the formatted digest as a DM to you

---

## Customization

### Change the daily digest time
In `.env`, set `DAILY_DIGEST_CRON` using cron syntax:

```
0 8 * * *      → 8:00 AM every day
0 8,17 * * *   → 8:00 AM and 5:00 PM
0 8 * * 1-5    → 8:00 AM weekdays only
*/30 * * * *   → Every 30 minutes (careful with API costs)
```

### Adjust the AI summary style
Edit the `systemPrompt` in `src/summarizer.js`. The prompt is already tuned for the CNEWS EP workflow but you can adjust tone, sections, or add custom instructions.

### Cost estimate
Each `/catchup` or `/digest` call typically uses ~2,000–5,000 tokens depending on message volume. At Sonnet pricing, that's roughly $0.01–0.03 per summary. A daily digest will run you maybe $0.50–1.00/month.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Bot can't read a channel | `/invite @CNEWS Digest` in that channel |
| "missing_scope" error | Double-check all scopes in OAuth & Permissions, reinstall app |
| Empty digest | Make sure bot is in the channels AND there are new messages |
| Socket mode won't connect | Verify `SLACK_APP_TOKEN` starts with `xapp-` |
| Daily digest not firing | Check `TZ` in .env matches your timezone |
