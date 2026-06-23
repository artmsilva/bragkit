import { spawnSync } from "node:child_process";

/**
 * Shared Atlassian (Jira + Confluence) plumbing: credential resolution, an
 * authenticated `fetch`, and the text extractors for ADF and HTML bodies.
 *
 * Credential resolution is designed to stay portable — no app registration,
 * just credentials you likely already have. Token precedence:
 *   1. an explicit env var (ATLASSIAN_API_TOKEN / JIRA_API_TOKEN / CONFLUENCE_API_TOKEN)
 *   2. 1Password, if BRAGKIT_OP_TOKEN_REF points at an `op://…` item
 *      and the `op` CLI is installed and signed in
 */
export interface AtlassianAuth {
  /** e.g. "your-org.atlassian.net" */
  site: string;
  /** account email used for Basic auth */
  email: string;
  /** API token */
  token: string;
}

export type AuthResult = AtlassianAuth | { error: string };

/** Resolve Atlassian credentials from the environment (and optionally 1Password). */
export function resolveAuth(): AuthResult {
  const site = process.env.ATLASSIAN_SITE || process.env.JIRA_SITE || process.env.CONFLUENCE_CLOUD_ID;
  const email = process.env.ATLASSIAN_EMAIL || process.env.JIRA_EMAIL || process.env.CONFLUENCE_EMAIL;
  const token = resolveToken();

  if (!site) return { error: "Set ATLASSIAN_SITE (e.g. your-org.atlassian.net)." };
  if (!email) return { error: "Set ATLASSIAN_EMAIL to the account email used for the API token." };
  if (!token) {
    return {
      error:
        "No API token found. Set ATLASSIAN_API_TOKEN, or set BRAGKIT_OP_TOKEN_REF " +
        "to a 1Password reference (and sign in with `op`).",
    };
  }
  return { site: normalizeSite(site), email, token };
}

function resolveToken(): string | undefined {
  const fromEnv =
    process.env.ATLASSIAN_API_TOKEN || process.env.JIRA_API_TOKEN || process.env.CONFLUENCE_API_TOKEN;
  if (fromEnv) return fromEnv;

  // Optional 1Password resolution — only attempted when explicitly opted in via
  // BRAGKIT_OP_TOKEN_REF, so generic users are never forced into `op`.
  const ref = process.env.BRAGKIT_OP_TOKEN_REF;
  if (ref) {
    const r = spawnSync("op", ["read", ref], { encoding: "utf8" });
    if (r.status === 0) return r.stdout.trim();
  }
  return undefined;
}

/** Accept either "org.atlassian.net" or a bare "org" tenant slug. */
function normalizeSite(site: string): string {
  return site.includes(".") ? site : `${site}.atlassian.net`;
}

/** Build the HTTP Basic Authorization header value. */
export function basicAuthHeader(email: string, token: string): string {
  return `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
}

interface FetchOpts {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number>;
}

/** Authenticated JSON fetch against an Atlassian host. Returns parsed JSON. */
export async function atlassianFetch(auth: AtlassianAuth, path: string, opts: FetchOpts = {}): Promise<any> {
  const url = new URL(`https://${auth.site}${path}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, String(v));

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: basicAuthHeader(auth.email, auth.token),
      Accept: "application/json",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Atlassian ${res.status} ${res.statusText} on ${path}${detail ? ` — ${detail.slice(0, 200)}` : ""}`);
  }
  return res.json();
}

interface AdfNode {
  type?: string;
  text?: string;
  content?: AdfNode[];
}

/**
 * Flatten Atlassian Document Format (ADF) into readable plain text / light
 * markdown. Ported from the original brag-book Jira collector.
 */
export function adfToText(node: AdfNode | string | null | undefined): string {
  if (!node) return "";
  if (typeof node === "string") return node;

  switch (node.type) {
    case "text":
      return node.text || "";
    case "heading":
      return "## " + childrenText(node, "");
    case "paragraph":
      return childrenText(node, "");
    case "bulletList":
      return (node.content || []).map((item) => "• " + adfToText(item)).join("\n");
    case "orderedList":
      return (node.content || []).map((item, i) => `${i + 1}. ` + adfToText(item)).join("\n");
    case "listItem":
      return childrenText(node, "");
    case "codeBlock":
      return "```\n" + childrenText(node, "") + "\n```";
    case "doc":
      return childrenText(node, "\n");
    default:
      return Array.isArray(node.content) ? childrenText(node, "\n") : "";
  }
}

function childrenText(node: AdfNode, sep: string): string {
  return (node.content || []).map((n) => adfToText(n)).join(sep);
}

/** Strip HTML to plain text (Confluence storage/view bodies). */
export function htmlToText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
