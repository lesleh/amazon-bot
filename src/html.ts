import { resizedImageUrl } from "./images.ts";
import type { Candidate, ShoppingReport } from "./shopping-report.ts";

export interface RunDetails {
  request: string;
  generatedAt: Date;
  model: string;
  canopyRequests: number;
  budget: number;
  replayed: boolean;
  modelCostUsd?: number;
}

type ReportCandidate = ShoppingReport["candidates"][number];

const escapeHtml = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

// Only web links become hrefs, so a report cannot smuggle in a javascript: URL.
const safeUrl = (url: string) =>
  /^https?:\/\//i.test(url) ? escapeHtml(url) : "#";

const hostname = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const SEVERITY_LABELS = {
  serious: "Serious",
  moderate: "Moderate",
  minor: "Minor",
} as const;

// A transparent pixel replaces an image Amazon no longer serves, so no broken-image icon shows.
const BLANK =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

function image(candidate: ReportCandidate, size: number, className: string) {
  const src = candidate.imageUrl && resizedImageUrl(candidate.imageUrl, size);
  return src
    ? `<img class="${className}" src="${escapeHtml(src)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${BLANK}';this.classList.add('placeholder')">`
    : `<div class="${className} placeholder" aria-hidden="true"></div>`;
}

function stars(rating: number | null, count: number | null) {
  if (rating === null) return `<span class="muted">No rating</span>`;
  const countText =
    count === null
      ? ""
      : ` <span class="muted">(${count.toLocaleString("en-GB")})</span>`;
  return `<span class="rating"><span class="stars" style="--rating:${rating}" aria-hidden="true">★★★★★</span> ${rating.toFixed(1)}${countText}</span>`;
}

function hero(report: ShoppingReport) {
  const pick = report.candidates.find((c) => c.asin === report.recommendedAsin);
  if (!pick) {
    return `<section class="hero hero-none">
  <p class="eyebrow">No recommendation</p>
  <h2>${escapeHtml(report.headline)}</h2>
  <p class="lead">${escapeHtml(report.summary)}</p>
</section>`;
  }
  const chips = pick.facts
    .filter((f) => f.value.toLowerCase() !== "not found")
    .slice(0, 4)
    .map(
      (f) =>
        `<li><span class="chip-label">${escapeHtml(f.label)}</span> ${escapeHtml(f.value)}</li>`,
    )
    .join("");
  return `<section class="hero">
  <div class="hero-image">${image(pick, 500, "product-image")}</div>
  <div class="hero-body">
    <p class="eyebrow">Recommended</p>
    <h2>${escapeHtml(pick.name)}</h2>
    <p class="lead">${escapeHtml(report.summary)}</p>
    <dl class="stats">
      <div><dt>Price</dt><dd>${escapeHtml(pick.price)}</dd></div>
      <div><dt>Per unit</dt><dd>${escapeHtml(pick.pricePerUnit)}</dd></div>
      <div><dt>Rating</dt><dd>${stars(pick.rating, pick.ratingCount)}</dd></div>
      <div><dt>Sold by</dt><dd>${escapeHtml(pick.seller)}</dd></div>
    </dl>
    ${chips ? `<ul class="chips">${chips}</ul>` : ""}
    <a class="button" href="${safeUrl(pick.url)}">View on Amazon</a>
  </div>
</section>`;
}

function cell(value: string, source?: string) {
  const missing = value.toLowerCase() === "not found";
  return `<span class="${missing ? "missing" : ""}">${escapeHtml(value)}</span>${source ? `<span class="source">${escapeHtml(source)}</span>` : ""}`;
}

function comparison(report: ShoppingReport) {
  const { candidates } = report;
  if (candidates.length === 0) return "";
  const labels = [
    ...new Set(candidates.flatMap((c) => c.facts.map((f) => f.label))),
  ];
  const picked = (c: Candidate) =>
    c.asin === report.recommendedAsin ? ' class="picked"' : "";
  const row = (label: string, render: (c: ReportCandidate) => string) =>
    `<tr><th scope="row">${escapeHtml(label)}</th>${candidates.map((c) => `<td${picked(c)}>${render(c)}</td>`).join("")}</tr>`;

  return `<section>
  <h2 class="section-title">Side by side</h2>
  <div class="table-wrap">
    <table class="compare">
      <thead><tr><td></td>${candidates
        .map(
          (c) => `<th scope="col"${picked(c)}>
        <a href="${safeUrl(c.url)}">${image(c, 160, "thumb")}</a>
        <span class="rank">#${c.rank}</span>
        <a class="product-name" href="${safeUrl(c.url)}">${escapeHtml(c.name)}</a>
      </th>`,
        )
        .join("")}</tr></thead>
      <tbody>
        ${row("Price", (c) => cell(c.price))}
        ${row("Per unit", (c) => cell(c.pricePerUnit))}
        ${row("Rating", (c) => stars(c.rating, c.ratingCount))}
        ${row("Sold by", (c) => cell(c.seller))}
        ${labels
          .map((label) =>
            row(label, (c) => {
              const f = c.facts.find((fact) => fact.label === label);
              return f ? cell(f.value, f.source) : cell("not found");
            }),
          )
          .join("\n        ")}
        ${row("Verdict", (c) => `<span class="verdict">${escapeHtml(c.verdict)}</span>`)}
      </tbody>
    </table>
  </div>
</section>`;
}

function flags(report: ShoppingReport) {
  const { candidates } = report;
  if (candidates.length === 0) return "";
  return `<section>
  <h2 class="section-title">Red flags</h2>
  <div class="flag-grid">
    ${candidates
      .map(
        (
          c,
        ) => `<article class="card${c.asin === report.recommendedAsin ? " card-picked" : ""}">
      <header class="card-header">
        ${image(c, 120, "thumb-small")}
        <div>
          <span class="rank">#${c.rank}</span>
          <h3><a href="${safeUrl(c.url)}">${escapeHtml(c.name)}</a></h3>
        </div>
      </header>
      ${
        c.redFlags.length === 0
          ? `<p class="muted">No red flags found.</p>`
          : `<ul class="flags">${c.redFlags
              .map(
                (f) =>
                  `<li><span class="severity severity-${f.severity}">${SEVERITY_LABELS[f.severity]}</span><span>${escapeHtml(f.text)}</span></li>`,
              )
              .join("")}</ul>`
      }
    </article>`,
      )
      .join("\n    ")}
  </div>
</section>`;
}

function dropped(report: ShoppingReport) {
  if (report.dropped.length === 0) return "";
  return `<section>
  <h2 class="section-title">Dropped</h2>
  <ul class="dropped">
    ${report.dropped
      .map(
        (d) =>
          `<li><a href="${safeUrl(d.url)}">${escapeHtml(d.name)}</a><span>${escapeHtml(d.reason)}</span></li>`,
      )
      .join("\n    ")}
  </ul>
</section>`;
}

function list(title: string, items: string[]) {
  if (items.length === 0) return "";
  return `<div class="note">
    <h2 class="section-title">${escapeHtml(title)}</h2>
    <ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
  </div>`;
}

function sources(report: ShoppingReport) {
  if (report.sources.length === 0) return "";
  return `<section>
  <h2 class="section-title">Sources</h2>
  <ul class="sources">
    ${report.sources
      .map(
        (s) =>
          `<li><a href="${safeUrl(s.url)}">${escapeHtml(s.title)}</a><span class="muted">${escapeHtml(hostname(s.url))}</span></li>`,
      )
      .join("\n    ")}
  </ul>
</section>`;
}

function footer(run: RunDetails) {
  const parts = [
    `${run.canopyRequests} of ${run.budget} Canopy requests${run.replayed ? " (replayed)" : ""}`,
    run.modelCostUsd === undefined
      ? undefined
      : `model cost $${run.modelCostUsd.toFixed(3)}`,
    run.model,
  ].filter(Boolean);
  return `<footer>${escapeHtml(parts.join(" · "))}</footer>`;
}

export function renderReport(report: ShoppingReport, run: RunDetails): string {
  const date = run.generatedAt.toLocaleString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(run.request)} · Shopping report</title>
<style>${STYLES}</style>
</head>
<body>
<main>
  <header class="page-header">
    <p class="eyebrow">Shopping report · ${escapeHtml(date)}</p>
    <h1>${escapeHtml(run.request)}</h1>
  </header>
  ${hero(report)}
  ${comparison(report)}
  ${flags(report)}
  ${dropped(report)}
  <section class="notes">
    ${list("What I could not check", report.couldNotCheck)}
    ${list("Defaults assumed", report.defaults)}
  </section>
  ${sources(report)}
  ${footer(run)}
</main>
</body>
</html>
`;
}

const STYLES = `
:root {
  color-scheme: light dark;
  --bg: #f6f5f2;
  --surface: #ffffff;
  --surface-2: #f0eee9;
  --text: #1d1c1a;
  --muted: #6b6862;
  --border: #e3e0d9;
  --accent: #1f6f5c;
  --accent-text: #ffffff;
  --accent-soft: #e3f1ec;
  --star: #e8a317;
  --star-empty: #d9d5cc;
  --serious: #b42318;
  --serious-soft: #fde8e6;
  --moderate: #9a6100;
  --moderate-soft: #fdf1d8;
  --minor: #55524c;
  --minor-soft: #ecebe7;
  --shadow: 0 1px 2px rgb(0 0 0 / 0.04), 0 4px 16px rgb(0 0 0 / 0.05);
  --radius: 14px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #141513;
    --surface: #1d1f1c;
    --surface-2: #252824;
    --text: #ecebe6;
    --muted: #a19e96;
    --border: #33362f;
    --accent: #5cc5a7;
    --accent-text: #0d1f1a;
    --accent-soft: #1c3a31;
    --star-empty: #4a4c46;
    --serious: #ff8a7f;
    --serious-soft: #3d1d1a;
    --moderate: #f2c063;
    --moderate-soft: #3a2e14;
    --minor: #c9c6bf;
    --minor-soft: #2e302c;
    --shadow: none;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 16px/1.55 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  -webkit-font-smoothing: antialiased;
}
main { overflow-wrap: break-word; max-width: 1040px; margin: 0 auto; padding: 48px 24px 64px; }
a { color: inherit; text-decoration-color: color-mix(in srgb, currentColor 35%, transparent); text-underline-offset: 3px; }
a:hover { color: var(--accent); }
h1, h2, h3 { line-height: 1.2; margin: 0; letter-spacing: -0.01em; }
h1 { font-size: clamp(28px, 4vw, 40px); font-weight: 700; }
.eyebrow { margin: 0 0 8px; font-size: 13px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
.page-header { margin-bottom: 28px; }
.muted { color: var(--muted); }
section { margin-top: 40px; }
.section-title { font-size: 13px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); margin-bottom: 14px; }

.hero {
  display: grid; grid-template-columns: 280px 1fr; gap: 32px;
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 28px; box-shadow: var(--shadow); margin-top: 0;
}
.hero .eyebrow { color: var(--accent); }
.hero h2 { font-size: 26px; }
.hero-none { display: block; border-left: 4px solid var(--moderate); }
.hero-image { background: #fff; border-radius: 10px; display: grid; place-items: center; padding: 16px; aspect-ratio: 1; }
.product-image { width: 100%; height: 100%; object-fit: contain; }
.lead { margin: 12px 0 0; color: var(--muted); font-size: 17px; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin: 20px 0 0; }
.stats .rating { white-space: normal; }
.stats div { background: var(--surface-2); border-radius: 10px; padding: 10px 12px; }
.stats dt { font-size: 12px; color: var(--muted); }
.stats dd { margin: 2px 0 0; font-weight: 600; overflow-wrap: anywhere; }
.chips { list-style: none; display: flex; flex-wrap: wrap; gap: 8px; padding: 0; margin: 16px 0 0; }
.chips li { background: var(--accent-soft); border-radius: 999px; padding: 4px 12px; font-size: 14px; }
.chip-label { color: var(--muted); }
.button {
  display: inline-block; margin-top: 22px; background: var(--accent); color: var(--accent-text);
  text-decoration: none; font-weight: 600; padding: 11px 20px; border-radius: 10px;
}
.button:hover { color: var(--accent-text); filter: brightness(1.08); }

.rating { white-space: nowrap; }
.stars {
  --pct: calc(var(--rating) / 5 * 100%);
  background: linear-gradient(90deg, var(--star) var(--pct), var(--star-empty) var(--pct));
  -webkit-background-clip: text; background-clip: text; color: transparent; letter-spacing: 1px;
}

.table-wrap { overflow-x: auto; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); }
.compare { width: 100%; border-collapse: collapse; font-size: 15px; }
.compare th, .compare td { padding: 12px 16px; text-align: left; vertical-align: top; border-bottom: 1px solid var(--border); }
.compare tbody tr:last-child > * { border-bottom: 0; }
.compare thead th { min-width: 190px; font-weight: 600; }
.compare tbody th { font-weight: 500; color: var(--muted); white-space: nowrap; font-size: 14px; }
.compare .picked { background: color-mix(in srgb, var(--accent-soft) 55%, transparent); }
.compare thead .picked { box-shadow: inset 0 3px 0 var(--accent); }
.thumb { display: block; width: 72px; height: 72px; object-fit: contain; background: #fff; border-radius: 8px; padding: 4px; margin-bottom: 10px; }
.product-name { display: block; text-decoration: none; }
.rank { display: inline-block; font-size: 12px; font-weight: 700; color: var(--muted); margin-bottom: 2px; }
.source { display: block; font-size: 12px; color: var(--muted); margin-top: 2px; }
.missing { color: var(--muted); font-style: italic; }
.verdict { font-size: 14px; }

.flag-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px 20px; box-shadow: var(--shadow); }
.card-picked { border-color: var(--accent); }
.card-header { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; }
.card-header h3 { font-size: 16px; }
.card-header h3 a { text-decoration: none; }
.thumb-small { width: 48px; height: 48px; flex: none; object-fit: contain; background: #fff; border-radius: 8px; padding: 3px; }
.placeholder { background: var(--surface-2); }
.flags { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
.flags li { display: grid; grid-template-columns: auto 1fr; gap: 10px; font-size: 15px; align-items: start; }
.severity { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; padding: 3px 8px; border-radius: 6px; margin-top: 2px; white-space: nowrap; }
.severity-serious { color: var(--serious); background: var(--serious-soft); }
.severity-moderate { color: var(--moderate); background: var(--moderate-soft); }
.severity-minor { color: var(--minor); background: var(--minor-soft); }

.dropped { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
.dropped li { display: grid; grid-template-columns: minmax(180px, 1fr) 2fr; gap: 16px; background: var(--surface); border: 1px dashed var(--border); border-radius: 10px; padding: 12px 16px; font-size: 15px; }
.dropped a { font-weight: 600; text-decoration: none; }
.dropped span { color: var(--muted); }

.notes { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 32px; }
.note ul, .sources { margin: 0; padding-left: 18px; }
.note li { margin-bottom: 6px; }
.sources { list-style: none; padding: 0; columns: 2 320px; column-gap: 32px; }
.sources li { break-inside: avoid; margin-bottom: 10px; }
.sources a { display: block; }
.sources .muted { font-size: 13px; }

footer { margin-top: 48px; padding-top: 20px; border-top: 1px solid var(--border); font-size: 13px; color: var(--muted); }

@media (max-width: 760px) {
  main { padding: 28px 16px 48px; }
  .hero { grid-template-columns: 1fr; padding: 20px; gap: 20px; }
  .hero-image { max-width: 240px; }
  .dropped li { grid-template-columns: 1fr; gap: 4px; }
}
`;
