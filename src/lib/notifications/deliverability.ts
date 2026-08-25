export type EmailAuthenticationKind = "spf" | "dkim" | "dmarc";
export type EmailAuthenticationStatus = "pass" | "warning" | "fail" | "unconfigured" | "error";

export interface EmailAuthenticationCheck {
  kind: EmailAuthenticationKind;
  recordName: string;
  status: EmailAuthenticationStatus;
  records: string[];
  message: string;
}

export interface EmailAuthenticationReport {
  domain: string;
  dkimSelector: string | null;
  status: "pass" | "warning" | "fail";
  checks: EmailAuthenticationCheck[];
  checkedAt: string;
}

export interface EmailDnsResolver {
  txt(recordName: string): Promise<string[]>;
  cname(recordName: string): Promise<string[]>;
}

export interface NotificationDeliveryRow {
  status: string;
  created_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  bounced_at: string | null;
}

export interface DeliverabilityMetrics {
  attempted: number;
  delivered: number;
  bounced: number;
  complained: number;
  delayed: number;
  failed: number;
  deliveryRate: number | null;
  bounceRate: number | null;
  complaintRate: number | null;
}

export interface DailyDeliverabilityMetrics extends DeliverabilityMetrics {
  date: string;
}

export interface DeliverabilityTrend {
  summary: DeliverabilityMetrics;
  daily: DailyDeliverabilityMetrics[];
}

export interface DeliverabilityThresholds {
  minimumAttempts: number;
  bounceWarningPercent: number;
  bounceCriticalPercent: number;
  complaintWarningPercent: number;
  complaintCriticalPercent: number;
}

export interface DeliverabilityHealth {
  status: "healthy" | "warning" | "critical" | "insufficient_data";
  reasons: string[];
  thresholds: DeliverabilityThresholds;
}

// Resend currently requires bounce rate <4% and spam rate <0.08%. Warning
// levels are deliberately set at half those provider limits to leave room to
// investigate before sending is at risk. Keep configuration overridable so a
// provider/domain change does not require changing monitoring code.
export const RESEND_DEFAULT_THRESHOLDS: DeliverabilityThresholds = {
  minimumAttempts: 25,
  bounceWarningPercent: 2,
  bounceCriticalPercent: 4,
  complaintWarningPercent: 0.04,
  complaintCriticalPercent: 0.08,
};

const HOSTNAME_PATTERN = /^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const ATTEMPTED_STATUSES = new Set([
  "sent",
  "delivered",
  "delivery_delayed",
  "opened",
  "clicked",
  "bounced",
  "complained",
  "suppressed",
]);
const DELIVERED_STATUSES = new Set(["delivered", "opened", "clicked"]);

function normalizedDomain(domain: string): string {
  const value = domain.trim().toLowerCase().replace(/\.$/, "");
  if (!HOSTNAME_PATTERN.test(value)) throw new Error("A valid fully qualified email domain is required");
  return value;
}

function normalizedSelector(selector?: string | null): string | null {
  const value = selector?.trim().toLowerCase() ?? "";
  if (!value) return null;
  if (!/^[a-z0-9](?:[a-z0-9_-]{0,61}[a-z0-9])?$/.test(value)) {
    throw new Error("DKIM selector contains unsupported characters");
  }
  return value;
}

function cleanRecords(records: string[]): string[] {
  return [...new Set(records.map((record) => record.trim()).filter(Boolean))];
}

async function safelyResolve(
  resolver: () => Promise<string[]>,
): Promise<{ records: string[]; error: string | null }> {
  try {
    return { records: cleanRecords(await resolver()), error: null };
  } catch (error) {
    return {
      records: [],
      error: error instanceof Error ? error.message : "DNS lookup failed",
    };
  }
}

function spfCheck(domain: string, records: string[], error: string | null): EmailAuthenticationCheck {
  const spfRecords = records.filter((record) => /^v=spf1(?:\s|$)/i.test(record));
  if (error) {
    return { kind: "spf", recordName: domain, status: "error", records, message: `SPF lookup failed: ${error}` };
  }
  if (spfRecords.length === 0) {
    return { kind: "spf", recordName: domain, status: "fail", records, message: "No SPF policy was found" };
  }
  if (spfRecords.length > 1) {
    return { kind: "spf", recordName: domain, status: "fail", records: spfRecords, message: "Multiple SPF policies were found; publish one combined policy" };
  }
  return { kind: "spf", recordName: domain, status: "pass", records: spfRecords, message: "SPF policy found" };
}

function dmarcCheck(domain: string, records: string[], error: string | null): EmailAuthenticationCheck {
  const recordName = `_dmarc.${domain}`;
  const policies = records.filter((record) => /^v=dmarc1(?:;|\s|$)/i.test(record));
  if (error) {
    return { kind: "dmarc", recordName, status: "error", records, message: `DMARC lookup failed: ${error}` };
  }
  if (policies.length === 0) {
    return { kind: "dmarc", recordName, status: "fail", records, message: "No DMARC policy was found" };
  }
  if (policies.length > 1) {
    return { kind: "dmarc", recordName, status: "fail", records: policies, message: "Multiple DMARC policies were found" };
  }
  const policy = policies[0].match(/(?:^|;)\s*p\s*=\s*([^;\s]+)/i)?.[1]?.toLowerCase();
  if (!policy) {
    return { kind: "dmarc", recordName, status: "fail", records: policies, message: "DMARC record has no p= policy" };
  }
  if (policy === "none") {
    return { kind: "dmarc", recordName, status: "warning", records: policies, message: "DMARC is monitoring only (p=none)" };
  }
  if (policy !== "quarantine" && policy !== "reject") {
    return { kind: "dmarc", recordName, status: "fail", records: policies, message: `Unsupported DMARC policy: p=${policy}` };
  }
  return { kind: "dmarc", recordName, status: "pass", records: policies, message: `DMARC enforcement is enabled (p=${policy})` };
}

function dkimCheck(
  domain: string,
  selector: string | null,
  txtRecords: string[],
  cnameRecords: string[],
  error: string | null,
): EmailAuthenticationCheck {
  if (!selector) {
    return {
      kind: "dkim",
      recordName: `_domainkey.${domain}`,
      status: "unconfigured",
      records: [],
      message: "Configure the provider DKIM selector before checking DKIM",
    };
  }
  const recordName = `${selector}._domainkey.${domain}`;
  const records = cleanRecords([...txtRecords, ...cnameRecords]);
  if (error) {
    return { kind: "dkim", recordName, status: "error", records, message: `DKIM lookup failed: ${error}` };
  }
  if (records.length === 0) {
    return { kind: "dkim", recordName, status: "fail", records, message: "No DKIM TXT or CNAME record was found" };
  }
  return { kind: "dkim", recordName, status: "pass", records, message: "DKIM record found" };
}

export function senderDomainFromEmail(sender: string): string {
  const match = sender.trim().match(/^(?:[^<]*<)?[^@<>\s]+@([^<>\s]+)>?$/);
  if (!match) throw new Error("Sender identity must contain a valid email address");
  return normalizedDomain(match[1]);
}

export async function assessEmailAuthentication(input: {
  domain: string;
  dkimSelector?: string | null;
  resolver: EmailDnsResolver;
  checkedAt?: Date;
}): Promise<EmailAuthenticationReport> {
  const domain = normalizedDomain(input.domain);
  const selector = normalizedSelector(input.dkimSelector);
  const dmarcName = `_dmarc.${domain}`;
  const dkimName = selector ? `${selector}._domainkey.${domain}` : null;

  const [spf, dmarc, dkimTxt, dkimCname] = await Promise.all([
    safelyResolve(() => input.resolver.txt(domain)),
    safelyResolve(() => input.resolver.txt(dmarcName)),
    dkimName ? safelyResolve(() => input.resolver.txt(dkimName)) : Promise.resolve({ records: [], error: null }),
    dkimName ? safelyResolve(() => input.resolver.cname(dkimName)) : Promise.resolve({ records: [], error: null }),
  ]);

  const hasDkimRecord = dkimTxt.records.length > 0 || dkimCname.records.length > 0;
  const dkimError = hasDkimRecord
    ? null
    : [dkimTxt.error, dkimCname.error].filter(Boolean).join("; ") || null;
  const checks = [
    spfCheck(domain, spf.records, spf.error),
    dkimCheck(domain, selector, dkimTxt.records, dkimCname.records, dkimError),
    dmarcCheck(domain, dmarc.records, dmarc.error),
  ];
  const status = checks.some((check) => check.status === "fail" || check.status === "error")
    ? "fail"
    : checks.some((check) => check.status === "warning" || check.status === "unconfigured")
      ? "warning"
      : "pass";

  return {
    domain,
    dkimSelector: selector,
    status,
    checks,
    checkedAt: (input.checkedAt ?? new Date()).toISOString(),
  };
}

function emptyMetrics(): DeliverabilityMetrics {
  return {
    attempted: 0,
    delivered: 0,
    bounced: 0,
    complained: 0,
    delayed: 0,
    failed: 0,
    deliveryRate: null,
    bounceRate: null,
    complaintRate: null,
  };
}

function finalizeMetrics(metrics: DeliverabilityMetrics): DeliverabilityMetrics {
  if (metrics.attempted === 0) return metrics;
  return {
    ...metrics,
    deliveryRate: (metrics.delivered / metrics.attempted) * 100,
    bounceRate: (metrics.bounced / metrics.attempted) * 100,
    complaintRate: (metrics.complained / metrics.attempted) * 100,
  };
}

function addRow(metrics: DeliverabilityMetrics, row: NotificationDeliveryRow): void {
  if (ATTEMPTED_STATUSES.has(row.status)) metrics.attempted += 1;
  if (DELIVERED_STATUSES.has(row.status)) metrics.delivered += 1;
  if (row.status === "bounced") metrics.bounced += 1;
  if (row.status === "complained") metrics.complained += 1;
  if (row.status === "delivery_delayed") metrics.delayed += 1;
  if (row.status === "failed" || row.status === "suppressed") metrics.failed += 1;
}

export function calculateDeliverabilityTrend(rows: NotificationDeliveryRow[]): DeliverabilityTrend {
  const summary = emptyMetrics();
  const daily = new Map<string, DeliverabilityMetrics>();

  for (const row of rows) {
    addRow(summary, row);
    const timestamp = row.sent_at ?? row.created_at;
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) continue;
    const dateKey = date.toISOString().slice(0, 10);
    const metrics = daily.get(dateKey) ?? emptyMetrics();
    addRow(metrics, row);
    daily.set(dateKey, metrics);
  }

  return {
    summary: finalizeMetrics(summary),
    daily: [...daily.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, metrics]) => ({ date, ...finalizeMetrics(metrics) })),
  };
}

function validThresholds(thresholds: DeliverabilityThresholds): DeliverabilityThresholds {
  const values = Object.values(thresholds);
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("Deliverability thresholds must be finite, non-negative numbers");
  }
  if (thresholds.minimumAttempts < 1) throw new Error("minimumAttempts must be at least 1");
  if (thresholds.bounceWarningPercent >= thresholds.bounceCriticalPercent) {
    throw new Error("Bounce warning threshold must be below the critical threshold");
  }
  if (thresholds.complaintWarningPercent >= thresholds.complaintCriticalPercent) {
    throw new Error("Complaint warning threshold must be below the critical threshold");
  }
  return thresholds;
}

export function classifyDeliverabilityHealth(
  metrics: DeliverabilityMetrics,
  thresholds: DeliverabilityThresholds = RESEND_DEFAULT_THRESHOLDS,
): DeliverabilityHealth {
  const configured = validThresholds(thresholds);
  if (metrics.attempted < configured.minimumAttempts) {
    return {
      status: "insufficient_data",
      reasons: [`At least ${configured.minimumAttempts} provider attempts are required before classifying sender health`],
      thresholds: configured,
    };
  }

  const bounceRate = metrics.bounceRate ?? 0;
  const complaintRate = metrics.complaintRate ?? 0;
  const criticalReasons: string[] = [];
  const warningReasons: string[] = [];

  if (bounceRate >= configured.bounceCriticalPercent) {
    criticalReasons.push(`Bounce rate ${bounceRate.toFixed(2)}% is at or above ${configured.bounceCriticalPercent}%`);
  } else if (bounceRate >= configured.bounceWarningPercent) {
    warningReasons.push(`Bounce rate ${bounceRate.toFixed(2)}% is approaching the ${configured.bounceCriticalPercent}% limit`);
  }

  if (complaintRate >= configured.complaintCriticalPercent) {
    criticalReasons.push(`Complaint rate ${complaintRate.toFixed(3)}% is at or above ${configured.complaintCriticalPercent}%`);
  } else if (complaintRate >= configured.complaintWarningPercent) {
    warningReasons.push(`Complaint rate ${complaintRate.toFixed(3)}% is approaching the ${configured.complaintCriticalPercent}% limit`);
  }

  if (criticalReasons.length) return { status: "critical", reasons: criticalReasons, thresholds: configured };
  if (warningReasons.length) return { status: "warning", reasons: warningReasons, thresholds: configured };
  return { status: "healthy", reasons: ["Bounce and complaint rates are below configured warning levels"], thresholds: configured };
}
