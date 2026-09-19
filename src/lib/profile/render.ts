import {
  FORMAT_SIZE,
  lpa,
  months,
  pct,
  topEntries,
  type BatchProfileSnapshot,
  type BlockId,
} from "@/lib/profile/snapshot";
import type { PosterSpec } from "@/lib/profile/compose";

// Renders a PosterSpec against a snapshot into one self-contained HTML document. No external
// requests except Google Fonts; logos/photos come in as data: URIs or same-origin signed URLs
// the caller resolved. Every visible number is produced here from the snapshot — templates hold
// no literals — so what a recruiter sees on LinkedIn is what the Reports dashboard shows.

export interface Brand {
  primary: string;
  accent: string;
  ink: string;
  paper: string;
  font: string;
  logoUrl?: string;
  photoUrl?: string;
}

export function brandFrom(s: BatchProfileSnapshot): Brand {
  const b = s.institute.brand ?? {};
  return {
    primary: b.primary ?? "#1E2A5A",
    accent: b.accent ?? "#E8A317",
    ink: "#161821",
    paper: "#FFFFFF",
    font: b.font ?? "IBM Plex Sans",
    logoUrl: b.logo_url,
    photoUrl: b.photo_url,
  };
}

function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

// ── primitives ─────────────────────────────────────────────────────────────────────────────

function tile(label: string, value: string, sub?: string, opts: { big?: boolean; accent?: boolean } = {}): string {
  return `<div class="tile${opts.accent ? " tile-accent" : ""}">
    <div class="tile-value${opts.big ? " big" : ""}">${esc(value)}</div>
    <div class="tile-label">${esc(label)}</div>${sub ? `<div class="tile-sub">${esc(sub)}</div>` : ""}
  </div>`;
}

function bars(rows: Array<[string, number]>, total: number): string {
  const max = Math.max(...rows.map((r) => r[1]), 1);
  return `<div class="bars">${rows
    .map(
      ([k, v]) => `<div class="bar-row"><span class="bar-key">${esc(k)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${Math.round((v / max) * 100)}%"></span></span>
      <span class="bar-val">${esc(pct(v, total))}</span></div>`,
    )
    .join("")}</div>`;
}

function donut(rows: Array<[string, number]>, size = 150): string {
  const total = rows.reduce((a, r) => a + r[1], 0) || 1;
  const r = 60;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const shades = [1, 0.75, 0.55, 0.4, 0.28, 0.2];
  const segs = rows
    .map(([, v], i) => {
      const len = (v / total) * c;
      const seg = `<circle r="${r}" cx="80" cy="80" fill="none" stroke="var(--primary)" stroke-opacity="${shades[i % shades.length]}" stroke-width="30" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 80 80)"/>`;
      offset += len;
      return seg;
    })
    .join("");
  const legend = rows.map(([k, v], i) => `<div class="legend-row"><span class="swatch" style="opacity:${shades[i % shades.length]}"></span>${esc(k)}<b>${esc(pct(v, total))}</b></div>`).join("");
  return `<div class="donut"><svg width="${size}" height="${size}" viewBox="0 0 160 160" aria-hidden="true">${segs}</svg><div class="legend">${legend}</div></div>`;
}

function logoGrid(items: Array<{ name: string; logo?: string | null }>, cols: number, max: number): string {
  return `<div class="logos" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">${items
    .slice(0, max)
    .map((it) => (it.logo ? `<div class="logo"><img src="${esc(it.logo)}" alt="${esc(it.name)}"></div>` : `<div class="logo logo-text">${esc(it.name)}</div>`))
    .join("")}</div>`;
}

function section(title: string, body: string, span = 1): string {
  return `<section class="block" style="grid-column: span ${span}"><h2>${esc(title)}</h2>${body}</section>`;
}

// ── block renderers ────────────────────────────────────────────────────────────────────────

export function renderBlock(id: BlockId, s: BatchProfileSnapshot, compact: boolean, logoResolver: (path: string | null) => string | null, siblings: BlockId[] = [], leadSource: string | null = null): string {
  const p = s.placements;
  // A stat already shown as the lead is not repeated inside its block.
  const lead = compact ? leadSource : null;
  switch (id) {
    case "batch_size":
      return section("Batch profile", `<div class="tiles">${tile("Students", String(s.size), s.batch.name, { big: true })}${
        s.work_ex.average_months != null && !compact && !siblings.includes("work_ex_average") ? tile("Avg work-ex", months(s.work_ex.average_months)) : ""
      }${s.gender && !siblings.includes("gender_split") && !compact ? Object.entries(s.gender).map(([k, v]) => tile(k.charAt(0).toUpperCase() + k.slice(1), pct(v, s.size))).join("") : ""}</div>`);
    case "gender_split": {
      const g = s.gender ?? {};
      const total = Object.values(g).reduce((a, b) => a + b, 0);
      return section("Demographics", `<div class="tiles">${Object.entries(g).map(([k, v]) => tile(k.charAt(0).toUpperCase() + k.slice(1), pct(v, total), `${v} students`)).join("")}</div>`);
    }
    case "work_ex_buckets": {
      const b = s.work_ex.buckets;
      const rows: Array<[string, number]> = [["Freshers", b.freshers], ["1–12 months", b["1_12"]], ["13–24 months", b["13_24"]], ["25–36 months", b["25_36"]], ["36+ months", b["37_plus"]]];
      return section("Work experience", compact ? bars(rows.filter((r) => r[1] > 0), s.size) : `${bars(rows, s.size)}<p class="foot">${esc(months(s.work_ex.average_months))} average · ${esc(months(s.work_ex.median_months))} median</p>`);
    }
    case "work_ex_average":
      if (lead === "work_ex.average_months") return "";
      return section("Experience", `<div class="tiles">${tile("Average work-ex", months(s.work_ex.average_months), undefined, { big: true, accent: true })}</div>`);
    case "work_ex_sectors":
      return section("Sector-wise prior work experience", donut(topEntries(s.work_ex.sectors, 6), compact ? 120 : 150));
    case "education_branches":
      return section("Educational background", compact ? bars(topEntries(s.education.branches, 4), s.size) : donut(topEntries(s.education.branches, 5)));
    case "premier_institutes":
      return section("Premier institutes", `<div class="tiles">${lead === "education.premier_institutes_total" ? "" : tile("IIT / NIT / BITS & others", String(s.education.premier_institutes_total), pct(s.education.premier_institutes_total, s.size) + " of batch", { big: true })}${
        compact && lead !== "education.premier_institutes_total" ? "" : topEntries(s.education.premier_institutes, 4).map(([k, v]) => tile(k, String(v))).join("")
      }</div>`);
    case "credentials":
      if (lead === "education.professional_credentials") return "";
      return section("Professional qualifications", `<div class="tiles">${topEntries(s.education.professional_credentials, 4).map(([k, v]) => tile(k, String(v), undefined, { big: true })).join("")}</div>`);
    case "specializations":
      return section("Specialisations", bars(topEntries(s.education.specializations, 6), s.size));
    case "ctc_highlights":
      if (!p) return "";
      return section("Placement highlights", `<div class="tiles">${lead === "placements.ctc_median" ? "" : tile("Median CTC", lpa(p.ctc_median), undefined, { big: true, accent: true })}${tile("Highest CTC", lpa(p.ctc_highest), undefined, { big: true, accent: lead === "placements.ctc_median" })}${tile("Average CTC", lpa(p.ctc_average))}${
        !compact && p.ctc_top_decile_average != null ? tile("Top 10% avg", lpa(p.ctc_top_decile_average)) : ""
      }</div>`);
    case "recruiter_counts":
      if (!p) return "";
      return section("Recruiting outcomes", `<div class="tiles">${tile("Recruiters", String(p.recruiters), undefined, { big: true })}${p.new_recruiters ? tile("New recruiters", String(p.new_recruiters)) : ""}${p.placement_rate != null && !compact ? tile("Placed", `${p.placement_rate}%`, `${p.placed} of ${s.size}`) : ""}</div>`);
    case "placement_sectors":
      if (!p) return "";
      return section("Offers by sector", bars(topEntries(p.sectors, 6), p.placed));
    case "past_recruiters":
      if (!p) return "";
      return section("Past recruiters", logoGrid(p.top_recruiters.map((r) => ({ name: r.name, logo: logoResolver(r.logo_path) })), compact ? 4 : 5, compact ? 8 : 30));
    case "past_employers":
      return section("Past work experience", logoGrid(s.work_ex.past_employers.map((e) => ({ name: e.name })), compact ? 4 : 6, compact ? 8 : 24));
    case "accreditations":
      return section("Accreditations", `<div class="pills">${(s.institute.facts.accreditations ?? []).map((a) => `<span class="pill">${esc(a)}</span>`).join("")}</div>`);
    case "rankings":
      return section("Rankings", `<div class="tiles">${(s.institute.facts.rankings ?? []).slice(0, 4).map((r) => tile(r.body + (r.as_of ? ` · ${r.as_of}` : ""), `#${r.rank}`)).join("")}</div>`);
    case "campus_highlights": {
      const f = s.institute.facts;
      return section("Campus", `<div class="tiles">${f.clubs_count ? tile("Student-run clubs", `${f.clubs_count}+`) : ""}${f.international_partners ? tile("International collaborations", `${f.international_partners}+`) : ""}${f.legacy_since ? tile("Years of legacy", String(new Date().getFullYear() - f.legacy_since)) : ""}</div>`);
    }
    case "testimonials":
      return section("What recruiters say", `<div class="quotes">${(s.institute.facts.testimonials ?? []).slice(0, compact ? 1 : 3).map((t) => `<blockquote>“${esc(t.quote)}”<footer>${esc(t.name)}${t.title ? ` · ${esc(t.title)}` : ""}${t.company ? `, ${esc(t.company)}` : ""}</footer></blockquote>`).join("")}</div>`);
    case "season_comparison": {
      if (!p || !s.baseline) return "";
      const d = (a: number | null, b: number | null) => (a == null || b == null ? "" : `${a >= b ? "▲" : "▼"} ${Math.abs(Math.round(((a - b) / b) * 100))}% vs last season`);
      return section("Season over season", `<div class="tiles">${tile("Median CTC", lpa(p.ctc_median), d(p.ctc_median, s.baseline.ctc_median))}${tile("Recruiters", String(p.recruiters), d(p.recruiters, s.baseline.recruiters))}${tile("Placed", String(p.placed), d(p.placed, s.baseline.placed))}</div>`);
    }
  }
}

// ── document ───────────────────────────────────────────────────────────────────────────────

const CSS = `
:root{--primary:{{primary}};--accent:{{accent}};--ink:{{ink}};--paper:{{paper}};--muted:#5B6072;--line:#E4E6EE;--soft:color-mix(in srgb,var(--primary) 8%,white)}
*{box-sizing:border-box}body{margin:0;font-family:"{{font}}","Segoe UI",sans-serif;color:var(--ink);background:var(--paper)}
.page{width:{{w}}px;height:{{h}}px;overflow:hidden;display:flex;flex-direction:column;background:var(--paper)}
header{display:flex;align-items:center;gap:20px;padding:26px 40px;background:var(--primary);color:#fff}
header .logo-box{width:64px;height:64px;border-radius:12px;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0}
header .logo-box img{max-width:100%;max-height:100%}
header .logo-box span{font-weight:800;font-size:28px;color:var(--primary)}
header h1{margin:0;font-size:30px;line-height:1.1;letter-spacing:-.01em}header p{margin:4px 0 0;font-size:15px;opacity:.85}
header .title{margin-left:auto;text-align:right}header .title strong{display:block;font-size:24px;line-height:1.15}header .title span{font-size:14px;opacity:.85}
.headline{padding:12px 40px;background:var(--accent);color:var(--ink);font-size:15px;font-weight:600}
main{flex:1;display:grid;gap:18px;padding:24px 40px;align-content:start}.page.tall main{align-content:stretch;grid-auto-rows:minmax(0,1fr)}
.block{border:1px solid var(--line);border-radius:14px;padding:16px 18px;background:#fff;min-width:0}
.block h2{margin:0 0 12px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--primary);font-weight:700}
.tiles{display:flex;flex-wrap:wrap;gap:10px}
.tile{flex:1 1 120px;background:var(--soft);border-radius:10px;padding:12px 14px;min-width:110px}
.tile-accent{background:var(--primary);color:#fff}.tile-accent .tile-label,.tile-accent .tile-sub{color:rgba(255,255,255,.85)}
.tile-value{font-size:26px;font-weight:800;line-height:1;letter-spacing:-.02em}.tile-value.big{font-size:32px;white-space:nowrap}.page.compact .tile-value.big{font-size:28px}
.tile-label{margin-top:6px;font-size:12px;color:var(--muted);font-weight:600}.tile-sub{margin-top:2px;font-size:11px;color:var(--muted)}
.bars{display:flex;flex-direction:column;gap:7px}.bar-row{display:grid;grid-template-columns:120px 1fr 44px;align-items:center;gap:10px;font-size:13px}
.bar-key{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bar-track{height:12px;background:var(--soft);border-radius:999px;overflow:hidden}
.bar-fill{display:block;height:100%;background:var(--primary);border-radius:999px}.bar-val{text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
.donut{display:flex;align-items:center;gap:18px}.legend{display:flex;flex-direction:column;gap:5px;font-size:13px;min-width:0}
.legend-row{display:flex;align-items:center;gap:8px}.legend-row b{margin-left:auto;font-variant-numeric:tabular-nums}
.swatch{width:12px;height:12px;border-radius:3px;background:var(--primary);flex-shrink:0}
.logos{display:grid;gap:8px}.logo{height:46px;border:1px solid var(--line);border-radius:8px;display:flex;align-items:center;justify-content:center;padding:6px;background:#fff}
.logo img{max-width:100%;max-height:100%;object-fit:contain}.logo-text{font-size:12px;font-weight:700;color:var(--primary);text-align:center;line-height:1.1}
.pills{display:flex;flex-wrap:wrap;gap:8px}.pill{padding:6px 12px;border-radius:999px;background:var(--soft);color:var(--primary);font-weight:700;font-size:13px}
.quotes{display:flex;flex-direction:column;gap:10px}blockquote{margin:0;padding:10px 12px;border-left:4px solid var(--accent);background:var(--soft);font-size:13px;line-height:1.45}
blockquote footer{margin-top:6px;font-size:12px;color:var(--muted);font-weight:600}
.foot{margin:10px 0 0;font-size:12px;color:var(--muted)}
footer.page-foot{padding:12px 40px;border-top:1px solid var(--line);display:flex;gap:24px;font-size:13px;color:var(--muted);align-items:center}
footer.page-foot .src{margin-left:auto;font-size:11px}
.lead{display:flex;align-items:center;gap:24px;padding:22px 40px;background:var(--soft)}
.lead .v{font-size:64px;font-weight:800;line-height:1;color:var(--primary);letter-spacing:-.03em}.lead .l{font-size:16px;color:var(--muted);font-weight:600}
`;

export function renderPosterHtml(
  s: BatchProfileSnapshot,
  spec: PosterSpec,
  brand: Brand,
  logoResolver: (path: string | null) => string | null = () => null,
): string {
  const { w, h } = FORMAT_SIZE[spec.format];
  const compact = spec.format !== "poster_a4";
  const columns = spec.format === "poster_a4" ? 4 : spec.format === "linkedin_landscape" ? 3 : 2;
  const blocksHtml = spec.blocks.map((b) => renderBlock(b, s, compact, logoResolver, spec.blocks, spec.leadStat?.source ?? null)).filter(Boolean).join("");
  const contact = s.institute.facts.contact ?? {};
  const lead = spec.leadStat && compact ? `<div class="lead"><div><div class="v">${esc(spec.leadStat.value)}</div><div class="l">${esc(spec.leadStat.label)}</div></div><div style="font-size:16px;line-height:1.4;max-width:60%">${esc(spec.headline)}</div></div>` : "";
  const css = CSS.replace("{{primary}}", brand.primary).replace("{{accent}}", brand.accent).replace("{{ink}}", brand.ink).replace("{{paper}}", brand.paper).replace("{{font}}", brand.font).replace("{{w}}", String(w)).replace("{{h}}", String(h));
  const fontLink = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(brand.font)}:wght@400;600;800&display=swap">`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(spec.title)} — ${esc(s.institute.name)}</title>${fontLink}<style>${css}</style></head>
<body><div class="page${compact ? " compact" : ""}${spec.format === "story" ? " tall" : ""}">
<header>
  <div class="logo-box">${brand.logoUrl ? `<img src="${esc(brand.logoUrl)}" alt="">` : `<span>${esc(s.institute.name.replace(/[^A-Z]/g, "").slice(0, 3) || "IIM")}</span>`}</div>
  <div><h1>${esc(s.institute.name)}</h1>${s.institute.tagline ? `<p>${esc(s.institute.tagline)}</p>` : ""}</div>
  <div class="title"><strong>${esc(spec.title)}</strong><span>${esc(s.batch.name)}</span></div>
</header>
${compact ? lead : `<div class="headline">${esc(spec.headline)}</div>`}
<main style="grid-template-columns:repeat(${columns},minmax(0,1fr))">${blocksHtml}</main>
<footer class="page-foot">${contact.email ? `<span>${esc(contact.email)}</span>` : ""}${contact.phone ? `<span>${esc(contact.phone)}</span>` : ""}${contact.website ? `<span>${esc(contact.website)}</span>` : ""}<span class="src">Figures from the ${esc(s.batch.name)} roster and placement records · generated ${esc(new Date(s.generated_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }))}</span></footer>
</div></body></html>`;
}
