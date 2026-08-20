"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { logAudit } from "@/lib/audit";
import type { PipelineStage } from "@/types/domain";

const STAGES: PipelineStage[] = ["prospect", "contacted", "interested", "committed", "onboarded"];

// FR-8.1: move a company along the pipeline. companies_update RLS
// (CRM/Outreach, or owner/supervisor) is the real gate.
export async function updateCompanyStage(companyId: string, stage: PipelineStage) {
  if (!STAGES.includes(stage)) redirect(`/companies/${companyId}?error=${encodeURIComponent("Invalid stage")}`);

  const supabase = await createClient();
  const { error } = await supabase.from("companies").update({ pipeline_stage: stage }).eq("id", companyId);
  if (error) {
    redirect(`/companies/${companyId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/companies");
}

// FR-8.2/FR-8.10: assign/reassign Owner (JPC) or Supervisor (Senior SPC).
export async function assignCompanyPerson(
  companyId: string,
  field: "owner_user_id" | "supervisor_user_id",
  formData: FormData,
) {
  const userId = String(formData.get(field) ?? "") || null;

  const supabase = await createClient();
  const { error } = await supabase.from("companies").update({ [field]: userId }).eq("id", companyId);
  if (error) {
    redirect(`/companies/${companyId}?error=${encodeURIComponent(error.message)}`);
  }

  await logAudit("company.person_reassigned", "company", companyId, { field, user_id: userId });
  revalidatePath(`/companies/${companyId}`);
}

// FR-8.9: standalone manual flag, not auto-linked to Company Onboarding
// (Decision Log, Appendix A) — a separate action deliberately, not folded
// into the stage-update action above.
export async function toggleJdFormReceived(companyId: string, formData: FormData) {
  const received = formData.get("jd_form_received") === "on";
  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({ jd_form_received: received })
    .eq("id", companyId);
  if (error) {
    redirect(`/companies/${companyId}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/companies/${companyId}`);
}

// FR-8.3: contact directory per company.
export async function addCompanyContact(companyId: string, formData: FormData) {
  const fullName = String(formData.get("full_name") ?? "").trim();
  if (!fullName) {
    redirect(`/companies/${companyId}?error=${encodeURIComponent("Contact name is required")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("company_contacts").insert({
    company_id: companyId,
    title: String(formData.get("title") ?? "").trim() || null,
    full_name: fullName,
    last_name: String(formData.get("last_name") ?? "").trim() || null,
    hr_designation: String(formData.get("hr_designation") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    cc_email: String(formData.get("cc_email") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
  });

  if (error) {
    redirect(`/companies/${companyId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/companies/${companyId}`);
}

// FR-8.7/FR-8.8: Call Remarks and SPC Remarks are distinct fields on the
// same OutreachActivity row shape (Appendix B.3 — the live sheet has three
// remark fields, not one) — logged as separate rows here for a simple
// chronological feed rather than one row per company that gets overwritten.
export async function logCallRemark(companyId: string, formData: FormData) {
  const ctx = await getCurrentUserContext();
  if (!ctx) redirect("/login");

  const remark = String(formData.get("remark") ?? "").trim();
  if (!remark) redirect(`/companies/${companyId}?error=${encodeURIComponent("Remark text is required")}`);

  const supabase = await createClient();
  const { error } = await supabase.from("outreach_activities").insert({
    company_id: companyId,
    channel: "call",
    call_remarks: remark,
    logged_by_user_id: ctx!.appUser.id,
    logged_by_name: ctx!.appUser.name,
  });

  if (error) {
    redirect(`/companies/${companyId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/companies/${companyId}`);
}

export async function addSpcRemark(companyId: string, formData: FormData) {
  const ctx = await getCurrentUserContext();
  if (!ctx) redirect("/login");

  const remark = String(formData.get("remark") ?? "").trim();
  if (!remark) redirect(`/companies/${companyId}?error=${encodeURIComponent("Remark text is required")}`);

  const supabase = await createClient();
  const { error } = await supabase.from("outreach_activities").insert({
    company_id: companyId,
    channel: "call",
    spc_remarks: remark,
    logged_by_user_id: ctx!.appUser.id,
    logged_by_name: ctx!.appUser.name,
  });

  if (error) {
    redirect(`/companies/${companyId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/companies/${companyId}`);
}

// FR-8.4/FR-8.5: persona-based outreach. Honest scope: there is no email
// infrastructure wired up (Resend isn't connected — see README), so this
// LOGS an outreach touchpoint with the composed message, it does not send
// one. Labeled "Log Outreach" in the UI rather than "Send" for exactly that
// reason — a button that claims to send an email it can't send would be
// worse than not having the feature.
export async function logOutreachEmail(companyId: string, formData: FormData) {
  const ctx = await getCurrentUserContext();
  if (!ctx) redirect("/login");

  const message = String(formData.get("message") ?? "").trim();
  const contactId = String(formData.get("contact_id") ?? "") || null;
  if (!message) redirect(`/companies/${companyId}?error=${encodeURIComponent("Message body is required")}`);

  const supabase = await createClient();
  const { error } = await supabase.from("outreach_activities").insert({
    company_id: companyId,
    contact_id: contactId,
    channel: "email",
    merge_status: "email_sent",
    previous_mails_summary: message,
    logged_by_user_id: ctx!.appUser.id,
    logged_by_name: ctx!.appUser.name,
  });

  if (error) {
    redirect(`/companies/${companyId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/companies/${companyId}`);
}

// FR-8.5: recipient disposition tracking (Responded/Not Interested/etc.) —
// updates the most recently logged outreach_activities row's merge_status.
export async function updateOutreachStatus(companyId: string, activityId: string, formData: FormData) {
  const status = String(formData.get("merge_status") ?? "");
  const supabase = await createClient();
  const { error } = await supabase
    .from("outreach_activities")
    .update({ merge_status: status })
    .eq("id", activityId);

  if (error) {
    redirect(`/companies/${companyId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/companies/${companyId}`);
}
