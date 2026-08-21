import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import {
  applicationStatusTemplate,
  jdPublishedTemplate,
  roundTemplate,
  spcStatusTemplate,
} from "@/lib/notifications/templates";
import {
  queueNotifications,
  type NotificationResult,
  type QueueNotificationInput,
} from "@/lib/notifications/delivery";

export interface QueueSummary {
  total: number;
  sent: number;
  scheduled: number;
  blocked: number;
  failed: number;
}

type ApplicationNotificationRow = {
  id: string;
  status: string;
  updated_at: string;
  students: {
    id: string;
    name: string;
    personal_email: string | null;
    user_id: string | null;
  } | null;
  jds: {
    id: string;
    role_title: string;
    companies: {
      name: string;
      supervisor_user_id: string | null;
    } | null;
    batches: { institute_id: string } | null;
  } | null;
};

function summarize(results: NotificationResult[]): QueueSummary {
  return {
    total: results.length,
    sent: results.filter((result) => ["sent", "delivered", "opened", "clicked"].includes(result.status)).length,
    scheduled: results.filter((result) => result.status === "scheduled").length,
    blocked: results.filter((result) => result.status === "blocked").length,
    failed: results.filter((result) => result.status === "failed").length,
  };
}

async function userEmails(userIds: Array<string | null | undefined>): Promise<Map<string, { name: string; email: string }>> {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return new Map();
  const supabase = createServiceClient();
  const { data, error } = await supabase.from("users").select("id, name, email").in("id", ids);
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((user) => [user.id, { name: user.name, email: user.email }]));
}

export async function queueJdPublishedNotifications(jdId: string, actorUserId: string): Promise<QueueSummary> {
  const supabase = createServiceClient();
  const [{ data: jd, error: jdError }, { data: eligible, error: eligibleError }] = await Promise.all([
    supabase
      .from("jds")
      .select("id, role_title, ctc_total, locations, apply_by_deadline, companies(name), batches(institute_id)")
      .eq("id", jdId)
      .single(),
    supabase.rpc("final_eligible_student_ids_for_jd", { p_jd_id: jdId }),
  ]);
  if (jdError || !jd) throw new Error(jdError?.message ?? "JD not found for notification");
  if (eligibleError) throw new Error(eligibleError.message);

  const studentIds = (eligible ?? []).map((row) => row.student_id);
  if (!studentIds.length) return summarize([]);

  const { data: students, error: studentError } = await supabase
    .from("students")
    .select("id, name, personal_email, user_id")
    .in("id", studentIds);
  if (studentError) throw new Error(studentError.message);

  const emails = await userEmails((students ?? []).map((student) => student.user_id));
  const recipients = (students ?? [])
    .map((student) => ({
      ...student,
      email: student.personal_email || (student.user_id ? emails.get(student.user_id)?.email : null),
    }))
    .filter((student): student is typeof student & { email: string } => Boolean(student.email));
  if (!recipients.length) return summarize([]);

  const companyName = jd.companies?.name ?? "Company";
  const instituteId = jd.batches?.institute_id;
  if (!instituteId) throw new Error("JD batch has no institute");
  const inputs: QueueNotificationInput[] = recipients.map((student) => {
    const template = jdPublishedTemplate({
      recipientName: student.name,
      companyName,
      roleTitle: jd.role_title,
      deadline: jd.apply_by_deadline,
      locations: jd.locations,
      ctcTotal: jd.ctc_total,
      jdId,
    });
    return {
      instituteId,
      kind: "jd_published",
      recipientEmail: student.email,
      recipientName: student.name,
      ...template,
      idempotencyKey: `jd-published/${jdId}/${student.id}`,
      createdByUserId: actorUserId,
      tags: { jd_id: jdId, student_id: student.id },
    };
  });

  return summarize(await queueNotifications(inputs));
}

async function loadApplications(applicationIds: string[]): Promise<ApplicationNotificationRow[]> {
  if (!applicationIds.length) return [];
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("applications")
    .select("id, status, updated_at, students(id, name, personal_email, user_id), jds(id, role_title, companies(name, supervisor_user_id), batches(institute_id))")
    .in("id", applicationIds);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ApplicationNotificationRow[];
}

export async function queueApplicationStatusNotifications(
  applicationIds: string[],
  actorUserId: string,
): Promise<QueueSummary> {
  const rows = await loadApplications(applicationIds);
  const userIds = rows.flatMap((row) => [row.students?.user_id, row.jds?.companies?.supervisor_user_id]);
  const emails = await userEmails(userIds);
  const inputs: QueueNotificationInput[] = [];

  for (const row of rows) {
    const student = row.students;
    const jd = row.jds;
    const instituteId = jd?.batches?.institute_id;
    if (!student || !jd || !instituteId) continue;
    const companyName = jd.companies?.name ?? "Company";
    const studentEmail = student.personal_email || (student.user_id ? emails.get(student.user_id)?.email : null);
    const version = row.updated_at.replace(/[^0-9]/g, "");

    if (studentEmail) {
      const template = applicationStatusTemplate({
        recipientName: student.name,
        companyName,
        roleTitle: jd.role_title,
        status: row.status,
      });
      inputs.push({
        instituteId,
        kind: "application_status",
        recipientEmail: studentEmail,
        recipientName: student.name,
        ...template,
        idempotencyKey: `application-status/${row.id}/${row.status}/${version}`,
        createdByUserId: actorUserId,
        applicationId: row.id,
        tags: { application_id: row.id, audience: "student" },
      });
    }

    const supervisorId = jd.companies?.supervisor_user_id;
    const supervisor = supervisorId ? emails.get(supervisorId) : null;
    if (supervisor) {
      const template = spcStatusTemplate({
        recipientName: supervisor.name,
        studentName: student.name,
        companyName,
        roleTitle: jd.role_title,
        status: row.status,
        jdId: jd.id,
      });
      inputs.push({
        instituteId,
        kind: "application_status",
        recipientEmail: supervisor.email,
        recipientName: supervisor.name,
        ...template,
        idempotencyKey: `application-status/${row.id}/${row.status}/${version}/spc`,
        createdByUserId: actorUserId,
        applicationId: row.id,
        tags: { application_id: row.id, audience: "spc" },
      });
    }
  }

  return summarize(await queueNotifications(inputs));
}

export async function queueRoundNotifications(input: {
  applicationId: string;
  actorUserId: string;
  round: string;
  scheduledAt?: string | null;
  location?: string | null;
}): Promise<QueueSummary> {
  const [row] = await loadApplications([input.applicationId]);
  const batch = row?.jds?.batches;
  if (!row?.students || !row.jds || !batch?.institute_id) return summarize([]);

  const student = row.students;
  const jd = row.jds;
  const instituteId = batch.institute_id;
  const supervisorId = jd.companies?.supervisor_user_id;
  const emails = await userEmails([student.user_id, supervisorId]);
  const studentEmail = student.personal_email || (student.user_id ? emails.get(student.user_id)?.email : null);
  const supervisor = supervisorId ? emails.get(supervisorId) : null;
  const companyName = jd.companies?.name ?? "Company";
  const version = `${input.round}/${input.scheduledAt ?? "unscheduled"}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  const recipients = [
    studentEmail ? { email: studentEmail, name: student.name, audience: "student" } : null,
    supervisor ? { email: supervisor.email, name: supervisor.name, audience: "spc" } : null,
  ].filter((recipient): recipient is { email: string; name: string; audience: string } => Boolean(recipient));
  const jobs: QueueNotificationInput[] = [];

  for (const recipient of recipients) {
    const scheduled = roundTemplate({
      recipientName: recipient.name,
      companyName,
      roleTitle: jd.role_title,
      round: input.round,
      scheduledAt: input.scheduledAt,
      location: input.location,
      reminder: false,
    });
    jobs.push({
      instituteId,
      kind: "round_scheduled",
      recipientEmail: recipient.email,
      recipientName: recipient.name,
      ...scheduled,
      idempotencyKey: `round-scheduled/${row.id}/${version}/${recipient.audience}`,
      createdByUserId: input.actorUserId,
      applicationId: row.id,
      tags: { application_id: row.id, audience: recipient.audience },
    });

    if (input.scheduledAt) {
      const scheduledAt = new Date(input.scheduledAt).getTime();
      const reminderAt = scheduledAt - 24 * 60 * 60 * 1_000;
      if (reminderAt > Date.now() + 60 * 60 * 1_000) {
        const reminder = roundTemplate({
          recipientName: recipient.name,
          companyName,
          roleTitle: jd.role_title,
          round: input.round,
          scheduledAt: input.scheduledAt,
          location: input.location,
          reminder: true,
        });
        jobs.push({
          instituteId,
          kind: "round_reminder",
          recipientEmail: recipient.email,
          recipientName: recipient.name,
          ...reminder,
          scheduledFor: new Date(reminderAt).toISOString(),
          idempotencyKey: `round-reminder/${row.id}/${version}/${recipient.audience}`,
          createdByUserId: input.actorUserId,
          applicationId: row.id,
          tags: { application_id: row.id, audience: recipient.audience },
        });
      }
    }
  }

  return summarize(await queueNotifications(jobs));
}
