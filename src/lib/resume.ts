import type {
  CvAcademicEntry,
  CvBullet,
  CvContent,
  CvExperienceEntry,
  CvJdFitAnalysis,
  CvProjectEntry,
  Student,
} from "@/types/domain";

const MAX_TEXT = 4_000;
const MAX_ITEMS = 20;
const MAX_BULLETS = 12;

function text(value: unknown, max = MAX_TEXT): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function id(value: unknown, fallback: string): string {
  const candidate = text(value, 100);
  return candidate || fallback;
}

function bullets(value: unknown, prefix: string): CvBullet[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_BULLETS).map((item, index) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return { id: id(row.id, `${prefix}-bullet-${index + 1}`), text: text(row.text) };
  });
}

export function normalizeCvContent(value: unknown): CvContent {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const personal =
    source.personalInfo && typeof source.personalInfo === "object"
      ? (source.personalInfo as Record<string, unknown>)
      : {};

  const academics: CvAcademicEntry[] = Array.isArray(source.academics)
    ? source.academics.slice(0, MAX_ITEMS).map((item, index) => {
        const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        return {
          id: id(row.id, `academic-${index + 1}`),
          institute: text(row.institute, 300),
          course: text(row.course, 300),
          year: text(row.year, 50),
          result: text(row.result, 100),
        };
      })
    : [];

  const experience: CvExperienceEntry[] = Array.isArray(source.experience)
    ? source.experience.slice(0, MAX_ITEMS).map((item, index) => {
        const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        const rowId = id(row.id, `experience-${index + 1}`);
        return {
          id: rowId,
          company: text(row.company, 300),
          role: text(row.role, 300),
          period: text(row.period, 100),
          bullets: bullets(row.bullets, rowId),
        };
      })
    : [];

  const projects: CvProjectEntry[] = Array.isArray(source.projects)
    ? source.projects.slice(0, MAX_ITEMS).map((item, index) => {
        const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        const rowId = id(row.id, `project-${index + 1}`);
        return {
          id: rowId,
          name: text(row.name, 300),
          role: text(row.role, 300),
          period: text(row.period, 100),
          link: text(row.link, 500),
          bullets: bullets(row.bullets, rowId),
        };
      })
    : [];

  const positions: CvExperienceEntry[] = Array.isArray(source.positions)
    ? source.positions.slice(0, MAX_ITEMS).map((item, index) => {
        const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        const rowId = id(row.id, `position-${index + 1}`);
        return {
          id: rowId,
          company: text(row.company, 300),
          role: text(row.role, 300),
          period: text(row.period, 100),
          bullets: bullets(row.bullets, rowId),
        };
      })
    : [];

  const rawFit =
    source.jdFit && typeof source.jdFit === "object" && !Array.isArray(source.jdFit)
      ? (source.jdFit as Record<string, unknown>)
      : null;
  const rawSectionCoverage =
    rawFit?.sectionCoverage &&
    typeof rawFit.sectionCoverage === "object" &&
    !Array.isArray(rawFit.sectionCoverage)
      ? (rawFit.sectionCoverage as Record<string, unknown>)
      : {};
  const fit: CvJdFitAnalysis | null = rawFit
    ? {
        jdId: text(rawFit.jdId, 100),
        score: Math.max(0, Math.min(100, Number(rawFit.score) || 0)),
        matchedKeywords: Array.isArray(rawFit.matchedKeywords)
          ? rawFit.matchedKeywords.slice(0, 60).map((item) => text(item, 100)).filter(Boolean)
          : [],
        missingKeywords: Array.isArray(rawFit.missingKeywords)
          ? rawFit.missingKeywords.slice(0, 60).map((item) => text(item, 100)).filter(Boolean)
          : [],
        sectionCoverage: Object.fromEntries(
          Object.entries(rawSectionCoverage)
            .slice(0, 20)
            .map(([key, score]) => [text(key, 100), Math.max(0, Math.min(100, Number(score) || 0))]),
        ),
        analyzedAt: text(rawFit.analyzedAt, 100),
      }
    : null;

  return {
    title: text(source.title, 200) || "Placement CV",
    personalInfo: {
      name: text(personal.name, 300),
      email: text(personal.email, 320),
      phone: text(personal.phone, 100),
      linkedin: text(personal.linkedin, 500),
      location: text(personal.location, 300),
      summary: text(personal.summary),
    },
    academics,
    experience,
    projects,
    positions,
    skills: Array.isArray(source.skills)
      ? source.skills.slice(0, 80).map((item) => text(item, 100)).filter(Boolean)
      : [],
    certifications: Array.isArray(source.certifications)
      ? source.certifications.slice(0, MAX_ITEMS).map((item) => text(item, 500)).filter(Boolean)
      : [],
    awards: Array.isArray(source.awards)
      ? source.awards.slice(0, MAX_ITEMS).map((item) => text(item, 1_000)).filter(Boolean)
      : [],
    jdFit: fit,
  };
}

export function buildInitialCvContent(student: Student): CvContent {
  const academics: CvAcademicEntry[] = [];
  const pg = student.pg_details ?? {};
  const graduation = student.graduation_details ?? {};

  if (pg.specialization || pg.cgpa || pg.year) {
    academics.push({
      id: "academic-pg",
      institute: "",
      course: pg.specialization ? `Postgraduate — ${pg.specialization}` : "Postgraduate programme",
      year: pg.year ? String(pg.year) : "",
      result: pg.cgpa ? `${pg.cgpa} CGPA` : "",
    });
  }
  if (graduation.college || graduation.branch || graduation.cgpa || graduation.year) {
    academics.push({
      id: "academic-graduation",
      institute: graduation.college ?? "",
      course: graduation.branch ?? "Graduation",
      year: graduation.year ? String(graduation.year) : "",
      result: graduation.cgpa ? `${graduation.cgpa} CGPA` : "",
    });
  }

  const experience: CvExperienceEntry[] = (student.prior_employers ?? []).map((employer, index) => ({
    id: `experience-profile-${index + 1}`,
    company: employer.company ?? "",
    role: employer.role ?? "",
    period: employer.duration_months ? `${employer.duration_months} months` : "",
    bullets: [],
  }));

  return normalizeCvContent({
    title: "Placement CV",
    personalInfo: {
      name: student.name,
      email: student.personal_email ?? "",
      phone: student.phone ?? "",
      linkedin: "",
      location: "",
      summary: "",
    },
    academics,
    experience,
    projects: [],
    positions: [],
    skills: [],
    certifications: (student.credentials ?? []).map((credential) =>
      typeof credential === "string" ? credential : JSON.stringify(credential),
    ),
    awards: [],
  });
}

const STOP_WORDS = new Set([
  "about", "after", "also", "and", "are", "but", "company", "for", "from", "have", "into",
  "job", "our", "role", "that", "the", "their", "this", "with", "will", "you", "your",
]);

function keywordSet(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9+#.\s-]/g, " ")
      .split(/\s+/)
      .map((word) => word.replace(/^[.-]+|[.-]+$/g, ""))
      .filter((word) => word.length >= 3 && !STOP_WORDS.has(word)),
  );
}

export function cvContentToPlainText(content: CvContent): string {
  const groups = [
    Object.values(content.personalInfo).join(" "),
    content.academics.map((row) => Object.values(row).join(" ")).join(" "),
    content.experience
      .map((row) => `${row.company} ${row.role} ${row.period} ${row.bullets.map((b) => b.text).join(" ")}`)
      .join(" "),
    content.projects
      .map((row) => `${row.name} ${row.role} ${row.period} ${row.bullets.map((b) => b.text).join(" ")}`)
      .join(" "),
    content.positions
      .map((row) => `${row.company} ${row.role} ${row.period} ${row.bullets.map((b) => b.text).join(" ")}`)
      .join(" "),
    content.skills.join(" "),
    content.certifications.join(" "),
    content.awards.join(" "),
  ];
  return groups.join("\n");
}

export function scoreCvAgainstJd(content: CvContent, jdText: string, jdId: string): CvJdFitAnalysis {
  const keywords = [...keywordSet(jdText)].slice(0, 60);
  const sectionText: Record<string, string> = {
    summary: content.personalInfo.summary,
    academics: content.academics.map((row) => Object.values(row).join(" ")).join(" "),
    experience: content.experience
      .map((row) => `${row.company} ${row.role} ${row.bullets.map((b) => b.text).join(" ")}`)
      .join(" "),
    projects: content.projects
      .map((row) => `${row.name} ${row.role} ${row.bullets.map((b) => b.text).join(" ")}`)
      .join(" "),
    skills: content.skills.join(" "),
  };
  const cvKeywords = keywordSet(cvContentToPlainText(content));
  const matchedKeywords = keywords.filter((keyword) => cvKeywords.has(keyword));
  const missingKeywords = keywords.filter((keyword) => !cvKeywords.has(keyword));
  const sectionCoverage = Object.fromEntries(
    Object.entries(sectionText).map(([section, value]) => {
      const words = keywordSet(value);
      const matches = keywords.filter((keyword) => words.has(keyword)).length;
      return [section, keywords.length ? Math.round((matches / keywords.length) * 100) : 0];
    }),
  );

  return {
    jdId,
    score: keywords.length ? Math.round((matchedKeywords.length / keywords.length) * 100) : 0,
    matchedKeywords,
    missingKeywords: missingKeywords.slice(0, 20),
    sectionCoverage,
    analyzedAt: new Date().toISOString(),
  };
}
