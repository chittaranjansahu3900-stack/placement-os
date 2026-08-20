"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { logAudit } from "@/lib/audit";

// Section 3.1 Step 7 / 3.2 Step 6: "On selection, their record locks in as
// Placed." Nothing in the schema does that automatically when an
// application's status becomes 'selected' — a recruiter marking someone
// selected is not the same claim as "this offer is final and accepted,"
// so this is a deliberate separate confirmation step, gated to whoever
// holds Student Data - Full rather than the recruiter who set the status.
// placement_records_write RLS already enforces that gate on the exact same
// Permission Set; the check below just avoids a confusing Postgres error
// for anyone else (and, checking permission rather than role name, doesn't
// wrongly block a custom role that holds it — e.g. Senior SPC).
export async function confirmPlacement(
  jdId: string,
  studentId: string,
  companyId: string,
  formData: FormData,
) {
  const ctx = await getCurrentUserContext();
  if (!ctx || !ctx.permissionNames.has("Student Data - Full")) {
    redirect(`/jds/${jdId}/applicants?error=${encodeURIComponent("Not authorized")}`);
  }

  const finalCtc = formData.get("final_ctc") ? Number(formData.get("final_ctc")) : null;
  const roleTitle = String(formData.get("role_title") ?? "").trim() || null;

  const supabase = await createClient();
  const { error: insertError } = await supabase.from("placement_records").insert({
    student_id: studentId,
    company_id: companyId,
    jd_id: jdId,
    final_ctc: finalCtc,
    role_title: roleTitle,
    offer_date: new Date().toISOString().slice(0, 10),
  });

  if (insertError) {
    redirect(`/jds/${jdId}/applicants?error=${encodeURIComponent(insertError.message)}`);
  }

  const { error: updateError } = await supabase
    .from("students")
    .update({ placement_status: "placed" })
    .eq("id", studentId);

  if (updateError) {
    redirect(`/jds/${jdId}/applicants?error=${encodeURIComponent(updateError.message)}`);
  }

  await logAudit("placement.confirmed", "student", studentId, { jd_id: jdId, company_id: companyId, final_ctc: finalCtc });

  revalidatePath(`/jds/${jdId}/applicants`);
  revalidatePath("/reports");
}
