"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { logAudit } from "@/lib/audit";
import { queueJdPublishedNotifications } from "@/lib/notifications/workflows";
import {
  PLACEMENT_FILES_BUCKET,
  placementFilePath,
  validatePlacementFile,
} from "@/lib/placement-files";
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
  let attachment: File | null;
  try {
    attachment = validatePlacementFile(formData.get("jd_attachment"));
  } catch (attachmentError) {
    redirect(`/jds/new?error=${encodeURIComponent(attachmentError instanceof Error ? attachmentError.message : "Invalid attachment")}`);
  }

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

  if (attachment) {
    const path = placementFilePath(ctx.appUser.institute_id, "jd", data.id, attachment.name);
    const { error: uploadError } = await supabase.storage
      .from(PLACEMENT_FILES_BUCKET)
      .upload(path, attachment, { contentType: attachment.type, upsert: false });
    if (uploadError) {
      redirect(`/jds/${data.id}?error=${encodeURIComponent(`Draft saved, but attachment upload failed: ${uploadError.message}`)}`);
    }
    const { error: attachmentError } = await supabase
      .from("jds")
      .update({ jd_attachment_url: path })
      .eq("id", data.id);
    if (attachmentError) {
      await supabase.storage.from(PLACEMENT_FILES_BUCKET).remove([path]);
      redirect(`/jds/${data.id}?error=${encodeURIComponent(`Draft saved, but attachment could not be linked: ${attachmentError.message}`)}`);
    }
  }

  revalidatePath("/companies");
  redirect(`/jds/${data!.id}`);
}

// FR-1.3: Draft -> Published. If the JD has admin_approval_required set,
// jds_status_transition_guard (0013) blocks anyone but an Admin from making
// this specific transition — the trigger's exception message surfaces
// through `error.message` below, no separate check needed here.
export async function publishJd(jdId: string) {
  const ctx = await getCurrentUserContext();
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jds")
    .update({ status: "published" })
    .eq("id", jdId)
    .select("id")
    .single();
  if (error || !data) {
    redirect(`/jds/${jdId}?error=${encodeURIComponent(error?.message ?? "JD could not be published")}`);
  }
  await logAudit("jd.published", "jd", jdId, {});

  let notice: string;
  try {
    const summary = await queueJdPublishedNotifications(jdId, ctx.appUser.id);
    notice = summary.total === 0
      ? "JD published. No eligible students with an email address were found."
      : `JD published. ${summary.total} notification(s) queued: ${summary.sent} sent, ${summary.blocked} awaiting configuration, ${summary.failed} failed.`;
  } catch (notificationError) {
    notice = `JD published, but notifications could not be queued: ${notificationError instanceof Error ? notificationError.message : "unknown error"}`;
  }
  revalidatePath(`/jds/${jdId}`);
  redirect(`/jds/${jdId}?notice=${encodeURIComponent(notice)}`);
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

// FR-1.5: clone a visible historical/current JD into an active target season.
// Applications, status, timestamps, and notification history are intentionally
// not copied; the result is always a fresh draft with a new deadline.
export async function cloneJdToSeason(sourceJdId: string, formData: FormData) {
  const ctx = await getCurrentUserContext();
  if (!ctx) redirect("/login");
  const targetBatchId = String(formData.get("target_batch_id") ?? "");
  const deadline = new Date(String(formData.get("apply_by_deadline") ?? ""));
  const reuseAttachment = formData.get("reuse_attachment") === "on";
  if (!targetBatchId || Number.isNaN(deadline.getTime())) {
    redirect(`/jds?error=${encodeURIComponent("Choose an active season and a valid application deadline")}`);
  }

  const supabase = await createClient();
  const [{ data: source, error: sourceError }, { data: batch, error: batchError }] = await Promise.all([
    supabase.from("jds").select("*").eq("id", sourceJdId).single(),
    supabase.from("batches").select("id, is_active").eq("id", targetBatchId).eq("is_active", true).single(),
  ]);
  if (sourceError || !source) redirect(`/jds?error=${encodeURIComponent("Source JD not found or not authorized")}`);
  if (batchError || !batch) redirect(`/jds?error=${encodeURIComponent("Target season must be active")}`);

  const { data: clone, error } = await supabase
    .from("jds")
    .insert({
      company_id: source.company_id,
      batch_id: batch.id,
      created_by_user_id: ctx.appUser.id,
      role_title: source.role_title,
      grade: source.grade,
      ctc_fixed: source.ctc_fixed,
      ctc_variable: source.ctc_variable,
      ctc_total: source.ctc_total,
      locations: source.locations,
      eligible_branches: source.eligible_branches,
      eligible_specializations: source.eligible_specializations,
      min_cgpa: source.min_cgpa,
      max_backlog: source.max_backlog,
      unplaced_only: source.unplaced_only,
      open_positions: source.open_positions,
      jd_attachment_url: reuseAttachment ? source.jd_attachment_url : null,
      apply_by_deadline: deadline.toISOString(),
      status: "draft",
      admin_approval_required: source.admin_approval_required,
    })
    .select("id")
    .single();
  if (error || !clone) redirect(`/jds?error=${encodeURIComponent(error?.message ?? "Could not clone JD")}`);

  await logAudit("jd.cloned_to_season", "jd", clone.id, {
    source_jd_id: sourceJdId,
    target_batch_id: targetBatchId,
    attachment_reused: reuseAttachment,
  });
  revalidatePath("/jds");
  redirect(`/jds/${clone.id}?notice=${encodeURIComponent("Historical JD cloned as a new draft. Review every field before publishing.")}`);
}
