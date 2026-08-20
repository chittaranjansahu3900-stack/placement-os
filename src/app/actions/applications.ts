"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";

async function getMyStudentId(): Promise<string | null> {
  const ctx = await getCurrentUserContext();
  if (!ctx) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("students")
    .select("id")
    .eq("user_id", ctx.appUser.id)
    .single();
  return data?.id ?? null;
}

// FR-3.1/FR-10.6: one-click apply — the student's current CV auto-attaches
// as an immutable snapshot (later CV edits don't alter an already-submitted
// packet). Blocks applying with no CV at all rather than silently applying
// with cv_document_id null. attach_latest_cv_to_application() (0009)
// independently re-verifies the CV belongs to this student either way.
export async function applyToJd(formData: FormData) {
  const jdId = String(formData.get("jd_id") ?? "");
  if (!jdId) redirect("/jobs");

  const studentId = await getMyStudentId();
  if (!studentId) {
    redirect(`/jobs?error=${encodeURIComponent("No student profile linked to your account")}`);
  }

  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select("latest_cv_document_id")
    .eq("id", studentId)
    .single();

  if (!student?.latest_cv_document_id) {
    redirect(`/jobs?error=${encodeURIComponent("Create and save a CV before applying")}`);
  }

  const { error } = await supabase.from("applications").insert({
    student_id: studentId,
    jd_id: jdId,
    cv_document_id: student.latest_cv_document_id,
  });

  if (error) {
    redirect(`/jobs?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/jobs");
  revalidatePath("/applications");
  redirect("/applications");
}

// FR-3.2: withdraw any time before the deadline.
export async function withdrawApplication(formData: FormData) {
  const applicationId = String(formData.get("application_id") ?? "");
  if (!applicationId) redirect("/applications");

  const supabase = await createClient();
  const { data: application } = await supabase
    .from("applications")
    .select("id, jds(apply_by_deadline)")
    .eq("id", applicationId)
    .single();

  const deadline = (application as unknown as { jds: { apply_by_deadline: string } | null })?.jds
    ?.apply_by_deadline;

  if (!application || !deadline || new Date(deadline) <= new Date()) {
    redirect(`/applications?error=${encodeURIComponent("Deadline has passed — can't withdraw")}`);
  }

  const { error } = await supabase
    .from("applications")
    .update({ withdrawn_at: new Date().toISOString() })
    .eq("id", applicationId);

  if (error) {
    redirect(`/applications?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/applications");
}
