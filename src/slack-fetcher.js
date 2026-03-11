/**
 * slack-fetcher.js
 * Pulls unread / time-filtered messages from Slack channels & DMs.
 */

class SlackFetcher {
  constructor(slackClient, myUserId) {
    this.client = slackClient;
    this.myUserId = myUserId;
  }

  // ── Get all channels + DMs the bot user is in ──────────────────────
  async getConversations() {
    const conversations = [];
    let cursor;

    do {
      const result = await this.client.conversations.list({
        types: "public_channel,private_channel,mpim,im",
        exclude_archived: true,
        limit: 200,
        cursor,
      });

      conversations.push(...result.channels);
      cursor = result.response_metadata?.next_cursor;
    } while (cursor);

    return conversations;
  }

  // ── Resolve display names for user IDs ─────────────────────────────
  async resolveUserNames(userIds) {
    const nameMap = {};
    const unique = [...new Set(userIds)];

    for (const uid of unique) {
      try {
        const { user } = await this.client.users.info({ user: uid });
        nameMap[uid] = user.real_name || user.profile?.display_name || user.name;
      } catch {
        nameMap[uid] = uid; // fallback
      }
    }
    return nameMap;
  }

  // ── Pull messages from a single conversation ───────────────────────
  async getMessages(channelId, { oldest, latest } = {}) {
    const messages = [];
    let cursor;

    do {
      const params = { channel: channelId, limit: 200, cursor };
      if (oldest) params.oldest = oldest;
      if (latest) params.latest = latest;

      const result = await this.client.conversations.history(params);
      // Filter out bot messages and join/leave events
      const real = (result.messages || []).filter(
        (m) => !m.bot_id && m.subtype == null
      );
      messages.push(...real);
      cursor = result.response_metadata?.next_cursor;
    } while (cursor);

    return messages;
  }

  // ── Get unread messages per channel (uses last-read marker) ────────
  async getUnreadMessages() {
    const convos = await this.getConversations();
    const channelDigests = [];

    for (const convo of convos) {
      try {
        // Get the user's last-read timestamp for this channel
        const info = await this.client.conversations.info({
          channel: convo.id,
          include_num_members: false,
        });

        const lastRead = info.channel?.last_read || "0";
        const messages = await this.getMessages(convo.id, { oldest: lastRead });

        if (messages.length === 0) continue;

        const userIds = messages.map((m) => m.user).filter(Boolean);
        const names = await this.resolveUserNames(userIds);

        channelDigests.push({
          channel: convo.name || convo.id,
          channelId: convo.id,
          isDM: convo.is_im || convo.is_mpim,
          dmUserId: convo.user, // only set for 1:1 DMs
          messageCount: messages.length,
          messages: messages.reverse().map((m) => ({
            user: names[m.user] || m.user,
            text: m.text,
            ts: m.ts,
          })),
        });
      } catch (err) {
        // Likely missing scope for this channel – skip silently
        if (err.data?.error !== "not_in_channel") {
          console.warn(`Skipping ${convo.name || convo.id}: ${err.data?.error || err.message}`);
        }
      }
    }

    return channelDigests;
  }

  // ── Get messages from the last N hours ─────────────────────────────
  async getMessagesSince(hours = 24) {
    const oldest = String(Date.now() / 1000 - hours * 3600);
    const convos = await this.getConversations();
    const channelDigests = [];

    for (const convo of convos) {
      try {
        const messages = await this.getMessages(convo.id, { oldest });
        if (messages.length === 0) continue;

        const userIds = messages.map((m) => m.user).filter(Boolean);
        const names = await this.resolveUserNames(userIds);

        channelDigests.push({
          channel: convo.name || convo.id,
          channelId: convo.id,
          isDM: convo.is_im || convo.is_mpim,
          dmUserId: convo.user,
          messageCount: messages.length,
          messages: messages.reverse().map((m) => ({
            user: names[m.user] || m.user,
            text: m.text,
            ts: m.ts,
          })),
        });
      } catch (err) {
        if (err.data?.error !== "not_in_channel") {
          console.warn(`Skipping ${convo.name || convo.id}: ${err.data?.error || err.message}`);
        }
      }
    }

    return channelDigests;
  }
}

module.exports = SlackFetcher;
