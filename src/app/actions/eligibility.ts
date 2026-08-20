"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext, type CurrentUserContext } from "@/lib/auth/current-user";
import { logAudit } from "@/lib/audit";

// FR-2.5: "Admin can manually add/remove specific students from an eligible
// list before the notification sends." jd_eligibility_overrides RLS
// (0018) already requires Student Data - Full; this just avoids a
// confusing Postgres error for anyone else and gives the redirect a place
// to land.
async function requireEligibilityAccess(jdId: string): Promise<CurrentUserContext> {
  const ctx = await getCurrentUserContext();
  if (!ctx || !ctx.permissionNames.has("Student Data - Full")) {
    redirect(`/jds/${jdId}?error=${encodeURIComponent("Not authorized")}`);
  }
  return ctx;
}

export async function excludeStudentFromJd(jdId: string, studentId: string) {
  const ctx = await requireEligibilityAccess(jdId);
  const supabase = await createClient();
  const { error } = await supabase.from("jd_eligibility_overrides").upsert(
    { jd_id: jdId, student_id: studentId, override_type: "exclude", created_by_user_id: ctx.appUser.id },
    { onConflict: "jd_id,student_id" },
  );
  if (error) redirect(`/jds/${jdId}/eligibility?error=${encodeURIComponent(error.message)}`);
  await logAudit("jd.eligibility_excluded", "jd", jdId, { student_id: studentId });
  revalidatePath(`/jds/${jdId}/eligibility`);
}

export async function includeStudentInJd(jdId: string, formData: FormData) {
  const ctx = await requireEligibilityAccess(jdId);
  const studentId = String(formData.get("student_id") ?? "");
  if (!studentId) redirect(`/jds/${jdId}/eligibility?error=${encodeURIComponent("Choose a student")}`);

  const supabase = await createClient();
  const { error } = await supabase.from("jd_eligibility_overrides").upsert(
    { jd_id: jdId, student_id: studentId, override_type: "include", created_by_user_id: ctx.appUser.id },
    { onConflict: "jd_id,student_id" },
  );
  if (error) redirect(`/jds/${jdId}/eligibility?error=${encodeURIComponent(error.message)}`);
  await logAudit("jd.eligibility_included", "jd", jdId, { student_id: studentId });
  revalidatePath(`/jds/${jdId}/eligibility`);
}

export async function removeEligibilityOverride(jdId: string, studentId: string) {
  await requireEligibilityAccess(jdId);
  const supabase = await createClient();
  const { error } = await supabase
    .from("jd_eligibility_overrides")
    .delete()
    .eq("jd_id", jdId)
    .eq("student_id", studentId);
  if (error) redirect(`/jds/${jdId}/eligibility?error=${encodeURIComponent(error.message)}`);
  await logAudit("jd.eligibility_override_removed", "jd", jdId, { student_id: studentId });
  revalidatePath(`/jds/${jdId}/eligibility`);
}
