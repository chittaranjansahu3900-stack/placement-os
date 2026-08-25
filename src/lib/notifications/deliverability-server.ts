import "server-only";

import { resolveCname, resolveTxt } from "node:dns/promises";
import { createServiceClient } from "@/lib/supabase/service";
import {
  assessEmailAuthentication,
  calculateDeliverabilityTrend,
  classifyDeliverabilityHealth,
  senderDomainFromEmail,
  type DeliverabilityHealth,
  type DeliverabilityTrend,
  type EmailAuthenticationReport,
  type EmailDnsResolver,
  type NotificationDeliveryRow,
} from "@/lib/notifications/deliverability";
import { canViewDeliverability } from "@/lib/notifications/deliverability-access";

function isMissingDnsRecord(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  return ["ENODATA", "ENOTFOUND", "ENODOMAIN", "ENOTIMP"].includes(String(error.code));
}

const systemDnsResolver: EmailDnsResolver = {
  async txt(recordName) {
    try {
      const answers = await resolveTxt(recordName);
      return answers.map((chunks) => chunks.join(""));
    } catch (error) {
      if (isMissingDnsRecord(error)) return [];
      throw error;
    }
  },
  async cname(recordName) {
    try {
      return await resolveCname(recordName);
    } catch (error) {
      if (isMissingDnsRecord(error)) return [];
      throw error;
    }
  },
};

async function getConfiguredEmailAuthenticationReport(): Promise<EmailAuthenticationReport> {
  const configuredDomain = process.env.RESEND_SENDING_DOMAIN?.trim();
  const configuredSender = process.env.RESEND_FROM_EMAIL?.trim();
  const domain = configuredDomain || (configuredSender ? senderDomainFromEmail(configuredSender) : "");
  if (!domain) {
    throw new Error("Configure RESEND_SENDING_DOMAIN or RESEND_FROM_EMAIL before checking domain authentication");
  }

  return assessEmailAuthentication({
    domain,
    dkimSelector: process.env.RESEND_DKIM_SELECTOR,
    resolver: systemDnsResolver,
  });
}

async function getNotificationDeliverabilityTrend(instituteId: string, days = 30): Promise<DeliverabilityTrend> {
  const safeDays = Math.min(365, Math.max(1, Math.trunc(days)));
  const from = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1_000).toISOString();
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("notification_jobs")
    .select("status, created_at, sent_at, delivered_at, bounced_at")
    .eq("institute_id", instituteId)
    .gte("created_at", from)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Could not load notification delivery history: ${error.message}`);
  return calculateDeliverabilityTrend((data ?? []) as NotificationDeliveryRow[]);
}

async function getNotificationDeliverabilityReport(instituteId: string, days = 30): Promise<{
  authentication: EmailAuthenticationReport;
  trend: DeliverabilityTrend;
  health: DeliverabilityHealth;
}> {
  const [authentication, trend] = await Promise.all([
    getConfiguredEmailAuthenticationReport(),
    getNotificationDeliverabilityTrend(instituteId, days),
  ]);
  return { authentication, trend, health: classifyDeliverabilityHealth(trend.summary) };
}

export async function getAuthorizedNotificationDeliverabilityReport(
  access: {
    instituteId: string;
    status: string;
    permissionNames: ReadonlySet<string>;
  },
  days = 30,
): Promise<{
  authentication: EmailAuthenticationReport;
  trend: DeliverabilityTrend;
  health: DeliverabilityHealth;
}> {
  if (!canViewDeliverability(access)) {
    throw new Error("Deliverability monitoring requires an active user with Audit Log View");
  }
  return getNotificationDeliverabilityReport(access.instituteId, days);
}
