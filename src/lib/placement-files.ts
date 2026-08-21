export const PLACEMENT_FILES_BUCKET = "placement-files";
export const MAX_PLACEMENT_FILE_BYTES = 15 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
  "image/jpeg",
  "image/png",
]);

export type PlacementFileKind = "jd" | "cv" | "vault";

export function validatePlacementFile(value: FormDataEntryValue | null): File | null {
  if (!(value instanceof File) || value.size === 0) return null;
  if (value.size > MAX_PLACEMENT_FILE_BYTES) throw new Error("File must be 15 MB or smaller");
  if (!ALLOWED_MIME_TYPES.has(value.type)) throw new Error("Unsupported file type");
  return value;
}

function safeFileName(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-120);
  return normalized || "file";
}

export function placementFilePath(
  instituteId: string,
  kind: PlacementFileKind,
  entityId: string,
  originalName: string,
): string {
  return `${instituteId}/${kind}/${entityId}/${crypto.randomUUID()}-${safeFileName(originalName)}`;
}
