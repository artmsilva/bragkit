import { resolveAuth, atlassianFetch, adfToText } from "../atlassian.ts";
import type { AtlassianAuth } from "../atlassian.ts";
import { makeId } from "../achievement.ts";
import type { Achievement } from "../achievement.ts";
import type { Collector, CollectOptions, CollectResult } from "./registry.ts";

/**
 * Jira collector: issues you resolved in the period, via the Jira Cloud REST
 * API (no `acli` binary required). Auth and token resolution come from the
 * shared Atlassian module.
 *
 * Uses the current enhanced search endpoint (`/rest/api/3/search/jql`) with
 * token pagination; the legacy `/rest/api/3/search` was removed in 2025.
 */
export const jira: Collector = {
  name: "jira",

  async collect({ since, until, projects = [], includeCreated = false }: CollectOptions): Promise<CollectResult> {
    const auth = resolveAuth();
    if ("error" in auth) return { achievements: [], errors: [`jira: ${auth.error}`] };

    const proj = projects?.length ? `project IN (${projects.map((p) => `"${p}"`).join(", ")}) AND ` : "";
    const errors: string[] = [];
    const achievements: Achievement[] = [];

    // Issues you resolved (the default signal).
    try {
      const resolved = await searchAll(
        auth,
        `${proj}assignee = currentUser() AND resolved >= "${day(since)}" AND resolved <= "${day(until)}" ORDER BY resolved DESC`
      );
      achievements.push(...resolved.map((issue) => toAchievement(auth.site, issue, "resolved")));
    } catch (e) {
      return { achievements: [], errors: [`jira search failed: ${(e as Error).message}`] };
    }

    // Optional: issues you created (reporter).
    if (includeCreated) {
      try {
        const created = await searchAll(
          auth,
          `${proj}reporter = currentUser() AND created >= "${day(since)}" AND created <= "${day(until)}" ORDER BY created DESC`
        );
        achievements.push(...created.map((issue) => toAchievement(auth.site, issue, "created")));
      } catch (e) {
        errors.push(`jira created-issues search failed: ${(e as Error).message}`);
      }
    }

    return { achievements, errors };
  },
};

const FIELDS = [
  "summary", "description", "status", "issuetype", "priority", "project",
  "created", "resolutiondate", "updated", "labels", "components", "parent",
  "customfield_10016", "customfield_10026", "customfield_10033", // story points (varies by site)
];

/** Page through all matching issues using nextPageToken. */
async function searchAll(auth: AtlassianAuth, jql: string): Promise<any[]> {
  const all: any[] = [];
  let nextPageToken: string | undefined;
  do {
    const body = { jql, fields: FIELDS, maxResults: 100, ...(nextPageToken ? { nextPageToken } : {}) };
    const page = await atlassianFetch(auth, "/rest/api/3/search/jql", { method: "POST", body });
    all.push(...(page.issues || []));
    nextPageToken = page.isLast ? undefined : page.nextPageToken;
  } while (nextPageToken);
  return all;
}

function toAchievement(site: string, issue: any, kind: "resolved" | "created"): Achievement {
  const f = issue.fields || {};
  const projectKey = f.project?.key || issue.key.split("-")[0];
  const projectName = f.project?.name || projectKey;
  const labels: string[] = f.labels || [];
  const components: string[] = (f.components || []).map((c: any) => c.name);
  const storyPoints = f.customfield_10033 ?? f.customfield_10016 ?? f.customfield_10026;
  const descriptionText = adfToText(f.description);

  const lines = [
    `**Type**: ${f.issuetype?.name}`,
    `**Project**: ${projectName} (${projectKey})`,
    `**Status**: ${f.status?.name}`,
    f.priority?.name && `**Priority**: ${f.priority.name}`,
    storyPoints != null && `**Story Points**: ${storyPoints}`,
    labels.length && `**Labels**: ${labels.join(", ")}`,
    components.length && `**Components**: ${components.join(", ")}`,
    descriptionText && `\n${descriptionText.slice(0, 1000)}${descriptionText.length > 1000 ? "…" : ""}`,
  ].filter(Boolean);

  const tags = [
    "jira", projectKey,
    (f.issuetype?.name || "").toLowerCase().replace(/\s+/g, "-"),
    f.status?.statusCategory?.key,
    ...labels, ...components,
  ].filter(Boolean);
  if (f.issuetype?.hierarchyLevel === 1) tags.push("epic");
  if (kind === "created") tags.push("created");

  const type = kind === "created" ? "issue_created" : "issue_resolved";
  const date = kind === "created"
    ? (f.created || new Date().toISOString())
    : (f.resolutiondate || f.updated || new Date().toISOString());

  return {
    id: makeId("jira", type, issue.key),
    source: "jira",
    type,
    title: `${kind === "created" ? "Created: " : ""}${issue.key}: ${f.summary}`,
    description: lines.join("\n"),
    url: `https://${site}/browse/${issue.key}`,
    date,
    tags,
    metadata: {
      key: issue.key,
      issueType: f.issuetype?.name,
      status: f.status?.name,
      priority: f.priority?.name,
      project: projectKey,
      projectName,
      storyPoints,
      labels,
      components,
      parentKey: f.parent?.key,
    },
  };
}

/** Jira JQL date filters want bare YYYY-MM-DD. */
function day(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}
