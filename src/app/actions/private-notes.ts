"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";

// FR-4.5: "Recruiters can add private notes per candidate, not visible to
// the student." application_private_notes (0012_codex_audit_fixes.sql) has
// no student-visible SELECT branch at all — RLS is the real guarantee here,
// not this action; this is just the UI that was still missing on top of
// that table (the security fix landed before any feature used the column).
export async function addPrivateNote(jdId: string, applicationId: string, formData: FormData) {
  const ctx = await getCurrentUserContext();
  if (!ctx) redirect("/login");

  const noteText = String(formData.get("note_text") ?? "").trim();
  if (!noteText) {
    redirect(`/jds/${jdId}/applicants?error=${encodeURIComponent("Note text is required")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("application_private_notes").insert({
    application_id: applicationId,
    author_user_id: ctx!.appUser.id,
    note_text: noteText,
  });

  if (error) {
    redirect(`/jds/${jdId}/applicants?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/jds/${jdId}/applicants`);
}
