"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";

// FR-5.2: assign interview slots/rooms/links to shortlisted students. Calls
// append_application_round() (0007_spc_coordination.sql) for an atomic
// jsonb append — RLS + the student-update trigger on `applications` are
// what actually restrict this to recruiter/SPC/Admin, not this action.
export async function assignInterviewRound(jdId: string, applicationId: string, formData: FormData) {
  const ctx = await getCurrentUserContext();
  if (!ctx) redirect("/login");

  const round = String(formData.get("round") ?? "").trim();
  const scheduledAtRaw = String(formData.get("scheduled_at") ?? "");
  const location = String(formData.get("location") ?? "").trim();

  if (!round) {
    redirect(`/jds/${jdId}/applicants?error=${encodeURIComponent("Round name is required")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("append_application_round", {
    p_application_id: applicationId,
    p_round_entry: {
      round,
      scheduled_at: scheduledAtRaw ? new Date(scheduledAtRaw).toISOString() : null,
      location: location || null,
      assigned_by_user_id: ctx!.appUser.id,
      assigned_at: new Date().toISOString(),
    },
  });

  if (error) {
    redirect(`/jds/${jdId}/applicants?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/jds/${jdId}/applicants`);
}

// FR-5.4 / Section 9 open item ("who can change [staleness]" is explicitly
// unresolved in the BRD — defaulting to Admin-only, same as the defaults
// threshold, since neither the BRD nor a later revision has settled it).
export async function updateStalenessThreshold(formData: FormData) {
  const ctx = await getCurrentUserContext();
  if (!ctx || !ctx.roleNames.includes("Admin")) redirect("/dashboard");

  const days = Number(formData.get("staleness_days"));
  if (!Number.isFinite(days) || days < 1) {
    redirect(`/spc?error=${encodeURIComponent("Staleness threshold must be at least 1 day")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("institute_settings")
    .update({ staleness_days: days })
    .eq("institute_id", ctx!.appUser.institute_id);

  if (error) {
    redirect(`/spc?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/spc");
}
