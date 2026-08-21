import { parseCsvRecords } from "@/lib/csv";
import type { GraduationDetails, PgDetails, PriorEmployer } from "@/types/domain";
import type { Json } from "@/types/database.types";

// Keep the first ten columns stable for legacy headerless imports. The remaining
// columns form PlacementOS's canonical Profile Sheet contract; a real source
// sheet can reorder them and use the aliases normalized below.
export const ROSTER_COLUMNS = [
  "roll_no", "name", "section", "age", "gender", "branch", "cgpa", "specialization",
  "total_work_ex_months", "personal_email", "display_seq", "phone", "graduation_college",
  "graduation_year", "graduation_backlog_count", "pg_cgpa", "pg_year", "class_10_school",
  "class_10_board", "class_10_year", "class_10_result", "class_12_school", "class_12_board",
  "class_12_year", "class_12_result", "employer_1_company", "employer_1_role",
  "employer_1_duration_months", "employer_2_company", "employer_2_role",
  "employer_2_duration_months", "employer_3_company", "employer_3_role",
  "employer_3_duration_months", "project_1_name", "project_1_role", "project_1_period",
  "project_1_link", "project_1_description", "project_2_name", "project_2_role",
  "project_2_period", "project_2_link", "project_2_description", "position_1_organization",
  "position_1_role", "position_1_period", "position_1_description", "position_2_organization",
  "position_2_role", "position_2_period", "position_2_description", "credentials",
  "other_qualifications",
] as const;

type RosterColumn = (typeof ROSTER_COLUMNS)[number];

export interface ParsedRosterRow {
  row_number: number;
  roll_no: string;
  display_seq: number | null;
  name: string;
  section: string | null;
  age: number | null;
  gender: string | null;
  phone: string | null;
  graduation_details: GraduationDetails;
  pg_details: PgDetails;
  tenth_twelfth_details: Record<string, unknown>;
  total_work_ex_months: number;
  prior_employers: PriorEmployer[];
  credentials: Json[];
  other_qualifications: string | null;
  personal_email: string | null;
  issues: string[];
}

export interface RosterCsvPreview {
  rows: ParsedRosterRow[];
  validRows: ParsedRosterRow[];
  invalidRows: ParsedRosterRow[];
  fileIssues: string[];
}

const HEADER_ALIASES: Record<string, RosterColumn> = {
  roll_number: "roll_no", roll: "roll_no", student_name: "name", full_name: "name",
  serial_no: "display_seq", serial_number: "display_seq", s_no: "display_seq",
  email: "personal_email", email_id: "personal_email", mobile: "phone",
  mobile_number: "phone", phone_number: "phone", graduation_branch: "branch",
  graduation_cgpa: "cgpa", pg_specialization: "specialization",
  work_ex_months: "total_work_ex_months", work_experience_months: "total_work_ex_months",
  tenth_school: "class_10_school", tenth_board: "class_10_board", tenth_year: "class_10_year",
  tenth_result: "class_10_result", tenth_percentage: "class_10_result",
  twelfth_school: "class_12_school", twelfth_board: "class_12_board",
  twelfth_year: "class_12_year", twelfth_result: "class_12_result",
  twelfth_percentage: "class_12_result", other_qualification: "other_qualifications",
};

function normalizeHeader(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return HEADER_ALIASES[normalized] ?? normalized;
}

function optionalNumber(value: string, label: string, issues: string[], min: number, max: number): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    issues.push(`${label} must be between ${min} and ${max}`);
    return null;
  }
  return parsed;
}

function cleanObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== "")) as T;
}

function splitList(value: string): string[] {
  return value.split(/\r?\n|\s*;\s*/).map((item) => item.trim()).filter(Boolean);
}

export function previewRosterCsv(raw: string): RosterCsvPreview {
  const { records, unclosedQuote } = parseCsvRecords(raw.replace(/^\uFEFF/, ""));
  const fileIssues: string[] = [];
  if (unclosedQuote) fileIssues.push("The CSV contains an unclosed quoted field");
  if (records.length === 0) return { rows: [], validRows: [], invalidRows: [], fileIssues };

  const normalizedFirst = records[0].map(normalizeHeader);
  const hasHeader = normalizedFirst.includes("roll_no") || normalizedFirst.includes("name");
  const header = hasHeader ? normalizedFirst : [...ROSTER_COLUMNS];
  const startIndex = hasHeader ? 1 : 0;
  const indexes = new Map(header.map((name, index) => [name, index]));
  for (const required of ["roll_no", "name"] as const) {
    if (!indexes.has(required)) fileIssues.push(`Missing required ${required} column`);
  }
  const valueFor = (csvRow: string[], name: RosterColumn) => csvRow[indexes.get(name) ?? -1]?.trim() ?? "";

  const rows = records.slice(startIndex).map((csvRow, offset): ParsedRosterRow => {
    const issues: string[] = [];
    const value = (name: RosterColumn) => valueFor(csvRow, name);
    const rollNo = value("roll_no");
    const name = value("name");
    const age = optionalNumber(value("age"), "Age", issues, 15, 100);
    const displaySeq = optionalNumber(value("display_seq"), "Display sequence", issues, 0, 100_000);
    const graduationCgpa = optionalNumber(value("cgpa"), "Graduation CGPA", issues, 0, 10);
    const graduationYear = optionalNumber(value("graduation_year"), "Graduation year", issues, 1950, 2100);
    const graduationBacklogs = optionalNumber(value("graduation_backlog_count"), "Graduation backlogs", issues, 0, 100);
    const pgCgpa = optionalNumber(value("pg_cgpa"), "PG CGPA", issues, 0, 10);
    const pgYear = optionalNumber(value("pg_year"), "PG year", issues, 1950, 2100);
    const workEx = optionalNumber(value("total_work_ex_months"), "Work experience", issues, 0, 600);
    const email = value("personal_email");

    if (!rollNo) issues.push("Missing roll number");
    if (!name) issues.push("Missing student name");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) issues.push("Invalid email address");
    if (displaySeq !== null && !Number.isInteger(displaySeq)) issues.push("Display sequence must be a whole number");
    if (graduationBacklogs !== null && !Number.isInteger(graduationBacklogs)) issues.push("Graduation backlogs must be a whole number");

    const priorEmployers = [1, 2, 3].flatMap((index): PriorEmployer[] => {
      const company = value(`employer_${index}_company` as RosterColumn);
      const role = value(`employer_${index}_role` as RosterColumn);
      const duration = optionalNumber(value(`employer_${index}_duration_months` as RosterColumn), `Employer ${index} duration`, issues, 0, 600);
      if (!company && !role && duration === null) return [];
      if (!company) issues.push(`Employer ${index} company is required when employer details are present`);
      return [{ company, role: role || undefined, duration_months: duration ?? undefined }];
    });

    const credentials: Json[] = splitList(value("credentials"));
    for (const index of [1, 2]) {
      const project = cleanObject({ type: "project", name: value(`project_${index}_name` as RosterColumn),
        role: value(`project_${index}_role` as RosterColumn), period: value(`project_${index}_period` as RosterColumn),
        link: value(`project_${index}_link` as RosterColumn), description: value(`project_${index}_description` as RosterColumn) });
      if (Object.keys(project).length > 1) credentials.push(project);
      const position = cleanObject({ type: "position_of_responsibility",
        organization: value(`position_${index}_organization` as RosterColumn), role: value(`position_${index}_role` as RosterColumn),
        period: value(`position_${index}_period` as RosterColumn), description: value(`position_${index}_description` as RosterColumn) });
      if (Object.keys(position).length > 1) credentials.push(position);
    }

    return {
      row_number: startIndex + offset + 1, roll_no: rollNo, display_seq: displaySeq, name,
      section: value("section") || null, age, gender: value("gender") || null, phone: value("phone") || null,
      graduation_details: cleanObject({ college: value("graduation_college") || undefined, branch: value("branch") || undefined,
        cgpa: graduationCgpa ?? undefined, backlog_count: graduationBacklogs ?? undefined, year: graduationYear ?? undefined }),
      pg_details: cleanObject({ specialization: value("specialization") || undefined, cgpa: pgCgpa ?? undefined, year: pgYear ?? undefined }),
      tenth_twelfth_details: cleanObject({
        tenth: cleanObject({ school: value("class_10_school"), board: value("class_10_board"), year: value("class_10_year"), result: value("class_10_result") }),
        twelfth: cleanObject({ school: value("class_12_school"), board: value("class_12_board"), year: value("class_12_year"), result: value("class_12_result") }),
      }),
      total_work_ex_months: workEx ?? 0, prior_employers: priorEmployers, credentials,
      other_qualifications: value("other_qualifications") || null, personal_email: email || null, issues,
    };
  });

  return { rows, validRows: fileIssues.length ? [] : rows.filter((row) => row.issues.length === 0),
    invalidRows: rows.filter((row) => row.issues.length > 0), fileIssues };
}
