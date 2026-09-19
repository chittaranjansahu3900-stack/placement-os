import { describe, expect, it } from "vitest";
import { availableBlocks, type BatchProfileSnapshot } from "./snapshot";
import { applyModelComposition, composeDeterministic, copyUsesOnlySnapshotNumbers, headlineHasNoFigures } from "./compose";
import { brandFrom, renderPosterHtml } from "./render";

// Sample snapshot for tests and previews. Values are illustrative and belong to a fictional
// institute — not any real IIM's published figures.
export const SAMPLE: BatchProfileSnapshot = {
  generated_at: "2026-09-19T09:00:00Z",
  batch: { id: "b1", name: "PGP 2026–28", starts_on: "2026-06-15", ends_on: "2028-03-31" },
  size: 412,
  gender: { male: 268, female: 144 },
  work_ex: {
    average_months: 22,
    median_months: 18,
    buckets: { freshers: 96, "1_12": 58, "13_24": 121, "25_36": 102, "37_plus": 35 },
    sectors: { "IT / Analytics": 118, "BFSI / Professional services": 64, Consulting: 31, "Manufacturing / Core": 47, "E-commerce / Startups": 29, Others: 27 },
    past_employers: [{ name: "Tata Consultancy Services", students: 31 }, { name: "Infosys", students: 24 }, { name: "Deloitte", students: 14 }, { name: "Larsen & Toubro", students: 12 }, { name: "ICICI Bank", students: 11 }, { name: "Amazon", students: 9 }, { name: "Wipro", students: 9 }, { name: "Accenture", students: 8 }],
  },
  education: {
    branches: { Engineering: 214, Commerce: 78, Arts: 51, Science: 39, Management: 22, Others: 8 },
    premier_institutes: { IIT: 41, NIT: 63, BITS: 12, SRCC: 9 },
    premier_institutes_total: 125,
    specializations: { "Marketing & Strategy": 118, Finance: 102, "Operations & Supply Chain": 84, "Consulting & Analytics": 71, "HR & OB": 37 },
    professional_credentials: { CA: 19, CFA: 44, FRM: 7 },
  },
  placements: {
    placed: 389,
    placement_rate: 94.4,
    ctc_highest: 68,
    ctc_average: 21.4,
    ctc_median: 19.5,
    ctc_top_decile_average: 36.2,
    recruiters: 187,
    new_recruiters: 43,
    sectors: { Consulting: 118, "BFSI / Professional services": 82, "IT / Analytics": 64, FMCG: 41, "E-commerce / Startups": 39, "Manufacturing / Core": 45 },
    top_recruiters: [{ name: "Accenture", offers: 14, logo_path: null }, { name: "Deloitte", offers: 12, logo_path: null }, { name: "Amazon", offers: 9, logo_path: null }, { name: "HDFC Bank", offers: 8, logo_path: null }, { name: "ITC", offers: 7, logo_path: null }, { name: "Cognizant", offers: 7, logo_path: null }, { name: "EY", offers: 6, logo_path: null }, { name: "KPMG", offers: 6, logo_path: null }, { name: "Flipkart", offers: 5, logo_path: null }, { name: "Tata Steel", offers: 5, logo_path: null }],
  },
  baseline: { batch_id: "b0", placed: 371, ctc_average: 19.8, ctc_median: 18, recruiters: 172 },
  institute: {
    name: "Indian Institute of Management Raipur",
    tagline: "Sample data — fictional figures for preview",
    brand: { primary: "#1B3A8A", accent: "#F2B705", font: "IBM Plex Sans" },
    facts: {
      accreditations: ["AACSB", "AMBA"],
      rankings: [{ body: "NIRF", rank: 11, as_of: "2026" }, { body: "FT Masters in Management", rank: 78, as_of: "2025" }],
      legacy_since: 2010,
      clubs_count: 32,
      international_partners: 19,
      testimonials: [{ quote: "The placement team ran a tight, well-communicated process end to end.", name: "Sample Recruiter", title: "Head of Campus Hiring", company: "Sample Co" }],
      contact: { email: "placements@iimraipur.ac.in", website: "iimraipur.ac.in" },
    },
  },
};

describe("availableBlocks", () => {
  it("lists only blocks with data", () => {
    const blocks = availableBlocks(SAMPLE);
    expect(blocks).toContain("ctc_highlights");
    expect(blocks).toContain("season_comparison");
    const noPlacements = { ...SAMPLE, placements: null, baseline: null };
    expect(availableBlocks(noPlacements)).not.toContain("ctc_highlights");
    expect(availableBlocks(noPlacements)).not.toContain("season_comparison");
  });
  it("hides the gender split for small batches", () => {
    expect(availableBlocks({ ...SAMPLE, gender: null })).not.toContain("gender_split");
  });
});

describe("composeDeterministic", () => {
  it("leads finance with credentials and technology with premier institutes", () => {
    expect(composeDeterministic(SAMPLE, "finance", "final_placements", "linkedin_landscape").leadStat?.source).toBe("education.professional_credentials");
    expect(composeDeterministic(SAMPLE, "technology", "final_placements", "linkedin_landscape").leadStat?.source).toBe("education.premier_institutes_total");
  });
  it("dates summers after the first year and finals at the end", () => {
    expect(composeDeterministic(SAMPLE, "general", "summer_placements", "story").title).toBe("Invitation for Summer Placements 2027");
    expect(composeDeterministic(SAMPLE, "general", "final_placements", "story").title).toBe("Invitation for Final Placements 2028");
  });
  it("respects format capacity", () => {
    expect(composeDeterministic(SAMPLE, "general", "final_placements", "linkedin_landscape").blocks.length).toBeLessThanOrEqual(4);
    expect(composeDeterministic(SAMPLE, "general", "final_placements", "poster_a4").blocks.length).toBeGreaterThan(6);
  });
});

describe("numbers guard", () => {
  it("accepts copy whose numbers exist in the snapshot and rejects invented ones", () => {
    expect(copyUsesOnlySnapshotNumbers("A batch of 412 with 22 months of experience.", SAMPLE)).toBe(true);
    expect(copyUsesOnlySnapshotNumbers("Median CTC of 19.5 LPA", SAMPLE)).toBe(true);
    expect(copyUsesOnlySnapshotNumbers("Median CTC of 999 LPA", SAMPLE)).toBe(false);
    expect(copyUsesOnlySnapshotNumbers("Over 500 students", SAMPLE)).toBe(false);
  });
  it("allows only years in a model-written headline", () => {
    expect(headlineHasNoFigures("Invitation for Final Placements 2027")).toBe(true);
    expect(headlineHasNoFigures("A batch of 412 leaders")).toBe(false);
    expect(headlineHasNoFigures("Median CTC of 24 LPA")).toBe(false);
  });
  it("falls back to the deterministic headline when the model invents a number or a block", () => {
    const base = composeDeterministic(SAMPLE, "general", "final_placements", "poster_a4");
    const out = applyModelComposition(SAMPLE, base, JSON.stringify({ headline: "Join our 600-strong batch", blocks: ["ctc_highlights", "made_up_block"] }));
    expect(out.headline).toBe(base.headline);
    expect(out.blocks).toEqual(["ctc_highlights"]);
  });
});

describe("renderPosterHtml", () => {
  it("renders every format with snapshot numbers and no template literals", () => {
    for (const format of ["poster_a4", "linkedin_landscape", "linkedin_square", "story"] as const) {
      const spec = composeDeterministic(SAMPLE, "general", "placement_report", format);
      const html = renderPosterHtml(SAMPLE, spec, brandFrom(SAMPLE));
      expect(html).toContain("19.5 LPA");
      expect(html).toContain("68 LPA");
      expect(html).toContain("412");
      expect(html).not.toMatch(/\{\{\w+\}\}/);
      expect(html).toContain("#1B3A8A");
    }
  });
  it("escapes institute-provided text", () => {
    const evil = { ...SAMPLE, institute: { ...SAMPLE.institute, tagline: "<script>alert(1)</script>" } };
    const html = renderPosterHtml(evil, composeDeterministic(evil, "general", "final_placements", "poster_a4"), brandFrom(evil));
    expect(html).not.toContain("<script>alert");
  });
});
