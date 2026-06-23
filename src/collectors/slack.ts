import { makeId } from "../achievement.ts";
import type { Achievement } from "../achievement.ts";
import type { Collector, CollectOptions, CollectResult } from "./registry.ts";

/**
 * Slack collector. Two kinds of achievement:
 *   - message_engagement: your own messages that earned reactions (signal you
 *     said something the team valued)
 *   - kudos_received: messages from *others* that mention you with positive
 *     sentiment (recognition you can't easily recall at review time)
 *
 * Uses the Slack Web API with a user token (preferred) or bot token. Only scans
 * public channels you're a member of, and stores minimal data.
 */
export const slack: Collector = {
  name: "slack",

  async collect({ since, until, channels: channelFilter = [] }: CollectOptions): Promise<CollectResult> {
    const token = process.env.SLACK_USER_TOKEN || process.env.SLACK_BOT_TOKEN;
    if (!token) return { achievements: [], errors: ["slack: set SLACK_USER_TOKEN or SLACK_BOT_TOKEN."] };

    const errors: string[] = [];
    const me = await api(token, "auth.test");
    if (!me.ok) return { achievements: [], errors: [`slack auth failed: ${me.error}`] };
    const userId: string = me.user_id;

    const channelsRes = await api(token, "conversations.list", {
      types: "public_channel", exclude_archived: "true", limit: "200",
    });
    if (!channelsRes.ok) return { achievements: [], errors: [`slack channels failed: ${channelsRes.error}`] };
    let channels: any[] = (channelsRes.channels || []).filter((c: any) => c.is_member);
    if (channelFilter?.length) {
      const want = new Set(channelFilter.map((c) => c.toLowerCase().replace(/^#/, "")));
      channels = channels.filter((c: any) => want.has(c.name.toLowerCase()));
    }

    const oldest = String(Math.floor(new Date(since).getTime() / 1000));
    const latest = String(Math.floor(new Date(until).getTime() / 1000));

    const achievements: Achievement[] = [];
    for (const ch of channels) {
      const hist = await api(token, "conversations.history", { channel: ch.id, oldest, latest, limit: "200" });
      if (!hist.ok) { errors.push(`#${ch.name}: ${hist.error}`); continue; }

      for (const msg of hist.messages || []) {
        const reactions = countReactions(msg);
        const top = topReactions(msg);
        const mine = msg.user === userId && reactions >= ENGAGEMENT_MIN_REACTIONS;
        const kudos = msg.user !== userId && reactions >= KUDOS_MIN_REACTIONS && isLikelyKudos(msg.text, userId);
        if (!mine && !kudos) continue;

        // Canonical permalink (best-effort); fall back to a constructed archive URL.
        const url = (await getPermalink(token, ch.id, msg.ts)) ??
          `https://slack.com/archives/${ch.id}/p${msg.ts.replace(".", "")}`;

        // For your own thread-starting messages, pull a little thread context.
        let thread: string[] = [];
        if (mine && msg.reply_count > 0) thread = await getThreadReplies(token, ch.id, msg.ts);

        let description = `**Channel**: #${ch.name}\n**Reactions**: ${reactions} ${top.join(" ")}\n\n${cleanSlackText(msg.text)}`;
        if (thread.length) {
          description += `\n\n**Thread** (${thread.length} repl${thread.length === 1 ? "y" : "ies"}):\n` +
            thread.slice(0, 5).map((t) => `> ${t}`).join("\n");
        }

        achievements.push({
          id: makeId("slack", mine ? "message_engagement" : "kudos_received", `${ch.id}:${msg.ts.replace(".", "-")}`),
          source: "slack",
          type: mine ? "message_engagement" : "kudos_received",
          title: extractTitle(msg.text),
          description,
          url,
          date: new Date(parseFloat(msg.ts) * 1000).toISOString(),
          tags: ["slack", ch.name, mine ? "high-engagement" : "kudos", ...top.map((r) => r.replace(/:/g, ""))],
          metadata: {
            channelId: ch.id, channelName: ch.name, reactionCount: reactions, topReactions: top,
            fromUserId: msg.user, replyCount: msg.reply_count ?? 0, threadReplies: thread.slice(0, 10),
          },
        });
      }
      await sleep(100); // be gentle with rate limits
    }
    return { achievements, errors };
  },
};

/** A reaction entry on a Slack message. */
interface SlackReaction {
  name: string;
  count: number;
}

/** Minimal shape of a Slack message used by the pure helpers. */
interface SlackMessage {
  reactions?: SlackReaction[];
  text?: string;
  user?: string;
  ts?: string;
}

// Reaction thresholds: your own messages need real traction (3+); kudos from
// others only need one reaction to confirm it's a genuine shout-out.
const ENGAGEMENT_MIN_REACTIONS = 3;
const KUDOS_MIN_REACTIONS = 1;

/** Resolve a message's canonical permalink (best-effort; null on failure). */
async function getPermalink(token: string, channel: string, ts: string): Promise<string | null> {
  const r = await api(token, "chat.getPermalink", { channel, message_ts: ts });
  return r.ok ? r.permalink : null;
}

/** Fetch up to 50 thread replies (excluding the parent), cleaned. */
async function getThreadReplies(token: string, channel: string, ts: string): Promise<string[]> {
  const r = await api(token, "conversations.replies", { channel, ts, limit: "50" });
  if (!r.ok || !Array.isArray(r.messages)) return [];
  return r.messages.slice(1).map((m: any) => cleanSlackText(m.text));
}

// ── Slack Web API ──────────────────────────────────────────────────────────
/** @returns parsed Slack response, or {ok:false,error} on failure */
async function api(token: string, method: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`https://slack.com/api/${method}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data: any = await res.json();
    return data.ok ? data : { ok: false, error: data.error || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ── pure helpers (unit-tested) ───────────────────────────────────────────────
export function countReactions(msg: SlackMessage): number {
  return (msg.reactions || []).reduce((sum, r) => sum + (r.count || 0), 0);
}

export function topReactions(msg: SlackMessage, limit = 3): string[] {
  return [...(msg.reactions || [])]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((r) => `:${r.name}:`);
}

export function cleanSlackText(text = ""): string {
  return text
    .replace(/<@[A-Z0-9]+>/g, "@user")
    .replace(/<#[A-Z0-9]+\|([^>]+)>/g, "#$1")
    .replace(/<([^|>]+)\|([^>]+)>/g, "$2")
    .replace(/<([^>]+)>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

export function extractTitle(text = "", maxLength = 100): string {
  const clean = cleanSlackText(text.split("\n")[0]).replace(/[*_~`]/g, "").trim();
  if (!clean) return "Slack message";
  return clean.length > maxLength ? clean.slice(0, maxLength - 1) + "…" : clean;
}

const KUDOS_KEYWORDS = [
  "thank", "thanks", "thx", "great", "awesome", "amazing", "excellent", "fantastic",
  "nice", "good job", "well done", "kudos", "props", "shoutout", "shout out",
  "appreciate", "grateful", "helped", "helpful", "lifesaver", "brilliant", "genius",
  "hero", "rockstar", "superstar", "legend", "impressive", "incredible", "outstanding",
  "congrats", "congratulations", "love", "loved",
  ":tada:", ":clap:", ":raised_hands:", ":pray:", ":heart:", ":fire:", ":100:",
  ":star:", ":trophy:", ":rocket:", ":boom:",
];

/** Heuristic: a message from someone else that mentions you, positively. */
export function isLikelyKudos(text = "", userId: string): boolean {
  if (!text.includes(`<@${userId}>`)) return false;
  const lower = text.toLowerCase();
  return KUDOS_KEYWORDS.some((k) => lower.includes(k));
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
