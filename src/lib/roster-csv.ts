import type { GraduationDetails, PgDetails } from "@/types/domain";
import { parseCsvRecords } from "@/lib/csv";

export const ROSTER_COLUMNS = [
  "roll_no",
  "name",
  "section",
  "age",
  "gender",
  "branch",
  "cgpa",
  "specialization",
  "total_work_ex_months",
  "personal_email",
] as const;

export interface ParsedRosterRow {
  row_number: number;
  roll_no: string;
  name: string;
  section: string | null;
  age: number | null;
  gender: string | null;
  graduation_details: GraduationDetails;
  pg_details: PgDetails;
  total_work_ex_months: number;
  personal_email: string | null;
  issues: string[];
}

export interface RosterCsvPreview {
  rows: ParsedRosterRow[];
  validRows: ParsedRosterRow[];
  invalidRows: ParsedRosterRow[];
  fileIssues: string[];
}

function optionalNumber(
  value: string,
  label: string,
  issues: string[],
  min: number,
  max: number,
): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    issues.push(`${label} must be between ${min} and ${max}`);
    return null;
  }
  return parsed;
}

export function previewRosterCsv(raw: string): RosterCsvPreview {
  const { records, unclosedQuote } = parseCsvRecords(raw.replace(/^\uFEFF/, ""));
  const fileIssues: string[] = [];
  if (unclosedQuote) fileIssues.push("The CSV contains an unclosed quoted field");
  if (records.length === 0) return { rows: [], validRows: [], invalidRows: [], fileIssues };

  const normalizedFirst = records[0].map((cell) => cell.trim().toLowerCase());
  const hasHeader = normalizedFirst.includes("roll_no") || normalizedFirst.includes("name");
  const header = hasHeader ? normalizedFirst : [...ROSTER_COLUMNS];
  const startIndex = hasHeader ? 1 : 0;
  const indexes = new Map(header.map((name, index) => [name, index]));

  for (const required of ["roll_no", "name"] as const) {
    if (!indexes.has(required)) fileIssues.push(`Missing required ${required} column`);
  }

  const valueFor = (record: string[], name: (typeof ROSTER_COLUMNS)[number]) =>
    record[indexes.get(name) ?? -1]?.trim() ?? "";

  const rows = records.slice(startIndex).map((record, offset): ParsedRosterRow => {
    const issues: string[] = [];
    const rollNo = valueFor(record, "roll_no");
    const name = valueFor(record, "name");
    const age = optionalNumber(valueFor(record, "age"), "Age", issues, 15, 100);
    const cgpa = optionalNumber(valueFor(record, "cgpa"), "CGPA", issues, 0, 10);
    const workEx = optionalNumber(valueFor(record, "total_work_ex_months"), "Work experience", issues, 0, 600);
    const email = valueFor(record, "personal_email");

    if (!rollNo) issues.push("Missing roll number");
    if (!name) issues.push("Missing student name");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) issues.push("Invalid email address");

    return {
      row_number: startIndex + offset + 1,
      roll_no: rollNo,
      name,
      section: valueFor(record, "section") || null,
      age,
      gender: valueFor(record, "gender") || null,
      graduation_details: {
        branch: valueFor(record, "branch") || undefined,
        cgpa: cgpa ?? undefined,
      },
      pg_details: { specialization: valueFor(record, "specialization") || undefined },
      total_work_ex_months: workEx ?? 0,
      personal_email: email || null,
      issues,
    };
  });

  return {
    rows,
    validRows: fileIssues.length ? [] : rows.filter((row) => row.issues.length === 0),
    invalidRows: rows.filter((row) => row.issues.length > 0),
    fileIssues,
  };
}
