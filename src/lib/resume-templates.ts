export const CV_TEMPLATES = [
  { id: "placement-cell-v2", name: "Placement Cell Classic", description: "Traditional recruiter-friendly single-column format" },
  { id: "modern-blue-v1", name: "Modern Blue", description: "Contemporary blue header and accent sections" },
  { id: "compact-executive-v1", name: "Compact Executive", description: "Denser layout for experienced candidates" },
] as const;

export type CvTemplateId = (typeof CV_TEMPLATES)[number]["id"];

export function normalizeCvTemplateId(value: unknown): CvTemplateId {
  const candidate = typeof value === "string" ? value : "";
  return CV_TEMPLATES.some((template) => template.id === candidate)
    ? (candidate as CvTemplateId)
    : "placement-cell-v2";
}
