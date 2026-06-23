import { resolveAuth, atlassianFetch, htmlToText } from "../atlassian.ts";
import type { AtlassianAuth } from "../atlassian.ts";
import { makeId } from "../achievement.ts";
import type { Achievement } from "../achievement.ts";
import type { Collector, CollectOptions, CollectResult } from "./registry.ts";

/**
 * Confluence collector: pages and blog posts you created in the period, via the
 * Confluence Cloud REST API and a CQL query. Shares credential resolution with
 * the Jira collector (same Atlassian token).
 */
export const confluence: Collector = {
  name: "confluence",

  async collect({ since, until, spaces = [], includeUpdated = false }: CollectOptions): Promise<CollectResult> {
    const auth = resolveAuth();
    if ("error" in auth) return { achievements: [], errors: [`confluence: ${auth.error}`] };

    const space = spaces?.length ? `space IN (${spaces.map((s) => `"${s}"`).join(", ")}) AND ` : "";
    const errors: string[] = [];
    const achievements: Achievement[] = [];

    // Pages/blogs you created.
    try {
      const created = await searchAll(
        auth,
        `${space}creator = currentUser() AND created >= "${day(since)}" AND created <= "${day(until)}" ORDER BY created DESC`
      );
      achievements.push(...created.map((r) => toAchievement(auth.site, r, "created")));
    } catch (e) {
      return { achievements: [], errors: [`confluence search failed: ${(e as Error).message}`] };
    }

    // Optional: pages you contributed edits to but didn't create (avoids dupes).
    if (includeUpdated) {
      try {
        const updated = await searchAll(
          auth,
          `${space}contributor = currentUser() AND creator != currentUser() AND lastmodified >= "${day(since)}" AND lastmodified <= "${day(until)}" ORDER BY lastmodified DESC`
        );
        achievements.push(...updated.map((r) => toAchievement(auth.site, r, "updated")));
      } catch (e) {
        errors.push(`confluence updated-pages search failed: ${(e as Error).message}`);
      }
    }

    return { achievements, errors };
  },
};

const EXPAND = "space,history.lastUpdated,body.view,metadata.labels";

/** Page through CQL results using start/limit. */
async function searchAll(auth: AtlassianAuth, cql: string): Promise<any[]> {
  const limit = 50;
  const out: any[] = [];
  for (let start = 0; ; start += limit) {
    const page = await atlassianFetch(auth, "/wiki/rest/api/content/search", {
      query: { cql, limit, start, expand: EXPAND },
    });
    const results = page.results || [];
    out.push(...results);
    if (results.length < limit) break;
  }
  return out;
}

function toAchievement(site: string, r: any, kind: "created" | "updated"): Achievement {
  const isBlog = r.type === "blogpost";
  const noun = isBlog ? "blog" : "page";
  const type = `${noun}_${kind}`;
  const spaceKey = r.space?.key || "unknown";
  const spaceName = r.space?.name || "Unknown Space";
  const labels: string[] = (r.metadata?.labels?.results || []).map((l: any) => l.name);
  const bodyExcerpt = htmlToText(r.body?.view?.value || "").slice(0, 2000);
  const date = r.history?.lastUpdated?.when || r.history?.createdDate || new Date().toISOString();

  const lines = [
    `**Space**: ${spaceName} (${spaceKey})`,
    `**Type**: ${isBlog ? "Blog Post" : "Page"}`,
    labels.length && `**Labels**: ${labels.join(", ")}`,
    bodyExcerpt && `\n${bodyExcerpt.slice(0, 1000)}${bodyExcerpt.length > 1000 ? "…" : ""}`,
  ].filter(Boolean);

  return {
    id: makeId("confluence", type, r.id),
    source: "confluence",
    type,
    title: `${kind === "updated" ? "Updated: " : ""}${r.title}`,
    description: lines.join("\n"),
    url: `https://${site}/wiki${r._links?.webui || `/pages/${r.id}`}`,
    date,
    tags: ["confluence", spaceKey, r.type, kind, ...labels],
    metadata: { pageId: r.id, pageType: r.type, space: spaceKey, spaceName, labels },
  };
}

function day(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}
