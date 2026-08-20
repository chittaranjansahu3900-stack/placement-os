import { parseCsvRecords } from "@/lib/csv";
import type { PipelineStage } from "@/types/domain";

export const COMPANY_IMPORT_COLUMNS = ["name", "sector", "pipeline_stage"] as const;
const PIPELINE_STAGES: PipelineStage[] = ["prospect", "contacted", "interested", "committed", "onboarded"];

export interface ParsedCompanyRow {
  row_number: number;
  name: string;
  sector: string | null;
  pipeline_stage: PipelineStage;
  issues: string[];
}

export interface CompanyCsvPreview {
  rows: ParsedCompanyRow[];
  validRows: ParsedCompanyRow[];
  invalidRows: ParsedCompanyRow[];
  fileIssues: string[];
}

export function previewCompanyCsv(raw: string): CompanyCsvPreview {
  const { records, unclosedQuote } = parseCsvRecords(raw.replace(/^\uFEFF/, ""));
  const fileIssues: string[] = [];
  if (unclosedQuote) fileIssues.push("The CSV contains an unclosed quoted field");
  if (records.length === 0) return { rows: [], validRows: [], invalidRows: [], fileIssues };

  const normalizedFirst = records[0].map((cell) => cell.trim().toLowerCase());
  const hasHeader = normalizedFirst.includes("name") || normalizedFirst.includes("pipeline_stage");
  const header = hasHeader ? normalizedFirst : [...COMPANY_IMPORT_COLUMNS];
  const startIndex = hasHeader ? 1 : 0;
  const indexes = new Map(header.map((name, index) => [name, index]));
  if (!indexes.has("name")) fileIssues.push("Missing required name column");

  const valueFor = (record: string[], name: (typeof COMPANY_IMPORT_COLUMNS)[number]) =>
    record[indexes.get(name) ?? -1]?.trim() ?? "";
  const seenNames = new Set<string>();

  const rows = records.slice(startIndex).map((record, offset): ParsedCompanyRow => {
    const issues: string[] = [];
    const name = valueFor(record, "name");
    const normalizedName = name.toLocaleLowerCase();
    const rawStage = valueFor(record, "pipeline_stage").toLocaleLowerCase().replaceAll(" ", "_");
    const pipelineStage = (rawStage || "prospect") as PipelineStage;
    if (!name) issues.push("Missing company name");
    if (name && seenNames.has(normalizedName)) issues.push("Duplicate company name in this file");
    if (!PIPELINE_STAGES.includes(pipelineStage)) issues.push("Invalid pipeline stage");
    if (name) seenNames.add(normalizedName);

    return {
      row_number: startIndex + offset + 1,
      name,
      sector: valueFor(record, "sector") || null,
      pipeline_stage: PIPELINE_STAGES.includes(pipelineStage) ? pipelineStage : "prospect",
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
