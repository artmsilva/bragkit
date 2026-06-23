// bragkit dashboard — vanilla ES module, Baseline web-platform features only
// (fetch, modules, top-level await, Intl, structuredClone). No framework, no
// build-time data: it reads the JSON that `brag export` writes. Bootstrap is
// loaded from a CDN, so it isn't even an npm dependency.

import { impactScore } from "../src/reports/impact.ts";
import { groupByMonth } from "../src/reports/trends.ts";
import { render as renderTemplate, templates } from "../src/reports/markdown.ts";

const fmt = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" });

/** Load real export if present, else the committed fake sample. */
async function loadData() {
  for (const url of ["./achievements.json", "./achievements.sample.json"]) {
    const res = await fetch(url, { cache: "no-store" }).catch(() => null);
    if (res?.ok) return { ...(await res.json()), _source: url };
  }
  return { achievements: [], stats: { total: 0, bySource: {}, byType: {} }, _source: null };
}

const data = await loadData();
const all = data.achievements ?? [];

// ── render stats cards ───────────────────────────────────────────────────
const statsEl = document.querySelector("#stats");
const kudosCount = all.filter((a) => a.type === "kudos_received").length;
const cards = [
  ["Achievements", data.stats?.total ?? all.length, "bi-trophy"],
  ["Sources", Object.keys(data.stats?.bySource ?? {}).length, "bi-diagram-3"],
  ["Kudos", kudosCount, "bi-heart"],
  ["Most recent", all[0] ? fmt.format(new Date(all[0].date)) : "—", "bi-clock-history"],
];
statsEl.innerHTML = cards
  .map(
    ([label, value, icon]) => `
    <div class="col-6 col-md-3">
      <div class="card h-100"><div class="card-body">
        <div class="text-secondary small text-uppercase">${label}</div>
        <div class="stat-num">${value}</div>
        <i class="bi ${icon} text-secondary"></i>
      </div></div>
    </div>`
  )
  .join("");

// ── activity-by-month sparkline ───────────────────────────────────────────
const buckets = groupByMonth(all);
if (buckets.length > 1) {
  document.querySelector("#trend").classList.remove("d-none");
  const max = Math.max(...buckets.map((b) => b.count));
  document.querySelector("#trend-bars").innerHTML = buckets
    .map((b) => {
      const h = Math.max(2, Math.round((b.count / max) * 64)); // px, fits the 90px row
      return `<div class="flex-fill d-flex flex-column justify-content-end align-items-center" title="${escapeHtml(b.month)}: ${b.count}">
        <div class="bg-info rounded-top w-100" style="height:${h}px" aria-hidden="true"></div>
        <small class="text-secondary" style="font-size:.6rem">${escapeHtml(b.month.slice(2))}</small>
      </div>`;
    })
    .join("");
}

// ── top achievements by impact ───────────────────────────────────────────
const topWrap = document.querySelector("#top-impact");
const topList = document.querySelector("#top-impact-list");
const ranked = [...all].sort((a, b) => impactScore(b) - impactScore(a)).slice(0, 5);
if (ranked.length) {
  topWrap.classList.remove("d-none");
  topList.innerHTML = ranked
    .map((a) => {
      const href = safeUrl(a.url);
      const title = href
        ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener" class="link-body-emphasis text-decoration-none">${escapeHtml(a.title)}</a>`
        : escapeHtml(a.title);
      return `<li class="list-group-item d-flex justify-content-between align-items-start gap-2">
        <span>${title} <small class="text-secondary">· ${escapeHtml(a.source)}</small></span>
        <span class="badge text-bg-success rounded-pill" title="impact score">${impactScore(a)}</span>
      </li>`;
    })
    .join("");
}

// ── report viewer (renders any markdown template in-page) ─────────────────
// all is newest-first (export uses ORDER BY date DESC), so first=until, last=since.
const period = all.length
  ? { since: all[all.length - 1].date, until: all[0].date }
  : { since: new Date(0).toISOString(), until: new Date(0).toISOString() };
const tplSel = document.querySelector("#report-template");
const reportOut = document.querySelector("#report-output");
for (const t of templates()) tplSel.append(new Option(t, t));
tplSel.value = templates().includes("executive-summary") ? "executive-summary" : templates()[0];
function renderReport() {
  try {
    reportOut.textContent = renderTemplate(tplSel.value, all, period); // textContent: no HTML injection
  } catch (e) {
    reportOut.textContent = `Could not render "${tplSel.value}": ${e?.message ?? e}`;
  }
}
tplSel.addEventListener("change", renderReport);
renderReport();

// ── populate filters ───────────────────────────────────────────────────────
const sourceSel = document.querySelector("#source");
const typeSel = document.querySelector("#type");
for (const s of [...new Set(all.map((a) => a.source))].sort()) sourceSel.append(new Option(s, s));
for (const t of [...new Set(all.map((a) => a.type))].sort()) typeSel.append(new Option(t, t));

// ── filtering + render ───────────────────────────────────────────────────
const searchEl = document.querySelector("#search");
const listEl = document.querySelector("#list");
const emptyEl = document.querySelector("#empty");

function render() {
  const q = searchEl.value.trim().toLowerCase();
  const src = sourceSel.value;
  const type = typeSel.value;

  const rows = all.filter(
    (a) =>
      (!src || a.source === src) &&
      (!type || a.type === type) &&
      (!q || a.title.toLowerCase().includes(q) || (a.tags ?? []).some((t) => t.toLowerCase().includes(q)))
  );

  emptyEl.classList.toggle("d-none", rows.length > 0);
  listEl.innerHTML = rows
    .map((a) => {
      const href = safeUrl(a.url);
      const title = href
        ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener" class="link-body-emphasis text-decoration-none stretched-link">${escapeHtml(a.title)}</a>`
        : escapeHtml(a.title);
      const tags = (a.tags ?? []).map((t) => `<span class="badge text-bg-secondary fw-normal">${escapeHtml(t)}</span>`).join(" ");
      return `
        <div class="list-group-item ach-row position-relative">
          <div class="d-flex justify-content-between gap-3">
            <div class="fw-medium">${title}</div>
            <small class="text-secondary text-nowrap mono">${fmt.format(new Date(a.date))}</small>
          </div>
          <div class="d-flex justify-content-between align-items-center mt-1">
            <small class="text-secondary"><i class="bi bi-tag"></i> ${escapeHtml(a.type)}</small>
            <div class="d-flex gap-1 flex-wrap">${tags}</div>
          </div>
        </div>`;
    })
    .join("");
}

for (const el of [searchEl, sourceSel, typeSel]) el.addEventListener("input", render);
render();

// ── theme toggle (persisted) ─────────────────────────────────────────────
const root = document.documentElement;
const saved = localStorage.getItem("bragkit-theme");
if (saved) root.setAttribute("data-bs-theme", saved);
document.querySelector("#theme").addEventListener("click", () => {
  const next = root.getAttribute("data-bs-theme") === "dark" ? "light" : "dark";
  root.setAttribute("data-bs-theme", next);
  localStorage.setItem("bragkit-theme", next);
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/** Only allow http(s) links through — blocks javascript:/data: schemes from
 *  untrusted collector data. Returns "" for anything unsafe or unparseable. */
function safeUrl(url) {
  if (!url) return "";
  try {
    const u = new URL(url, location.origin);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : "";
  } catch {
    return "";
  }
}
