/**
 * summarizer.js
 * Sends batched Slack messages to Claude and returns a structured digest.
 */

const Anthropic = require("@anthropic-ai/sdk");

class Summarizer {
  constructor(apiKey) {
    this.client = new Anthropic({ apiKey });
  }

  // ── Format channel digests into a prompt-friendly string ───────────
  _formatForPrompt(channelDigests) {
    return channelDigests
      .map((ch) => {
        const label = ch.isDM ? `DM with ${ch.messages[0]?.user || "someone"}` : `#${ch.channel}`;
        const msgs = ch.messages
          .map((m) => {
            const time = new Date(parseFloat(m.ts) * 1000).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            });
            return `  [${time}] ${m.user}: ${m.text}`;
          })
          .join("\n");
        return `── ${label} (${ch.messageCount} messages) ──\n${msgs}`;
      })
      .join("\n\n");
  }

  // ── Summarize a batch of channel digests ───────────────────────────
  async summarize(channelDigests, { mode = "catchup" } = {}) {
    if (!channelDigests.length) {
      return "🎉 You're all caught up — nothing new across your channels or DMs.";
    }

    const formatted = this._formatForPrompt(channelDigests);
    const totalMessages = channelDigests.reduce((s, c) => s + c.messageCount, 0);

    const modeInstructions = {
      catchup: `You are summarizing UNREAD Slack messages the user missed. 
Focus on what they need to know RIGHT NOW — decisions made, questions awaiting their response, and anything urgent.`,
      daily: `You are writing an END-OF-DAY digest of ALL Slack activity. 
Give a broader picture of what happened today — key discussions, decisions, notable updates, and anything that needs follow-up tomorrow.`,
      timerange: `You are summarizing Slack messages from a SPECIFIC TIME WINDOW the user requested.
Highlight anything important, decisions made, questions asked, and action items.`,
    };

    const systemPrompt = `You are the personal Slack digest assistant for Nathaniel, co-Executive Producer of Chapman News (CNEWS). You know the context of a university broadcast newsroom — story pitches, rundowns, packages, live shots, anchoring, editing bays, etc.

${modeInstructions[mode] || modeInstructions.catchup}

FORMAT YOUR RESPONSE EXACTLY LIKE THIS:

📊 **Overview**
[1-2 sentences: how many channels, DMs, total messages, and general vibe]

🔥 **Needs Your Attention**
[Bullet list of items that require Nathaniel's direct response or decision. Include WHO is asking and WHAT channel. If nothing, say "Nothing urgent right now."]

📋 **Action Items / To-Do**
[Bullet list of concrete tasks extracted from messages — things to do, follow up on, or delegate. Tag each with the source channel/person.]

💬 **Channel Summaries**
[For each channel with activity, a 1-3 sentence summary. Group DMs separately from channels. Skip channels with only trivial chatter unless something notable was said.]

💡 **FYI / Low Priority**
[Anything interesting but not urgent — casual conversations, fun stuff, things Nathaniel might want to know but doesn't need to act on.]

RULES:
- Be concise. This is a busy EP who needs to scan quickly.
- Use real names, not user IDs.
- If someone asked Nathaniel a direct question, put it in "Needs Your Attention" with the exact question.
- Don't editorialize — just report what was said.
- Use timestamps when referencing specific messages.`;

    const response = await this.client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Here are ${totalMessages} messages across ${channelDigests.length} conversations:\n\n${formatted}`,
        },
      ],
    });

    return response.content[0].text;
  }
}

module.exports = Summarizer;
