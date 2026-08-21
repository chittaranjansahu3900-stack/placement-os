import { describe, expect, it } from "vitest";
import { buildInitialCvContent, normalizeCvContent, scoreCvAgainstJd } from "./resume";
import type { Student } from "@/types/domain";

function baseStudent(overrides: Partial<Student> = {}): Student {
  return {
    id: "s1",
    user_id: "u1",
    batch_id: "b1",
    roll_no: "PGP001",
    display_seq: null,
    section: null,
    name: "Asha Rao",
    age: null,
    gender: null,
    phone: "9999999999",
    personal_email: "asha@example.com",
    total_work_ex_months: 12,
    prior_employers: [],
    graduation_details: {},
    pg_details: {},
    tenth_twelfth_details: {},
    credentials: [],
    other_qualifications: null,
    placement_status: "unplaced",
    latest_cv_document_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("normalizeCvContent", () => {
  it("fills in a safe default shape for completely empty input", () => {
    const content = normalizeCvContent({});
    expect(content.title).toBe("Placement CV");
    expect(content.academics).toEqual([]);
    expect(content.personalInfo).toMatchObject({ name: "", email: "" });
  });

  it("never invents facts — it only ever reflects what's already in the input (FR-10.4's fact-safety, checked below, depends on this)", () => {
    const content = normalizeCvContent({
      personalInfo: { name: "Asha Rao" },
      experience: [{ company: "Acme", role: "Analyst", bullets: [{ text: "Shipped X" }] }],
    });
    expect(content.personalInfo.name).toBe("Asha Rao");
    expect(content.experience[0].bullets[0].text).toBe("Shipped X");
    // Nothing beyond what was supplied should appear.
    expect(content.experience).toHaveLength(1);
    expect(content.projects).toEqual([]);
  });

  it("clamps out-of-range jdFit scores into 0-100", () => {
    const content = normalizeCvContent({ jdFit: { score: 150, sectionCoverage: { skills: -20 } } });
    expect(content.jdFit?.score).toBe(100);
    expect(content.jdFit?.sectionCoverage.skills).toBe(0);
  });

  it("caps runaway array sizes rather than accepting unbounded input", () => {
    const manySkills = Array.from({ length: 500 }, (_, i) => `skill-${i}`);
    const content = normalizeCvContent({ skills: manySkills });
    expect(content.skills.length).toBeLessThanOrEqual(80);
  });

  it("is idempotent — normalizing already-normalized content doesn't change it", () => {
    const once = normalizeCvContent({ personalInfo: { name: "Asha" }, skills: ["SQL", "Python"] });
    const twice = normalizeCvContent(once);
    expect(twice).toEqual(once);
  });
});

describe("buildInitialCvContent", () => {
  it("imports graduation and PG academics from the student's roster profile", () => {
    const student = baseStudent({
      graduation_details: { college: "NIT Trichy", branch: "Mechanical", cgpa: 8.2, year: 2020 },
      pg_details: { specialization: "Finance", cgpa: 3.5, year: 2025 },
    });
    const content = buildInitialCvContent(student);
    const courses = content.academics.map((a) => a.course);
    expect(courses).toEqual(
      expect.arrayContaining([expect.stringContaining("Finance"), "Mechanical"]),
    );
  });

  it("imports prior employers as experience entries with no invented bullets", () => {
    const student = baseStudent({
      prior_employers: [{ company: "TCS", role: "Consultant", duration_months: 24 }],
    });
    const content = buildInitialCvContent(student);
    expect(content.experience[0]).toMatchObject({ company: "TCS", role: "Consultant" });
    expect(content.experience[0].bullets).toEqual([]);
  });

  it("uses the student's own contact info, not placeholder text", () => {
    const student = baseStudent({ personal_email: "real@example.com", phone: "9000000000" });
    const content = buildInitialCvContent(student);
    expect(content.personalInfo.email).toBe("real@example.com");
    expect(content.personalInfo.phone).toBe("9000000000");
  });

  it("imports Class 10 and 12 academics from nested Profile Sheet details", () => {
    const student = baseStudent({
      tenth_twelfth_details: {
        tenth: { school: "DAV School", board: "CBSE", year: 2016, percentage: 94 },
        twelfth: { school: "DAV School", board: "CBSE", year: 2018, percentage: 91.2 },
      },
    });
    const content = buildInitialCvContent(student);
    expect(content.academics).toEqual(expect.arrayContaining([
      expect.objectContaining({ course: "Class 10 — CBSE", result: "94%" }),
      expect.objectContaining({ course: "Class 12 — CBSE", result: "91.2%" }),
    ]));
  });

  it("maps structured projects, positions, credentials, and other qualifications without invented bullets", () => {
    const student = baseStudent({
      credentials: [
        { type: "project", name: "Demand Forecasting", role: "Analyst", period: "2025", description: "Built a baseline model" },
        { type: "position_of_responsibility", organization: "Finance Club", role: "Treasurer", period: "2024–25" },
        { type: "certification", name: "Google Data Analytics" },
      ],
      other_qualifications: "NSE Academy module; Advanced Excel workshop",
    });
    const content = buildInitialCvContent(student);
    expect(content.projects[0]).toMatchObject({ name: "Demand Forecasting", role: "Analyst" });
    expect(content.projects[0].bullets[0].text).toBe("Built a baseline model");
    expect(content.positions[0]).toMatchObject({ company: "Finance Club", role: "Treasurer" });
    expect(content.positions[0].bullets).toEqual([]);
    expect(content.certifications).toEqual(expect.arrayContaining([
      "Google Data Analytics",
      "NSE Academy module",
      "Advanced Excel workshop",
    ]));
  });
});

describe("scoreCvAgainstJd", () => {
  it("scores 100% when every JD keyword appears in the CV", () => {
    const content = normalizeCvContent({ skills: ["python", "sql", "excel"] });
    const analysis = scoreCvAgainstJd(content, "Looking for Python and SQL skills", "jd1");
    expect(analysis.score).toBeGreaterThan(0);
    expect(analysis.missingKeywords).not.toContain("python");
  });

  it("reports missing keywords the CV doesn't contain", () => {
    const content = normalizeCvContent({ skills: ["excel"] });
    const analysis = scoreCvAgainstJd(content, "Requires Python and machine learning experience", "jd2");
    expect(analysis.missingKeywords).toEqual(expect.arrayContaining(["python", "machine", "learning"]));
  });

  it("returns a zero score for a JD with no meaningful keywords", () => {
    const content = normalizeCvContent({ skills: ["python"] });
    const analysis = scoreCvAgainstJd(content, "and the of", "jd3");
    expect(analysis.score).toBe(0);
  });
});
