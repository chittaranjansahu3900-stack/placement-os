import "server-only";

import { Resend, type WebhookEventPayload } from "resend";
import { createServiceClient as createBaseServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/types/database.types";
import type {
  NotificationDatabase,
  NotificationJobRow,
  NotificationKind,
  NotificationStatus,
} from "@/types/notification-database";

export type { NotificationKind } from "@/types/notification-database";

type NotificationJob = NotificationJobRow;

function createServiceClient() {
  return createBaseServiceClient<NotificationDatabase>();
}

export interface QueueNotificationInput {
  instituteId: string;
  kind: NotificationKind;
  recipientEmail: string;
  recipientName?: string | null;
  ccEmails?: string[];
  subject: string;
  html: string;
  text: string;
  scheduledFor?: string | null;
  idempotencyKey: string;
  createdByUserId?: string | null;
  jdNotificationId?: string | null;
  outreachActivityId?: string | null;
  applicationId?: string | null;
  tags?: Record<string, string>;
  maxAttempts?: number;
}

export interface NotificationResult {
  jobId: string;
  status: NotificationStatus;
  providerMessageId: string | null;
  error: string | null;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TERMINAL_STATUSES = new Set<NotificationStatus>([
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "complained",
  "suppressed",
  "cancelled",
]);

function resendClient(): Resend {
  return new Resend(process.env.RESEND_API_KEY);
}

function sendEnabled(): boolean {
  return process.env.NOTIFICATIONS_SEND_ENABLED?.trim().toLowerCase() === "true";
}

function senderIdentity(): string | null {
  return process.env.RESEND_FROM_EMAIL?.trim() || null;
}

function cleanTags(tags: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tags)
      .map(([name, value]) => [
        name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 256),
        value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 256),
      ])
      .filter(([name, value]) => Boolean(name && value)),
  );
}

function retryAt(attemptCount: number): string {
  const minutes = Math.min(60, 5 * 2 ** Math.max(0, attemptCount - 1));
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

async function markFailure(job: NotificationJob, message: string): Promise<NotificationResult> {
  const supabase = createServiceClient();
  const attemptCount = job.attempt_count + 1;
  const exhausted = attemptCount >= job.max_attempts;
  const { error } = await supabase
    .from("notification_jobs")
    .update({
      status: "failed",
      attempt_count: attemptCount,
      next_attempt_at: exhausted ? job.next_attempt_at : retryAt(attemptCount),
      last_error: message.slice(0, 2_000),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);
  if (error) throw new Error(`Could not record notification failure: ${error.message}`);
  return { jobId: job.id, status: "failed", providerMessageId: job.provider_message_id, error: message };
}

export async function deliverNotificationJob(jobId: string): Promise<NotificationResult> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("notification_jobs")
    .select("*")
    .eq("id", jobId)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Notification job not found");

  const job = data as NotificationJob;
  if (TERMINAL_STATUSES.has(job.status)) {
    return { jobId, status: job.status, providerMessageId: job.provider_message_id, error: job.last_error };
  }
  if (job.attempt_count >= job.max_attempts) {
    return { jobId, status: "failed", providerMessageId: job.provider_message_id, error: job.last_error ?? "Retry limit reached" };
  }
  if (!sendEnabled()) {
    const message = "Notification sending is disabled by NOTIFICATIONS_SEND_ENABLED";
    const { error: updateError } = await supabase
      .from("notification_jobs")
      .update({ status: "blocked", last_error: message, updated_at: new Date().toISOString() })
      .eq("id", jobId);
    if (updateError) throw new Error(updateError.message);
    return { jobId, status: "blocked", providerMessageId: job.provider_message_id, error: message };
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = senderIdentity();
  if (!apiKey || !from) {
    return markFailure(job, "RESEND_API_KEY and RESEND_FROM_EMAIL must be configured on the server");
  }

  const scheduledFor = new Date(job.scheduled_for);
  const isFuture = scheduledFor.getTime() > Date.now() + 30_000;
  const requestAttempt = job.provider_message_id ? job.attempt_count + 1 : 1;
  const response = await resendClient().emails.send(
    {
      from,
      to: [job.recipient_email],
      cc: job.cc_emails.length ? job.cc_emails : undefined,
      replyTo: process.env.RESEND_REPLY_TO_EMAIL?.trim() || undefined,
      subject: job.subject,
      html: job.html_body,
      text: job.text_body,
      scheduledAt: isFuture ? scheduledFor.toISOString() : undefined,
      tags: Object.entries((job.tags ?? {}) as Record<string, string>).map(([name, value]) => ({ name, value })),
    },
    { idempotencyKey: `${job.idempotency_key}/attempt-${requestAttempt}` },
  );

  if (response.error || !response.data) {
    return markFailure(job, response.error?.message ?? "Resend did not return a message identifier");
  }

  const status: NotificationStatus = isFuture ? "scheduled" : "sent";
  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("notification_jobs")
    .update({
      status,
      provider_message_id: response.data.id,
      attempt_count: job.attempt_count + 1,
      sent_at: isFuture ? job.sent_at : now,
      last_error: null,
      updated_at: now,
    })
    .eq("id", jobId);
  if (updateError) throw new Error(updateError.message);

  return { jobId, status, providerMessageId: response.data.id, error: null };
}

export async function queueNotification(input: QueueNotificationInput): Promise<NotificationResult> {
  const recipientEmail = input.recipientEmail.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(recipientEmail)) throw new Error("A valid recipient email is required");
  if (!input.subject.trim() || input.subject.length > 300) throw new Error("Notification subject must be 1–300 characters");
  if (!input.html.trim() || !input.text.trim()) throw new Error("Notification HTML and text bodies are required");

  const supabase = createServiceClient();
  const tags = cleanTags({ kind: input.kind, ...input.tags });
  const scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : new Date();
  if (Number.isNaN(scheduledFor.getTime())) throw new Error("Invalid notification schedule time");

  const { data, error } = await supabase
    .from("notification_jobs")
    .upsert(
      {
        institute_id: input.instituteId,
        kind: input.kind,
        recipient_email: recipientEmail,
        recipient_name: input.recipientName?.trim() || null,
        cc_emails: [...new Set((input.ccEmails ?? []).map((value) => value.trim().toLowerCase()).filter((value) => EMAIL_PATTERN.test(value)))],
        subject: input.subject.trim(),
        html_body: input.html,
        text_body: input.text,
        scheduled_for: scheduledFor.toISOString(),
        next_attempt_at: new Date().toISOString(),
        idempotency_key: input.idempotencyKey.slice(0, 220),
        created_by_user_id: input.createdByUserId ?? null,
        jd_notification_id: input.jdNotificationId ?? null,
        outreach_activity_id: input.outreachActivityId ?? null,
        application_id: input.applicationId ?? null,
        tags: tags as Json,
        max_attempts: Math.min(10, Math.max(1, input.maxAttempts ?? 3)),
      },
      { onConflict: "idempotency_key", ignoreDuplicates: false },
    )
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not queue notification");

  return deliverNotificationJob(data.id);
}

export async function queueNotifications(inputs: QueueNotificationInput[]): Promise<NotificationResult[]> {
  const results: NotificationResult[] = [];
  for (let index = 0; index < inputs.length; index += 5) {
    const batch = inputs.slice(index, index + 5);
    results.push(...(await Promise.all(batch.map((input) => queueNotification(input)))));
  }
  return results;
}

export async function processDueNotifications(limit = 25): Promise<NotificationResult[]> {
  if (!sendEnabled()) return [];
  const supabase = createServiceClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("notification_jobs")
    .select("id")
    .in("status", ["blocked", "queued", "failed"])
    .lte("next_attempt_at", now)
    .lte("scheduled_for", now)
    .order("next_attempt_at", { ascending: true })
    .limit(Math.min(100, Math.max(1, limit)));
  if (error) throw new Error(error.message);

  const results: NotificationResult[] = [];
  for (const row of data ?? []) {
    results.push(await deliverNotificationJob(row.id));
  }
  return results;
}

export async function rescheduleNotificationJob(jobId: string, scheduledFor: string): Promise<NotificationResult> {
  const nextSchedule = new Date(scheduledFor);
  if (Number.isNaN(nextSchedule.getTime()) || nextSchedule.getTime() <= Date.now() + 60_000) {
    throw new Error("Rescheduled time must be at least one minute in the future");
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("notification_jobs")
    .select("*")
    .eq("id", jobId)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Notification job not found");
  const job = data as NotificationJob;

  if (job.provider_message_id && job.status === "scheduled") {
    if (!sendEnabled() || !process.env.RESEND_API_KEY?.trim()) {
      throw new Error("Resend must be configured and enabled before changing a provider schedule");
    }
    const response = await resendClient().emails.update({
      id: job.provider_message_id,
      scheduledAt: nextSchedule.toISOString(),
    });
    if (response.error) throw new Error(response.error.message);
    const { error: updateError } = await supabase
      .from("notification_jobs")
      .update({
        scheduled_for: nextSchedule.toISOString(),
        next_attempt_at: nextSchedule.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    if (updateError) throw new Error(updateError.message);
    return { jobId, status: "scheduled", providerMessageId: job.provider_message_id, error: null };
  }

  const { error: updateError } = await supabase
    .from("notification_jobs")
    .update({
      status: "queued",
      scheduled_for: nextSchedule.toISOString(),
      next_attempt_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  if (updateError) throw new Error(updateError.message);
  return deliverNotificationJob(jobId);
}

const WEBHOOK_STATUS: Partial<Record<WebhookEventPayload["type"], NotificationStatus>> = {
  "email.scheduled": "scheduled",
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delivery_delayed",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.failed": "failed",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.suppressed": "suppressed",
};

export function verifyResendWebhook(payload: string, headers: { id: string; timestamp: string; signature: string }): WebhookEventPayload {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) throw new Error("RESEND_WEBHOOK_SECRET is not configured");
  return resendClient().webhooks.verify({ payload, headers, webhookSecret: secret });
}

export async function applyResendWebhookEvent(svixId: string, event: WebhookEventPayload): Promise<"processed" | "duplicate" | "ignored"> {
  if (!event.type.startsWith("email.") || !("email_id" in event.data)) return "ignored";

  const supabase = createServiceClient();
  const providerMessageId = event.data.email_id;
  const { error: eventError } = await supabase.from("notification_webhook_events").insert({
    svix_id: svixId,
    provider_message_id: providerMessageId,
    event_type: event.type,
    event_created_at: event.created_at,
  });
  if (eventError?.code === "23505") return "duplicate";
  if (eventError) throw new Error(eventError.message);

  const { data: job, error: jobError } = await supabase
    .from("notification_jobs")
    .select("*")
    .eq("provider_message_id", providerMessageId)
    .maybeSingle();
  if (jobError) throw new Error(jobError.message);
  if (!job) return "ignored";

  const status = WEBHOOK_STATUS[event.type];
  if (!status) return "ignored";
  const timestamp = event.created_at;
  const update: NotificationDatabase["public"]["Tables"]["notification_jobs"]["Update"] = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (event.type === "email.sent") update.sent_at = timestamp;
  if (event.type === "email.delivered") update.delivered_at = timestamp;
  if (event.type === "email.opened") update.opened_at = timestamp;
  if (event.type === "email.clicked") update.clicked_at = timestamp;
  if (event.type === "email.bounced") update.bounced_at = timestamp;
  if (event.type === "email.failed" || event.type === "email.delivery_delayed") {
    update.next_attempt_at = retryAt(job.attempt_count);
    update.last_error = event.type === "email.failed" && "failed" in event.data
      ? event.data.failed.reason.slice(0, 2_000)
      : "Delivery delayed by recipient mail server";
  }
  const { error: updateError } = await supabase.from("notification_jobs").update(update).eq("id", job.id);
  if (updateError) throw new Error(updateError.message);

  let jdNotificationId = job.jd_notification_id;
  if (
    !jdNotificationId &&
    job.kind === "jd_published" &&
    ["email.sent", "email.delivered", "email.opened", "email.clicked"].includes(event.type)
  ) {
    const tags = (job.tags ?? {}) as Record<string, string>;
    if (tags.jd_id && tags.student_id) {
      const { data: delivery, error: deliveryError } = await supabase
        .from("jd_notifications")
        .upsert(
          { jd_id: tags.jd_id, student_id: tags.student_id, sent_at: job.sent_at ?? timestamp },
          { onConflict: "jd_id,student_id", ignoreDuplicates: false },
        )
        .select("id")
        .single();
      if (deliveryError) throw new Error(deliveryError.message);
      jdNotificationId = delivery.id;
      await supabase
        .from("notification_jobs")
        .update({ jd_notification_id: delivery.id })
        .eq("id", job.id);
    }
  }

  if (jdNotificationId && (event.type === "email.opened" || event.type === "email.clicked")) {
    await supabase
      .from("jd_notifications")
      .update({ opened_at: timestamp })
      .eq("id", jdNotificationId)
      .is("opened_at", null);
  }

  if (job.outreach_activity_id) {
    const mergeStatus = event.type === "email.opened"
      ? "email_opened"
      : event.type === "email.clicked"
        ? "email_clicked"
        : ["email.bounced", "email.failed", "email.complained", "email.suppressed"].includes(event.type)
          ? "bounced"
          : ["email.sent", "email.delivered"].includes(event.type)
            ? "email_sent"
            : null;
    if (mergeStatus) {
      await supabase.from("outreach_activities").update({ merge_status: mergeStatus }).eq("id", job.outreach_activity_id);
    }
  }

  return "processed";
}
