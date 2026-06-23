import { spawnSync } from "node:child_process";
import { makeId } from "../achievement.ts";
import type { Achievement } from "../achievement.ts";
import type { Collector, CollectOptions, CollectResult } from "./registry.ts";

/**
 * Reference collector: your merged GitHub pull requests, via the `gh` CLI.
 *
 * We shell out to `gh` rather than calling the REST API directly for one
 * reason: `gh` is almost certainly already authenticated on the user's machine,
 * so the collector needs no token, no secret storage, and no OAuth dance — the
 * single biggest friction point in "just run it" tooling. This keeps bragkit's
 * core dependency-free *and* zero-config.
 */
export const github: Collector = {
  name: "github",

  /**
   * - `enrich: true` fetches per-PR additions/deletions/reviews via GraphQL
   *   (one API call per PR — accurate but slower). Off by default.
   * - `repos: ["owner/name", …]` restricts collection to those repositories.
   */
  async collect({ since, until, enrich = false, repos = [] }: CollectOptions): Promise<CollectResult> {
    const errors: string[] = [];
    if (!hasGh()) {
      return { achievements: [], errors: ["`gh` CLI not found or not authenticated. Install it and run `gh auth login`."] };
    }

    const range = `${isoDay(since)}..${isoDay(until)}`;
    const repoQualifiers = (repos || []).map((r) => `repo:${r}`);

    const achievements: Achievement[] = [];

    // Merged PRs you authored.
    const prs = runGh(
      ["search", "prs", "--author=@me", "--merged", `--merged-at=${range}`,
       "--limit", "200", "--json", "number,title,url,closedAt,repository", ...repoQualifiers],
      errors
    );
    for (const pr of prs || []) {
      const repo = pr.repository?.nameWithOwner ?? pr.repository?.name ?? "unknown";
      const a: Achievement = {
        id: makeId("github", "pr_merged", `${repo}:${pr.number}`),
        source: "github",
        type: "pr_merged",
        title: pr.title,
        description: "",
        url: pr.url,
        date: pr.closedAt,
        tags: ["pull-request", repo],
        metadata: { repository: repo, number: pr.number },
      };

      if (enrich) {
        const [owner, name] = repo.split("/");
        const d = name ? fetchPRDetails(owner, name, pr.number) : null;
        if (d) {
          const approvals = (d.reviews?.nodes || []).filter((r: any) => r.state === "APPROVED").length;
          a.metadata = {
            ...a.metadata,
            additions: d.additions,
            deletions: d.deletions,
            changedFiles: d.changedFiles,
            commits: d.commits?.totalCount,
            reviewDecision: d.reviewDecision,
            approvals,
          };
          a.description = [
            `**Changes**: +${d.additions} / -${d.deletions} (${d.changedFiles} files)`,
            d.commits?.totalCount != null && `**Commits**: ${d.commits.totalCount}`,
            d.reviewDecision && `**Review**: ${d.reviewDecision}`,
            approvals && `**Approvals**: ${approvals}`,
          ].filter(Boolean).join("\n");
        }
      }
      achievements.push(a);
    }

    // Closed issues you authored — completes the GitHub achievement surface.
    const issues = runGh(
      ["search", "issues", "--author=@me", "--state", "closed", `--closed=${range}`,
       "--limit", "200", "--json", "number,title,url,closedAt,repository", ...repoQualifiers],
      errors
    );
    for (const issue of issues || []) {
      const repo = issue.repository?.nameWithOwner ?? issue.repository?.name ?? "unknown";
      achievements.push({
        id: makeId("github", "issue_closed", `${repo}:${issue.number}`),
        source: "github",
        type: "issue_closed",
        title: issue.title,
        description: "",
        url: issue.url,
        date: issue.closedAt,
        tags: ["issue", repo],
        metadata: { repository: repo, number: issue.number },
      });
    }

    return { achievements, errors };
  },
};

/**
 * Fetch per-PR stats via the GitHub GraphQL API (through `gh api graphql`).
 * Returns null on any failure — enrichment is always best-effort.
 */
function fetchPRDetails(owner: string, repo: string, number: number): any | null {
  const query = `query {
    repository(owner: "${owner}", name: "${repo}") {
      pullRequest(number: ${number}) {
        additions deletions changedFiles
        commits { totalCount }
        reviewDecision
        reviews(first: 20) { nodes { state } }
      }
    }
  }`;
  const r = spawnSync("gh", ["api", "graphql", "-f", `query=${query}`], { encoding: "utf8" });
  if (r.status !== 0) return null;
  try {
    return JSON.parse(r.stdout)?.data?.repository?.pullRequest ?? null;
  } catch {
    return null;
  }
}

function hasGh(): boolean {
  const r = spawnSync("gh", ["auth", "status"], { encoding: "utf8" });
  return r.status === 0;
}

function runGh(args: string[], errors: string[]): any {
  const r = spawnSync("gh", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0) {
    errors.push(`gh ${args[0]} ${args[1]} failed: ${(r.stderr || "").trim() || "unknown error"}`);
    return null;
  }
  try {
    return JSON.parse(r.stdout || "[]");
  } catch (e) {
    errors.push(`Could not parse gh JSON output: ${(e as Error).message}`);
    return null;
  }
}

/** gh's date filters want a bare YYYY-MM-DD, not a full ISO timestamp. */
function isoDay(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}
