import { describe, expect, it } from "vitest";
import { normalizeCriteria, parseFitBrief, quoteAppearsIn, reconcileVerdict, type FitCriterion } from "./schema";
import { renderPacketText, type FitInputPayload } from "./prompt";

const criteria: FitCriterion[] = [
  { id: "c1", kind: "must", text: "Shipped a distributed system at scale" },
  { id: "c2", kind: "must", text: "Owned a product outcome" },
  { id: "c3", kind: "nice", text: "Cloud platform familiarity" },
];

const packet = [
  "[Profile sheet · total_work_ex_months] 28",
  "[CV · Acme Systems] SDE · 2022-2024",
  "[CV · Acme Systems · b1] Built a distributed telemetry pipeline handling 140M events per day",
  "[CV · skills] Python; Azure",
].join("\n");

function reply(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    verdict: "strong",
    summary: "Deep platform work.",
    mustHaves: [
      { criterionId: "c1", status: "met", claim: "Ran a pipeline at scale", source: "CV · Acme Systems · b1", quote: "handling 140M events per day" },
      { criterionId: "c2", status: "met", claim: "Led pricing", source: "CV · Acme Systems · b2", quote: "led the pricing relaunch to +30% revenue" },
    ],
    niceToHaves: [{ criterionId: "c3", status: "met", claim: "Azure listed", source: "CV · skills", quote: "Azure" }],
    probes: ["What was your individual scope in the pipeline?"],
    ...overrides,
  });
}

describe("quoteAppearsIn", () => {
  it("is whitespace- and case-insensitive but otherwise exact", () => {
    expect(quoteAppearsIn("140M  events per DAY", packet)).toBe(true);
    expect(quoteAppearsIn("140M events per week", packet)).toBe(false);
    expect(quoteAppearsIn("a", packet)).toBe(false);
  });
});

describe("parseFitBrief", () => {
  it("drops a quote that is not in the packet, downgrades the row and marks the brief degraded", () => {
    const brief = parseFitBrief(reply(), criteria, packet);
    const c2 = brief.mustHaves.find((e) => e.criterionId === "c2");
    expect(c2?.status).toBe("not_found");
    expect(c2?.quote).toBe("");
    expect(c2?.source).toContain("quote not found in packet");
    expect(brief.degraded).toBe(true);
    // The fabricated "met" no longer counts toward the verdict.
    expect(reconcileVerdict(brief, true)).not.toBe("strong");
  });

  it("keeps a verified quote intact", () => {
    const brief = parseFitBrief(reply(), criteria, packet);
    const c1 = brief.mustHaves.find((e) => e.criterionId === "c1");
    expect(c1?.status).toBe("met");
    expect(c1?.quote).toBe("handling 140M events per day");
  });

  it("adds a not-assessed row for a must-have the model skipped", () => {
    const brief = parseFitBrief(reply({ mustHaves: [] }), criteria, packet);
    expect(brief.mustHaves.map((e) => e.criterionId).sort()).toEqual(["c1", "c2"]);
    expect(brief.degraded).toBe(true);
  });

  it("ignores rows for unknown criteria and rejects unknown verdicts", () => {
    const brief = parseFitBrief(reply({ mustHaves: [{ criterionId: "zzz", status: "met", quote: "28" }] }), criteria, packet);
    expect(brief.mustHaves.every((e) => e.criterionId !== "zzz")).toBe(true);
    expect(() => parseFitBrief(reply({ verdict: "excellent" }), criteria, packet)).toThrow(/verdict/);
    expect(() => parseFitBrief("not json", criteria, packet)).toThrow(/JSON/);
  });

  it("strips markdown fences", () => {
    expect(() => parseFitBrief("```json\n" + reply() + "\n```", criteria, packet)).not.toThrow();
  });
});

describe("reconcileVerdict", () => {
  it("returns insufficient_evidence for a fresher with nothing met", () => {
    const brief = parseFitBrief(reply({ mustHaves: [] }), criteria, packet);
    expect(reconcileVerdict(brief, false)).toBe("insufficient_evidence");
  });
  it("returns weak, not insufficient, when work history exists and nothing is met", () => {
    const brief = parseFitBrief(reply({ mustHaves: [] }), criteria, packet);
    expect(reconcileVerdict(brief, true)).toBe("weak");
  });
});

describe("normalizeCriteria", () => {
  it("caps count, defaults kind to must, and assigns ids", () => {
    const rows = normalizeCriteria([{ text: " a " }, { text: "b", kind: "nice", id: "nice-1" }, { text: "" }]);
    expect(rows).toEqual([
      { id: "c1", kind: "must", text: "a" },
      { id: "nice-1", kind: "nice", text: "b" },
    ]);
    expect(normalizeCriteria(Array.from({ length: 20 }, (_, i) => ({ text: `t${i}` })))).toHaveLength(12);
  });
});

describe("renderPacketText", () => {
  it("labels every bullet with a citable source and never emits identity fields", () => {
    const input: FitInputPayload = {
      application_id: "x",
      jd: { role_title: "PM", grade: null, locations: [], eligible_branches: [], eligible_specializations: [], min_cgpa: null },
      profile: {
        total_work_ex_months: 28,
        prior_employers: [{ employer: "Acme", months: 28 }],
        graduation_details: {},
        pg_details: {},
        tenth_twelfth_details: {},
        credentials: [],
        other_qualifications: null,
      },
      cv: {
        template_id: "t",
        content: {
          personalInfo: { summary: "Backend engineer", headline: "SDE" },
          experience: [{ company: "Acme", role: "SDE", period: "2022", bullets: [{ id: "b1", text: "Built X" }] }],
          projects: [],
          positions: [],
          skills: ["Python"],
        },
      },
    };
    const text = renderPacketText(input);
    expect(text).toContain("[CV · Acme · b1] Built X");
    expect(text).toContain("[Profile sheet · total_work_ex_months] 28");
    expect(text).not.toMatch(/name|phone|gender|email/i);
  });
});
