// Transitional generated-schema extension for migration 0019. Regenerate
// database.types.ts from the linked project after 0019 is applied, then this
// alias can collapse back to Database without changing query call sites.
import type { Database, Json } from "@/types/database.types";

export type NotificationKind =
  | "jd_published"
  | "application_status"
  | "round_scheduled"
  | "round_reminder"
  | "outreach";

export type NotificationStatus =
  | "blocked"
  | "queued"
  | "scheduled"
  | "sent"
  | "delivered"
  | "delivery_delayed"
  | "opened"
  | "clicked"
  | "failed"
  | "bounced"
  | "complained"
  | "suppressed"
  | "cancelled";

export type NotificationJobRow = {
  id: string;
  institute_id: string;
  kind: NotificationKind;
  recipient_email: string;
  recipient_name: string | null;
  cc_emails: string[];
  subject: string;
  html_body: string;
  text_body: string;
  status: NotificationStatus;
  scheduled_for: string;
  next_attempt_at: string;
  attempt_count: number;
  max_attempts: number;
  provider_message_id: string | null;
  idempotency_key: string;
  jd_notification_id: string | null;
  outreach_activity_id: string | null;
  application_id: string | null;
  created_by_user_id: string | null;
  tags: Json;
  last_error: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  created_at: string;
  updated_at: string;
};

type NotificationJobInsert = Pick<
  NotificationJobRow,
  "institute_id" | "kind" | "recipient_email" | "subject" | "html_body" | "text_body" | "idempotency_key"
> & Partial<Omit<NotificationJobRow, "institute_id" | "kind" | "recipient_email" | "subject" | "html_body" | "text_body" | "idempotency_key">>;

type NotificationWebhookEventRow = {
  id: string;
  svix_id: string;
  provider_message_id: string | null;
  event_type: string;
  event_created_at: string;
  received_at: string;
};

type NotificationWebhookEventInsert = Pick<
  NotificationWebhookEventRow,
  "svix_id" | "event_type" | "event_created_at"
> & Partial<Omit<NotificationWebhookEventRow, "svix_id" | "event_type" | "event_created_at">>;

export type NotificationDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables"> & {
    Tables: Database["public"]["Tables"] & {
      notification_jobs: {
        Row: NotificationJobRow;
        Insert: NotificationJobInsert;
        Update: Partial<NotificationJobRow>;
        Relationships: [];
      };
      notification_webhook_events: {
        Row: NotificationWebhookEventRow;
        Insert: NotificationWebhookEventInsert;
        Update: Partial<NotificationWebhookEventRow>;
        Relationships: [];
      };
    };
  };
};
