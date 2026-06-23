import { DatabaseSync } from "node:sqlite";
import { normalize, type Achievement, type RawAchievement } from "./achievement.ts";
import { autoTag } from "./tagging.ts";
import { computeMetrics, type Metrics } from "./reports/impact.ts";

export interface QueryOptions {
  source?: string;
  type?: string;
  since?: string;
  until?: string;
  limit?: number;
}

export interface Stats {
  total: number;
  bySource: Record<string, number>;
  byType: Record<string, number>;
}

export interface CollectionRun {
  id: number;
  source: string;
  since: string;
  until: string;
  collected: number;
  status: "success" | "partial";
  errors: string[];
  created_at: string;
}

/**
 * SQLite-backed store for achievements, built on Node's built-in `node:sqlite`
 * (no native module to compile, no dependency to install). One row per
 * achievement; writes are idempotent upserts keyed on the stable id, so
 * re-collecting a period never produces duplicates.
 */
export class Store {
  #db: DatabaseSync;

  /** @param path File path, or omit/":memory:" for an ephemeral DB. */
  constructor(path = ":memory:") {
    this.#db = new DatabaseSync(path);
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS achievements (
        id          TEXT PRIMARY KEY,
        source      TEXT NOT NULL,
        type        TEXT NOT NULL,
        title       TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        url         TEXT NOT NULL DEFAULT '',
        date        TEXT NOT NULL,
        tags        TEXT NOT NULL DEFAULT '[]',
        metadata    TEXT NOT NULL DEFAULT '{}',
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ach_date   ON achievements(date);
      CREATE INDEX IF NOT EXISTS idx_ach_source ON achievements(source);

      CREATE TABLE IF NOT EXISTS collection_runs (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        source     TEXT NOT NULL,
        since      TEXT NOT NULL,
        until      TEXT NOT NULL,
        collected  INTEGER NOT NULL,
        status     TEXT NOT NULL,
        errors     TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL
      );
    `);
  }

  /**
   * Insert or update one achievement. On conflict the row is refreshed but its
   * original `created_at` is preserved, so first-seen time stays meaningful.
   */
  upsert(raw: RawAchievement): Achievement {
    const a = autoTag(normalize(raw));
    const now = new Date().toISOString();
    this.#db
      .prepare(
        `INSERT INTO achievements
           (id, source, type, title, description, url, date, tags, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           source=excluded.source, type=excluded.type, title=excluded.title,
           description=excluded.description, url=excluded.url, date=excluded.date,
           tags=excluded.tags, metadata=excluded.metadata, updated_at=excluded.updated_at`
      )
      .run(
        a.id, a.source, a.type, a.title, a.description, a.url, a.date,
        JSON.stringify(a.tags), JSON.stringify(a.metadata), now, now
      );
    return a;
  }

  /** Upsert many; returns the count written. */
  upsertMany(list: readonly RawAchievement[]): number {
    let n = 0;
    for (const a of list) {
      this.upsert(a);
      n++;
    }
    return n;
  }

  /** Query achievements, newest first. */
  query(opts: QueryOptions = {}): Achievement[] {
    const where: string[] = [];
    const params: string[] = [];
    if (opts.source) { where.push("source = ?"); params.push(opts.source); }
    if (opts.type) { where.push("type = ?"); params.push(opts.type); }
    if (opts.since) { where.push("date >= ?"); params.push(opts.since); }
    if (opts.until) { where.push("date <= ?"); params.push(opts.until); }
    const sql =
      `SELECT * FROM achievements` +
      (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
      ` ORDER BY date DESC` +
      (opts.limit ? ` LIMIT ${Number(opts.limit)}` : "");
    const rows = this.#db.prepare(sql).all(...params) as Array<Record<string, string>>;
    return rows.map(rowToAchievement);
  }

  /** Aggregate counts for a period: totals plus breakdowns by source and type. */
  stats(opts: QueryOptions = {}): Stats {
    const rows = this.query(opts);
    const bySource: Record<string, number> = {};
    const byType: Record<string, number> = {};
    for (const a of rows) {
      bySource[a.source] = (bySource[a.source] ?? 0) + 1;
      byType[a.type] = (byType[a.type] ?? 0) + 1;
    }
    return { total: rows.length, bySource, byType };
  }

  /**
   * Quantified impact metrics for a period — the numbers a compensation or
   * promo case is built on.
   */
  metrics(opts: QueryOptions = {}): Metrics {
    return computeMetrics(this.query(opts));
  }

  /** Record one collection run for the audit trail. */
  recordRun(run: { source: string; since: string; until: string; collected: number; errors?: string[] }): void {
    const errors = run.errors ?? [];
    this.#db
      .prepare(
        `INSERT INTO collection_runs (source, since, until, collected, status, errors, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(run.source, run.since, run.until, run.collected,
           errors.length ? "partial" : "success", JSON.stringify(errors), new Date().toISOString());
  }

  /** Recent collection runs, newest first. */
  runs(limit = 20): CollectionRun[] {
    const rows = this.#db
      .prepare(`SELECT * FROM collection_runs ORDER BY id DESC LIMIT ?`)
      .all(Number(limit)) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: Number(r.id),
      source: String(r.source),
      since: String(r.since),
      until: String(r.until),
      collected: Number(r.collected),
      status: r.status as "success" | "partial",
      errors: JSON.parse(String(r.errors)),
      created_at: String(r.created_at),
    }));
  }

  /** ISO date of the last successful collection for a source, or null. */
  lastSuccess(source: string): string | null {
    const row = this.#db
      .prepare(`SELECT until FROM collection_runs WHERE source=? AND status='success' ORDER BY id DESC LIMIT 1`)
      .get(source) as { until?: string } | undefined;
    return row?.until ?? null;
  }

  close(): void {
    this.#db.close();
  }
}

/** Rehydrate a DB row (JSON columns are stored as text) into an Achievement. */
function rowToAchievement(row: Record<string, string>): Achievement {
  return {
    id: row.id,
    source: row.source,
    type: row.type,
    title: row.title,
    description: row.description,
    url: row.url,
    date: row.date,
    tags: JSON.parse(row.tags),
    metadata: JSON.parse(row.metadata),
  };
}
