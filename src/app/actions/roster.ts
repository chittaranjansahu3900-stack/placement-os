"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { previewRosterCsv } from "@/lib/roster-csv";
import type { Database, Json } from "@/types/database.types";

type StudentInsert = Database["public"]["Tables"]["students"]["Insert"];

// FR-9.1: bulk student roster import. Appendix D asks for real review
// before an unattended import — RosterImportReview renders the staged
// preview from previewRosterCsv() client-side so the Admin sees exactly
// which rows will land before confirming, but that's a UX gate, not the
// security boundary: this action re-runs previewRosterCsv() itself
// server-side rather than trusting the client's rendered preview or
// whatever review_confirmed claims.
//
// Runs on the Admin's own session, not service role: RLS (students_write)
// already requires Student Data - Full, which is exactly the right check —
// matched here (not roleNames.includes("Admin")) so a custom role granted
// Student Data - Full, or SPC (which holds it by default per Section 7.2),
// isn't redirected away from a write RLS would actually allow.
export async function importRoster(formData: FormData) {
  const ctx = await getCurrentUserContext();
  if (!ctx || !ctx.permissionNames.has("Student Data - Full")) redirect("/dashboard");

  const batchId = String(formData.get("batch_id") ?? "");
  const csv = String(formData.get("csv") ?? "");
  const reviewConfirmed = String(formData.get("review_confirmed") ?? "") === "true";

  if (!batchId || !csv.trim()) {
    redirect(`/admin/roster?error=${encodeURIComponent("Batch and roster CSV are required")}`);
  }
  if (!reviewConfirmed) {
    redirect(`/admin/roster?error=${encodeURIComponent("Review the staged rows before confirming import")}`);
  }

  const preview = previewRosterCsv(csv);
  const rows = preview.validRows;
  const skipped = preview.invalidRows.length;

  if (preview.fileIssues.length > 0 || rows.length === 0) {
    redirect(
      `/admin/roster?error=${encodeURIComponent(preview.fileIssues[0] ?? "No valid rows found")}`,
    );
  }

  const supabase = await createClient();
  const payload: StudentInsert[] = rows.map((row) => ({
      roll_no: row.roll_no,
      display_seq: row.display_seq,
      name: row.name,
      section: row.section,
      age: row.age,
      gender: row.gender,
      phone: row.phone,
      graduation_details: row.graduation_details as unknown as Json,
      pg_details: row.pg_details as unknown as Json,
      tenth_twelfth_details: row.tenth_twelfth_details as Json,
      total_work_ex_months: row.total_work_ex_months,
      prior_employers: row.prior_employers as unknown as Json,
      credentials: row.credentials,
      other_qualifications: row.other_qualifications,
      personal_email: row.personal_email,
      batch_id: batchId,
    }));
  const { error } = await supabase.from("students").upsert(
    payload,
    { onConflict: "batch_id,roll_no" },
  );

  if (error) {
    redirect(`/admin/roster?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/roster");
  redirect(`/admin/roster?imported=${rows.length}&skipped=${skipped}`);
}

function generateTempPassword(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(9)))
    .map((b) => b.toString(36))
    .join("")
    .slice(0, 12);
}

export interface CreateLoginState {
  password?: string;
  studentName?: string;
  error?: string;
}

// Section 7.5's real answer here is "Student: SSO auto-activates" — Section
// 9 leaves the SSO provider unresolved, so until that lands, an Admin can
// provision a direct login and hand the one-time password to the student
// out of band. Always goes through the service-role client: `users` has no
// client-insert RLS policy at all, by design (0002_rls_policies.sql), even
// for Admins acting on their own session — which means this function's own
// check IS the entire authorization boundary, with no RLS backstop. Gated
// on User Management (not roleNames.includes("Admin")): provisioning a
// login is an account-activation action, squarely that Permission Set's
// domain per Section 7.3, and Admin holds it by default anyway.
export async function createStudentLogin(
  _prevState: CreateLoginState | undefined,
  formData: FormData,
): Promise<CreateLoginState> {
  const ctx = await getCurrentUserContext();
  if (!ctx || !ctx.permissionNames.has("User Management")) {
    return { error: "Not authorized" };
  }

  const studentId = String(formData.get("student_id") ?? "");
  if (!studentId) return { error: "Missing student" };

  const supabase = await createClient();
  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id, name, personal_email, batch_id, user_id")
    .eq("id", studentId)
    .single();

  if (studentError || !student) return { error: "Student not found" };
  if (student.user_id) return { error: "This student already has a login" };
  if (!student.personal_email) return { error: "Student has no email on file to use as a login" };

  const service = createServiceClient();
  const password = generateTempPassword();

  const { data: created, error: createError } = await service.auth.admin.createUser({
    email: student.personal_email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    return { error: createError?.message ?? "Could not create login" };
  }

  const { data: userRow, error: userError } = await service
    .from("users")
    .insert({
      institute_id: ctx.appUser.institute_id,
      auth_user_id: created.user.id,
      name: student.name,
      email: student.personal_email,
      status: "active",
      batch_id: student.batch_id,
    })
    .select("id")
    .single();

  if (userError || !userRow) {
    return { error: userError?.message ?? "Could not create user record" };
  }

  const { data: studentRole } = await service
    .from("roles")
    .select("id")
    .is("institute_id", null)
    .eq("name", "Student")
    .single();

  if (studentRole) {
    await service.from("user_roles").insert({ user_id: userRow.id, role_id: studentRole.id });
  }

  await service.from("students").update({ user_id: userRow.id }).eq("id", studentId);

  revalidatePath("/admin/roster");
  return { password, studentName: student.name };
}
