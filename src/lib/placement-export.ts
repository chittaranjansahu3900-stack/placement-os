export const REPORT_TEMPLATES = [
  { id: "official-wide", name: "Official Final Placement Datasheet", description: "Source-compatible four-column block per company" },
  { id: "accreditation", name: "Accreditation Detail", description: "Configurable one-row-per-student evidence extract" },
  { id: "public-summary", name: "Public Company Summary", description: "Aggregated company outcomes without student identifiers" },
] as const;

export const ACCREDITATION_FIELDS = [
  ["roll_no", "Roll No"], ["name", "Student Name"], ["section", "Section"],
  ["branch", "Branch"], ["specialization", "Specialization"],
  ["placement_status", "Placement Status"], ["company", "Company"],
  ["role", "Role"], ["ctc", "Final CTC"], ["offer_date", "Offer Date"],
] as const;

export type ReportTemplateId = (typeof REPORT_TEMPLATES)[number]["id"];
export type AccreditationFieldId = (typeof ACCREDITATION_FIELDS)[number][0];

export interface PlacementExportDataset {
  batch: { id: string; name: string; starts_on: string | null; ends_on: string | null };
  students: Array<{ id: string; roll_no: string; name: string; section: string | null; branch: string | null; specialization: string | null; placement_status: string }>;
  placements: Array<{ student_id: string; company_id: string; company_name: string; jd_id: string | null; final_ctc: number | null; role_title: string | null; offer_date: string | null }>;
  jds: Array<{ id: string; company_id: string; company_name: string; role_title: string; date_floated: string }>;
  applications: Array<{ student_id: string; jd_id: string; round_history: Array<{ round?: string; scheduled_at?: string | null; location?: string | null }> }>;
}

export function normalizeReportTemplate(value: string | null): ReportTemplateId {
  return REPORT_TEMPLATES.some((template) => template.id === value) ? value as ReportTemplateId : "official-wide";
}

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: unknown[][]): string {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
}

function isoDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function companyIds(dataset: PlacementExportDataset): Array<{ id: string; name: string }> {
  const companies = new Map<string, string>();
  for (const jd of dataset.jds) companies.set(jd.company_id, jd.company_name);
  for (const placement of dataset.placements) companies.set(placement.company_id, placement.company_name);
  return [...companies].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

function officialWide(dataset: PlacementExportDataset, includeUnplaced: boolean): string {
  const companies = companyIds(dataset);
  const placementByStudent = new Map(dataset.placements.map((placement) => [placement.student_id, placement]));
  const companyMeta = new Map(companies.map((company) => {
    const jds = dataset.jds.filter((jd) => jd.company_id === company.id);
    const jdIds = new Set(jds.map((jd) => jd.id));
    const processDates = dataset.applications
      .filter((application) => jdIds.has(application.jd_id))
      .flatMap((application) => application.round_history ?? [])
      .map((round) => isoDate(round.scheduled_at));
    processDates.push(...dataset.placements.filter((placement) => placement.company_id === company.id).map((placement) => isoDate(placement.offer_date)));
    return [company.id, {
      floated: unique(jds.map((jd) => isoDate(jd.date_floated))).join(", "),
      process: unique(processDates).sort().join(", "),
      profiles: unique(jds.map((jd) => jd.role_title).concat(dataset.placements.filter((placement) => placement.company_id === company.id).map((placement) => placement.role_title ?? ""))).join(" | "),
    }];
  }));

  const placedCount = dataset.placements.length;
  const ctcValues = dataset.placements.map((placement) => placement.final_ctc).filter((value): value is number => value != null);
  const rows: unknown[][] = [
    ["Final Placement Datasheet", dataset.batch.name],
    ["Generated from PlacementOS", "", "Placed", placedCount, "Total Students", dataset.students.length, "Average Package", ctcValues.length ? (ctcValues.reduce((a, b) => a + b, 0) / ctcValues.length).toFixed(2) : ""],
    [],
    ["Roll No", "Student Name", ...companies.flatMap((company) => [company.name, "", "", ""])],
    ["", "", ...companies.flatMap(() => ["Date Floated", "Date of Process", "Profiles Offered", "Result / Package"])],
  ];
  const students = dataset.students.filter((student) => includeUnplaced || placementByStudent.has(student.id));
  for (const student of students) {
    const placement = placementByStudent.get(student.id);
    rows.push([student.roll_no, student.name, ...companies.flatMap((company) => {
      const meta = companyMeta.get(company.id);
      const result = placement?.company_id === company.id
        ? ["Placed", placement.role_title, placement.final_ctc != null ? `${placement.final_ctc} LPA` : "", isoDate(placement.offer_date)].filter(Boolean).join(" | ")
        : "";
      return [meta?.floated ?? "", meta?.process ?? "", meta?.profiles ?? "", result];
    })]);
  }
  return toCsv(rows);
}

function accreditation(dataset: PlacementExportDataset, fields: Set<AccreditationFieldId>, includeUnplaced: boolean): string {
  const placementByStudent = new Map(dataset.placements.map((placement) => [placement.student_id, placement]));
  const activeFields = ACCREDITATION_FIELDS.filter(([id]) => fields.has(id));
  const rows: unknown[][] = [activeFields.map(([, label]) => label)];
  for (const student of dataset.students) {
    const placement = placementByStudent.get(student.id);
    if (!includeUnplaced && !placement) continue;
    const values: Record<AccreditationFieldId, unknown> = {
      roll_no: student.roll_no, name: student.name, section: student.section, branch: student.branch,
      specialization: student.specialization, placement_status: student.placement_status,
      company: placement?.company_name, role: placement?.role_title, ctc: placement?.final_ctc,
      offer_date: placement?.offer_date,
    };
    rows.push(activeFields.map(([id]) => values[id]));
  }
  return toCsv(rows);
}

function publicSummary(dataset: PlacementExportDataset): string {
  const rows: unknown[][] = [["Company", "Profiles Offered", "Students Placed", "Average CTC", "Highest CTC"]];
  for (const company of companyIds(dataset)) {
    const placements = dataset.placements.filter((placement) => placement.company_id === company.id);
    const ctcs = placements.map((placement) => placement.final_ctc).filter((value): value is number => value != null);
    const profiles = unique(dataset.jds.filter((jd) => jd.company_id === company.id).map((jd) => jd.role_title));
    rows.push([company.name, profiles.join(" | "), placements.length, ctcs.length ? (ctcs.reduce((a, b) => a + b, 0) / ctcs.length).toFixed(2) : "", ctcs.length ? Math.max(...ctcs) : ""]);
  }
  return toCsv(rows);
}

export function buildPlacementCsv(dataset: PlacementExportDataset, template: ReportTemplateId, requestedFields: string[], includeUnplaced: boolean): string {
  if (template === "official-wide") return officialWide(dataset, includeUnplaced);
  if (template === "public-summary") return publicSummary(dataset);
  const allowed = new Set(ACCREDITATION_FIELDS.map(([id]) => id));
  const fields = new Set(requestedFields.filter((field): field is AccreditationFieldId => allowed.has(field as AccreditationFieldId)));
  if (fields.size === 0) ACCREDITATION_FIELDS.forEach(([field]) => fields.add(field));
  return accreditation(dataset, fields, includeUnplaced);
}
