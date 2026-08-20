"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { logAudit } from "@/lib/audit";
import type { JdStatus } from "@/types/domain";

function splitCsv(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// FR-1.2/FR-1.3: JDs are always created as Draft. RLS (jds_insert) restricts
// company_id to the caller's own company unless they're Admin (no
// company_id) — this action doesn't need to re-check that itself.
export async function createJd(formData: FormData) {
  const ctx = await getCurrentUserContext();
  if (!ctx) redirect("/login");

  const companyId = String(formData.get("company_id") ?? "");
  const batchId = String(formData.get("batch_id") ?? "");
  const roleTitle = String(formData.get("role_title") ?? "").trim();
  const grade = String(formData.get("grade") ?? "").trim() || null;
  const applyByRaw = String(formData.get("apply_by_deadline") ?? "");
  const ctcFixed = formData.get("ctc_fixed") ? Number(formData.get("ctc_fixed")) : null;
  const ctcVariable = formData.get("ctc_variable") ? Number(formData.get("ctc_variable")) : null;
  const ctcTotalRaw = formData.get("ctc_total") ? Number(formData.get("ctc_total")) : null;
  const minCgpa = formData.get("min_cgpa") ? Number(formData.get("min_cgpa")) : null;
  const maxBacklog = formData.get("max_backlog") ? Number(formData.get("max_backlog")) : null;
  const openPositions = formData.get("open_positions") ? Number(formData.get("open_positions")) : null;
  const unplacedOnly = formData.get("unplaced_only") === "on";
  const adminApprovalRequired = formData.get("admin_approval_required") === "on";

  if (!companyId || !roleTitle || !batchId || !applyByRaw) {
    redirect(
      `/jds/new?error=${encodeURIComponent("Company, role title, batch, and deadline are required")}`,
    );
  }

  // FR-1.2 "explicit total CTC handling": an explicit value always wins;
  // otherwise derive from fixed+variable same as before.
  const ctcTotal =
    ctcTotalRaw ?? (ctcFixed != null && ctcVariable != null ? ctcFixed + ctcVariable : ctcFixed);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jds")
    .insert({
      company_id: companyId,
      batch_id: batchId,
      created_by_user_id: ctx!.appUser.id,
      role_title: roleTitle,
      grade,
      ctc_fixed: ctcFixed,
      ctc_variable: ctcVariable,
      ctc_total: ctcTotal,
      min_cgpa: minCgpa,
      max_backlog: maxBacklog,
      open_positions: openPositions,
      unplaced_only: unplacedOnly,
      admin_approval_required: adminApprovalRequired,
      locations: splitCsv(formData.get("locations")),
      eligible_branches: splitCsv(formData.get("eligible_branches")),
      eligible_specializations: splitCsv(formData.get("eligible_specializations")),
      apply_by_deadline: new Date(applyByRaw).toISOString(),
      status: "draft",
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(`/jds/new?error=${encodeURIComponent(error?.message ?? "Could not create JD")}`);
  }

  revalidatePath("/companies");
  redirect(`/jds/${data!.id}`);
}

// FR-1.3: Draft -> Published. If the JD has admin_approval_required set,
// jds_status_transition_guard (0013) blocks anyone but an Admin from making
// this specific transition — the trigger's exception message surfaces
// through `error.message` below, no separate check needed here.
export async function publishJd(jdId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("jds").update({ status: "published" }).eq("id", jdId);
  if (error) {
    redirect(`/jds/${jdId}?error=${encodeURIComponent(error.message)}`);
  }
  await logAudit("jd.published", "jd", jdId, {});
  revalidatePath(`/jds/${jdId}`);
}

// FR-1.3: the rest of the lifecycle — Published -> Applications Closed ->
// Shortlisting -> Closed (or Published -> Closed directly). Same
// enforcement point as publishJd: 0013's trigger is the actual state-machine
// boundary, this just triggers the attempt and surfaces whatever it says.
export async function advanceJdStatus(jdId: string, nextStatus: JdStatus) {
  const supabase = await createClient();
  const { error } = await supabase.from("jds").update({ status: nextStatus }).eq("id", jdId);
  if (error) {
    redirect(`/jds/${jdId}?error=${encodeURIComponent(error.message)}`);
  }
  await logAudit("jd.status_advanced", "jd", jdId, { status: nextStatus });
  revalidatePath(`/jds/${jdId}`);
}
