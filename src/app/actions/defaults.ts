"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { logAudit } from "@/lib/audit";
import type { DefaultActivityType } from "@/types/domain";

const VALID_TYPES = new Set<DefaultActivityType>(["gl", "summit", "process", "seminar"]);

interface ParsedDefaultRow {
  roll_no: string;
  activity_name: string;
  activity_type: DefaultActivityType;
  attended: boolean;
  category_total: number;
}

function parseDefaultsCsv(raw: string): { rows: ParsedDefaultRow[]; skipped: number } {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let skipped = 0;
  const rows: ParsedDefaultRow[] = [];

  for (const line of lines) {
    const cells = line.split(",").map((c) => c.trim());
    if (cells[0]?.toLowerCase() === "roll_no") continue;

    const [rollNo, activityName, activityTypeRaw, attendedRaw, categoryTotalRaw] = cells;
    const activityType = activityTypeRaw?.toLowerCase() as DefaultActivityType;

    if (!rollNo || !activityName || !VALID_TYPES.has(activityType)) {
      skipped += 1;
      continue;
    }

    rows.push({
      roll_no: rollNo,
      activity_name: activityName,
      activity_type: activityType,
      attended: attendedRaw?.toLowerCase() === "true" || attendedRaw === "1",
      category_total: categoryTotalRaw ? Number(categoryTotalRaw) : 0,
    });
  }

  return { rows, skipped };
}

// FR-6.1/FR-6.3: bulk CSV import of attendance/default data, mapped by
// roll_no to a student within the chosen batch. RLS (default_records_write,
// requires Student Data - Full) is the actual gate; matched here (not
// roleNames.includes("Admin")) so the pre-check gives a clean redirect
// instead of a confusing Postgres error for anyone RLS would actually let
// through, including SPC (holds Student Data - Full by default).
export async function importDefaults(formData: FormData) {
  const ctx = await getCurrentUserContext();
  if (!ctx || !ctx.permissionNames.has("Student Data - Full")) redirect("/dashboard");

  const batchId = String(formData.get("batch_id") ?? "");
  const csv = String(formData.get("csv") ?? "");

  if (!batchId || !csv.trim()) {
    redirect(`/admin/defaults?error=${encodeURIComponent("Batch and CSV are required")}`);
  }

  const { rows, skipped } = parseDefaultsCsv(csv);
  if (rows.length === 0) {
    redirect(`/admin/defaults?error=${encodeURIComponent("No valid rows found")}`);
  }

  const supabase = await createClient();
  const { data: students } = await supabase
    .from("students")
    .select("id, roll_no")
    .eq("batch_id", batchId);
  const rollToId = new Map((students ?? []).map((s) => [s.roll_no, s.id]));

  let unmatched = 0;
  const toUpsert = rows
    .map((row) => {
      const studentId = rollToId.get(row.roll_no);
      if (!studentId) {
        unmatched += 1;
        return null;
      }
      return {
        student_id: studentId,
        activity_name: row.activity_name,
        activity_type: row.activity_type,
        attended: row.attended,
        category_total: row.category_total,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (toUpsert.length === 0) {
    redirect(`/admin/defaults?error=${encodeURIComponent("No rows matched a student in this batch")}`);
  }

  const { error } = await supabase
    .from("default_records")
    .upsert(toUpsert, { onConflict: "student_id,activity_name" });

  if (error) {
    redirect(`/admin/defaults?error=${encodeURIComponent(error.message)}`);
  }

  await logAudit("defaults.import", "batch", batchId, { rows: toUpsert.length, skipped, unmatched });

  revalidatePath("/admin/defaults");
  redirect(`/admin/defaults?imported=${toUpsert.length}&skipped=${skipped + unmatched}`);
}

// FR-6.2: Admin-configurable threshold that blocks/warns JD eligibility.
export async function updateDefaultsThreshold(formData: FormData) {
  const ctx = await getCurrentUserContext();
  if (!ctx || !ctx.roleNames.includes("Admin")) redirect("/dashboard");

  const threshold = Number(formData.get("defaults_threshold"));
  if (!Number.isFinite(threshold) || threshold < 0) {
    redirect(`/admin/defaults?error=${encodeURIComponent("Threshold must be a non-negative number")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("institute_settings")
    .update({ defaults_threshold: threshold })
    .eq("institute_id", ctx!.appUser.institute_id);

  if (error) {
    redirect(`/admin/defaults?error=${encodeURIComponent(error.message)}`);
  }

  await logAudit("defaults.threshold_updated", "institute_settings", ctx!.appUser.institute_id, {
    defaults_threshold: threshold,
  });

  revalidatePath("/admin/defaults");
}
