"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { logAudit } from "@/lib/audit";
import { renderOutreachTemplate } from "@/lib/outreach-templates";
import { outreachTemplate as buildOutreachEmail } from "@/lib/notifications/templates";
import {
  deliverNotificationJob,
  queueNotification,
  rescheduleNotificationJob,
} from "@/lib/notifications/delivery";
import type { PipelineStage } from "@/types/domain";
import type { NotificationDatabase } from "@/types/notification-database";

const STAGES: PipelineStage[] = ["prospect", "contacted", "interested", "committed", "onboarded"];

async function validCompanyAssignee(
  userId: string,
  field: "owner_user_id" | "supervisor_user_id",
): Promise<boolean> {
  if (!userId) return false;
  const supabase = await createClient();
  const [{ data: user }, { data: userRoles }, { data: roles }] = await Promise.all([
    supabase.from("users").select("id, status").eq("id", userId).eq("status", "active").single(),
    supabase.from("user_roles").select("role_id").eq("user_id", userId),
    supabase.from("roles").select("id, name, cloned_from_role_id"),
  ]);
  if (!user) return false;
  const roleById = new Map((roles ?? []).map((role) => [role.id, role]));
  const names = new Set<string>();
  for (const assignment of userRoles ?? []) {
    let role = roleById.get(assignment.role_id);
    const visited = new Set<string>();
    while (role && !visited.has(role.id)) {
      names.add(role.name);
      visited.add(role.id);
      role = role.cloned_from_role_id ? roleById.get(role.cloned_from_role_id) : undefined;
    }
  }
  return field === "owner_user_id"
    ? names.has("BD") || names.has("JPC")
    : names.has("SPC") || names.has("Senior SPC");
}

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
  const userId = String(formData.get(field) ?? "");
  if (!(await validCompanyAssignee(userId, field))) {
    const expected = field === "owner_user_id" ? "active JPC/BD" : "active Senior-SPC/SPC";
    redirect(`/companies/${companyId}?error=${encodeURIComponent(`Choose a valid ${expected} user`)}`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .update({ [field]: userId })
    .eq("id", companyId)
    .select("id")
    .single();
  if (error || !data) {
    redirect(`/companies/${companyId}?error=${encodeURIComponent(error?.message ?? "Assignment did not update")}`);
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
export async function sendOutreachEmails(companyId: string, formData: FormData) {
  const ctx = await getCurrentUserContext();
  if (!ctx) redirect("/login");

  const subjectTemplate = String(formData.get("subject_template") ?? "").trim();
  const messageTemplate = String(formData.get("message_template") ?? "").trim();
  const contactIds = [...new Set(formData.getAll("contact_ids").map(String).filter(Boolean))].slice(0, 100);
  const scheduledForRaw = String(formData.get("scheduled_for") ?? "").trim();
  const scheduledFor = scheduledForRaw ? new Date(scheduledForRaw) : new Date();
  if (!subjectTemplate || subjectTemplate.length > 300) {
    redirect(`/companies/${companyId}?error=${encodeURIComponent("Subject is required and must be at most 300 characters")}`);
  }
  if (!messageTemplate || messageTemplate.length > 50_000) {
    redirect(`/companies/${companyId}?error=${encodeURIComponent("Message is required and must be at most 50,000 characters")}`);
  }
  if (!contactIds.length) {
    redirect(`/companies/${companyId}?error=${encodeURIComponent("Select at least one contact with an email address")}`);
  }
  if (Number.isNaN(scheduledFor.getTime())) {
    redirect(`/companies/${companyId}?error=${encodeURIComponent("Choose a valid schedule time")}`);
  }

  const supabase = await createClient();
  const [{ data: company, error: companyError }, { data: contacts, error: contactsError }] = await Promise.all([
    supabase.from("companies").select("id, name, institute_id").eq("id", companyId).single(),
    supabase
      .from("company_contacts")
      .select("id, title, full_name, last_name, email, cc_email")
      .eq("company_id", companyId)
      .in("id", contactIds),
  ]);
  if (companyError || !company) {
    redirect(`/companies/${companyId}?error=${encodeURIComponent(companyError?.message ?? "Company not found")}`);
  }
  if (contactsError) redirect(`/companies/${companyId}?error=${encodeURIComponent(contactsError.message)}`);

  const recipientRows = (contacts ?? []).filter(
    (contact): contact is typeof contact & { email: string } => Boolean(contact.email),
  );
  if (!recipientRows.length) {
    redirect(`/companies/${companyId}?error=${encodeURIComponent("Selected contacts do not have email addresses")}`);
  }

  const messages = recipientRows.map((contact) => {
    const tokens = {
      company_name: company.name,
      contact_title: contact.title,
      contact_last_name: contact.last_name || contact.full_name,
      sender_name: ctx.appUser.name,
      sender_email: ctx.appUser.email,
    };
    return {
      contact,
      subject: renderOutreachTemplate(subjectTemplate, tokens),
      message: renderOutreachTemplate(messageTemplate, tokens),
    };
  });

  const { data: activities, error } = await supabase
    .from("outreach_activities")
    .insert(
      messages.map(({ contact, message }) => ({
        company_id: companyId,
        contact_id: contact.id,
        channel: "email" as const,
        merge_status: null,
        previous_mails_summary: message,
        logged_by_user_id: ctx.appUser.id,
        logged_by_name: ctx.appUser.name,
        occurred_at: scheduledFor.toISOString(),
      })),
    )
    .select("id, contact_id");

  if (error) redirect(`/companies/${companyId}?error=${encodeURIComponent(error.message)}`);

  const activityByContact = new Map((activities ?? []).map((activity) => [activity.contact_id, activity.id]));
  let queued = 0;
  let blocked = 0;
  let failed = 0;
  for (const { contact, subject, message } of messages) {
    const activityId = activityByContact.get(contact.id);
    if (!activityId) continue;
    try {
      const template = buildOutreachEmail({ subject, message });
      const result = await queueNotification({
        instituteId: company.institute_id,
        kind: "outreach",
        recipientEmail: contact.email,
        recipientName: contact.full_name,
        ccEmails: contact.cc_email ? [contact.cc_email] : [],
        ...template,
        scheduledFor: scheduledFor.toISOString(),
        idempotencyKey: `outreach/${activityId}`,
        createdByUserId: ctx.appUser.id,
        outreachActivityId: activityId,
        tags: { outreach_activity_id: activityId, company_id: companyId },
      });
      queued += 1;
      if (result.status === "blocked") blocked += 1;
      if (result.status === "failed") failed += 1;
    } catch {
      failed += 1;
    }
  }

  revalidatePath(`/companies/${companyId}`);
  redirect(
    `/companies/${companyId}?notice=${encodeURIComponent(`${queued} recipient(s) queued; ${blocked} awaiting configuration and ${failed} failed.`)}`,
  );
}

async function authorizeOutreachJob(jobId: string) {
  const ctx = await getCurrentUserContext();
  if (!ctx) redirect("/login");
  const baseClient = await createClient();
  const supabase = baseClient as unknown as SupabaseClient<NotificationDatabase>;
  const { data } = await supabase
    .from("notification_jobs")
    .select("id, outreach_activity_id")
    .eq("id", jobId)
    .eq("kind", "outreach")
    .single();
  if (!data) throw new Error("Outreach notification not found or not authorized");
  return data;
}

export async function retryOutreachNotification(companyId: string, jobId: string) {
  let status: string;
  try {
    await authorizeOutreachJob(jobId);
    const result = await deliverNotificationJob(jobId);
    status = result.status;
  } catch (error) {
    redirect(`/companies/${companyId}?error=${encodeURIComponent(error instanceof Error ? error.message : "Retry failed")}`);
  }
  revalidatePath(`/companies/${companyId}`);
  redirect(`/companies/${companyId}?notice=${encodeURIComponent(`Retry result: ${status}`)}`);
}

export async function rescheduleOutreachNotification(companyId: string, jobId: string, formData: FormData) {
  let status: string;
  try {
    await authorizeOutreachJob(jobId);
    const scheduledFor = String(formData.get("scheduled_for") ?? "");
    const parsed = new Date(scheduledFor);
    if (Number.isNaN(parsed.getTime())) throw new Error("Choose a valid reschedule time");
    const result = await rescheduleNotificationJob(jobId, parsed.toISOString());
    status = result.status;
  } catch (error) {
    redirect(`/companies/${companyId}?error=${encodeURIComponent(error instanceof Error ? error.message : "Reschedule failed")}`);
  }
  revalidatePath(`/companies/${companyId}`);
  redirect(`/companies/${companyId}?notice=${encodeURIComponent(`Outreach rescheduled: ${status}`)}`);
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
