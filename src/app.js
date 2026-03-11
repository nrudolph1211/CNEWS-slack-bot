/**
 * app.js
 * Main entry point — Slack Bolt app with slash commands + daily cron digest.
 *
 * SLASH COMMANDS:
 *   /catchup           → Summarize all unread messages
 *   /digest 4h         → Summarize last 4 hours
 *   /digest 24h        → Summarize last 24 hours (default)
 *   /digest today      → Summarize since midnight
 *
 * SCHEDULED:
 *   Daily digest DM at the time set in DAILY_DIGEST_CRON
 */

require("dotenv").config();
const { App } = require("@slack/bolt");
const cron = require("node-cron");
const SlackFetcher = require("./slack-fetcher");
const Summarizer = require("./summarizer");

// ── Validate env ─────────────────────────────────────────────────────
const required = [
  "SLACK_BOT_TOKEN",
  "SLACK_APP_TOKEN",
  "SLACK_SIGNING_SECRET",
  "ANTHROPIC_API_KEY",
  "MY_SLACK_USER_ID",
];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

// ── Initialize ───────────────────────────────────────────────────────
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

const fetcher = new SlackFetcher(app.client, process.env.MY_SLACK_USER_ID);
const summarizer = new Summarizer(process.env.ANTHROPIC_API_KEY);

// ── Helper: send a long message (Slack has a 4000-char block limit) ──
async function sendDigest(channelOrUserId, text) {
  // Split into chunks of ~3500 chars at line boundaries
  const chunks = [];
  let current = "";
  for (const line of text.split("\n")) {
    if (current.length + line.length + 1 > 3500) {
      chunks.push(current);
      current = "";
    }
    current += (current ? "\n" : "") + line;
  }
  if (current) chunks.push(current);

  for (const chunk of chunks) {
    await app.client.chat.postMessage({
      channel: channelOrUserId,
      text: chunk,
      mrkdwn: true,
    });
  }
}

// ══════════════════════════════════════════════════════════════════════
// SLASH COMMAND:  /catchup
// Summarizes all unread messages across channels & DMs
// ══════════════════════════════════════════════════════════════════════
app.command("/catchup", async ({ command, ack, respond }) => {
  await ack();

  // Only allow the configured user to run this
  if (command.user_id !== process.env.MY_SLACK_USER_ID) {
    return respond("Sorry, this bot is configured for a specific user.");
  }

  await respond("⏳ Scanning your unread messages… hang tight.");

  try {
    const digests = await fetcher.getUnreadMessages();
    const summary = await summarizer.summarize(digests, { mode: "catchup" });
    await sendDigest(command.user_id, summary);
  } catch (err) {
    console.error("Error in /catchup:", err);
    await respond(`❌ Something went wrong: ${err.message}`);
  }
});

// ══════════════════════════════════════════════════════════════════════
// SLASH COMMAND:  /digest [timerange]
// Summarizes messages from the last N hours, or since midnight
// ══════════════════════════════════════════════════════════════════════
app.command("/digest", async ({ command, ack, respond }) => {
  await ack();

  if (command.user_id !== process.env.MY_SLACK_USER_ID) {
    return respond("Sorry, this bot is configured for a specific user.");
  }

  const arg = (command.text || "").trim().toLowerCase();

  let hours;
  let label;

  if (arg === "today" || arg === "") {
    // Default: since midnight local time
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    hours = (now - midnight) / (1000 * 3600);
    label = "today";
  } else if (arg.endsWith("h")) {
    hours = parseFloat(arg);
    label = `the last ${hours} hour${hours === 1 ? "" : "s"}`;
  } else if (arg.endsWith("d")) {
    hours = parseFloat(arg) * 24;
    label = `the last ${parseFloat(arg)} day${parseFloat(arg) === 1 ? "" : "s"}`;
  } else {
    return respond(
      "Usage: `/digest` (today), `/digest 4h` (last 4 hours), `/digest 2d` (last 2 days)"
    );
  }

  await respond(`⏳ Pulling messages from ${label}…`);

  try {
    const digests = await fetcher.getMessagesSince(hours);
    const summary = await summarizer.summarize(digests, { mode: "timerange" });
    await sendDigest(command.user_id, summary);
  } catch (err) {
    console.error("Error in /digest:", err);
    await respond(`❌ Something went wrong: ${err.message}`);
  }
});

// ══════════════════════════════════════════════════════════════════════
// DAILY CRON DIGEST
// Sends a DM every day at the configured time
// ══════════════════════════════════════════════════════════════════════
const cronSchedule = process.env.DAILY_DIGEST_CRON || "0 8 * * *";

cron.schedule(cronSchedule, async () => {
  console.log(`[${new Date().toISOString()}] Running daily digest…`);

  try {
    const digests = await fetcher.getMessagesSince(24);
    const summary = await summarizer.summarize(digests, { mode: "daily" });
    await sendDigest(process.env.MY_SLACK_USER_ID, summary);
    console.log("Daily digest sent successfully.");
  } catch (err) {
    console.error("Daily digest failed:", err);
  }
}, {
  timezone: process.env.TZ || "America/Los_Angeles",
});

// ── Start ────────────────────────────────────────────────────────────
(async () => {
  await app.start();
  console.log("⚡ CNEWS Digest Bot is running!");
  console.log(`   Daily digest scheduled: ${cronSchedule} (${process.env.TZ || "America/Los_Angeles"})`);
  console.log(`   Digest recipient: ${process.env.MY_SLACK_USER_ID}`);
  console.log(`   Commands: /catchup, /digest`);
})();
