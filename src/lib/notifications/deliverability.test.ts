import { describe, expect, it } from "vitest";
import {
  assessEmailAuthentication,
  calculateDeliverabilityTrend,
  classifyDeliverabilityHealth,
  senderDomainFromEmail,
  type EmailDnsResolver,
  type NotificationDeliveryRow,
} from "./deliverability";

function resolver(records: Record<string, { txt?: string[]; cname?: string[] }> = {}): EmailDnsResolver {
  return {
    async txt(recordName) {
      return records[recordName]?.txt ?? [];
    },
    async cname(recordName) {
      return records[recordName]?.cname ?? [];
    },
  };
}

function row(
  status: string,
  date: string,
  overrides: Partial<NotificationDeliveryRow> = {},
): NotificationDeliveryRow {
  return {
    status,
    created_at: `${date}T08:00:00.000Z`,
    sent_at: `${date}T08:01:00.000Z`,
    delivered_at: null,
    bounced_at: null,
    ...overrides,
  };
}

describe("senderDomainFromEmail", () => {
  it("extracts and normalizes a configured sender domain", () => {
    expect(senderDomainFromEmail("PlacementOS <notifications@MAIL.IITIIMCAREERS.IN>")).toBe(
      "mail.iitiimcareers.in",
    );
  });

  it("rejects malformed sender identities", () => {
    expect(() => senderDomainFromEmail("PlacementOS notifications")).toThrow(/valid email/i);
  });
});

describe("assessEmailAuthentication", () => {
  it("passes when SPF, DKIM and enforced DMARC records exist", async () => {
    const report = await assessEmailAuthentication({
      domain: "mail.iitiimcareers.in",
      dkimSelector: "resend",
      checkedAt: new Date("2026-08-22T00:00:00.000Z"),
      resolver: resolver({
        "mail.iitiimcareers.in": { txt: ["v=spf1 include:amazonses.com -all"] },
        "resend._domainkey.mail.iitiimcareers.in": { cname: ["resend._domainkey.provider.test"] },
        "_dmarc.mail.iitiimcareers.in": { txt: ["v=DMARC1; p=reject; rua=mailto:dmarc@example.test"] },
      }),
    });

    expect(report.status).toBe("pass");
    expect(report.checks.map((check) => [check.kind, check.status])).toEqual([
      ["spf", "pass"],
      ["dkim", "pass"],
      ["dmarc", "pass"],
    ]);
    expect(report.checkedAt).toBe("2026-08-22T00:00:00.000Z");
  });

  it("warns when DKIM selector is unconfigured or DMARC is monitoring only", async () => {
    const report = await assessEmailAuthentication({
      domain: "mail.iitiimcareers.in",
      resolver: resolver({
        "mail.iitiimcareers.in": { txt: ["v=spf1 include:amazonses.com -all"] },
        "_dmarc.mail.iitiimcareers.in": { txt: ["v=DMARC1; p=none"] },
      }),
    });

    expect(report.status).toBe("warning");
    expect(report.checks.find((check) => check.kind === "dkim")?.status).toBe("unconfigured");
    expect(report.checks.find((check) => check.kind === "dmarc")?.status).toBe("warning");
  });

  it("fails duplicate SPF and missing DKIM policies", async () => {
    const report = await assessEmailAuthentication({
      domain: "mail.iitiimcareers.in",
      dkimSelector: "resend",
      resolver: resolver({
        "mail.iitiimcareers.in": { txt: ["v=spf1 include:a.test -all", "v=spf1 include:b.test -all"] },
        "_dmarc.mail.iitiimcareers.in": { txt: ["v=DMARC1; p=quarantine"] },
      }),
    });

    expect(report.status).toBe("fail");
    expect(report.checks.find((check) => check.kind === "spf")?.message).toMatch(/multiple/i);
    expect(report.checks.find((check) => check.kind === "dkim")?.status).toBe("fail");
  });

  it("reports a resolver failure without treating it as a missing policy", async () => {
    const failingResolver: EmailDnsResolver = {
      async txt() {
        throw new Error("temporary resolver failure");
      },
      async cname() {
        return [];
      },
    };

    const report = await assessEmailAuthentication({
      domain: "mail.iitiimcareers.in",
      dkimSelector: "resend",
      resolver: failingResolver,
    });

    expect(report.status).toBe("fail");
    expect(report.checks.find((check) => check.kind === "spf")?.status).toBe("error");
    expect(report.checks.find((check) => check.kind === "dmarc")?.message).toMatch(/lookup failed/i);
  });
});

describe("calculateDeliverabilityTrend", () => {
  it("computes summary and chronological daily provider outcomes", () => {
    const trend = calculateDeliverabilityTrend([
      row("delivered", "2026-08-20", { delivered_at: "2026-08-20T08:02:00.000Z" }),
      row("opened", "2026-08-20", { delivered_at: "2026-08-20T08:02:00.000Z" }),
      row("bounced", "2026-08-20", { bounced_at: "2026-08-20T08:02:00.000Z" }),
      row("clicked", "2026-08-21", { delivered_at: "2026-08-21T08:02:00.000Z" }),
      row("complained", "2026-08-21"),
      row("delivery_delayed", "2026-08-21"),
      row("failed", "2026-08-21"),
      row("queued", "2026-08-21", { sent_at: null }),
    ]);

    expect(trend.summary).toMatchObject({
      attempted: 6,
      delivered: 3,
      bounced: 1,
      complained: 1,
      delayed: 1,
      failed: 1,
      deliveryRate: 50,
    });
    expect(trend.summary.bounceRate).toBeCloseTo(16.6667, 3);
    expect(trend.summary.complaintRate).toBeCloseTo(16.6667, 3);
    expect(trend.daily.map((day) => day.date)).toEqual(["2026-08-20", "2026-08-21"]);
    expect(trend.daily[0]).toMatchObject({ attempted: 3, delivered: 2, bounced: 1 });
    expect(trend.daily[1]).toMatchObject({ attempted: 3, delivered: 1, complained: 1, delayed: 1, failed: 1 });
  });

  it("returns null rates when no provider attempt has happened", () => {
    const trend = calculateDeliverabilityTrend([row("blocked", "2026-08-22", { sent_at: null })]);
    expect(trend.summary).toMatchObject({
      attempted: 0,
      deliveryRate: null,
      bounceRate: null,
      complaintRate: null,
    });
  });
});

describe("classifyDeliverabilityHealth", () => {
  const metrics = (attempted: number, bounceRate: number, complaintRate: number) => ({
    attempted,
    delivered: attempted,
    bounced: 0,
    complained: 0,
    delayed: 0,
    failed: 0,
    deliveryRate: 100,
    bounceRate,
    complaintRate,
  });

  it("does not classify very small samples", () => {
    expect(classifyDeliverabilityHealth(metrics(10, 10, 1)).status).toBe("insufficient_data");
  });

  it("warns before provider limits are reached", () => {
    expect(classifyDeliverabilityHealth(metrics(100, 2.5, 0.01)).status).toBe("warning");
    expect(classifyDeliverabilityHealth(metrics(100, 0.5, 0.05)).status).toBe("warning");
  });

  it("marks provider-limit rates as critical", () => {
    const bounce = classifyDeliverabilityHealth(metrics(100, 4, 0));
    const complaint = classifyDeliverabilityHealth(metrics(100, 0, 0.08));
    expect(bounce.status).toBe("critical");
    expect(bounce.reasons[0]).toMatch(/4\.00%/);
    expect(complaint.status).toBe("critical");
  });

  it("accepts stricter configurable thresholds", () => {
    const health = classifyDeliverabilityHealth(metrics(10, 1, 0), {
      minimumAttempts: 10,
      bounceWarningPercent: 0.5,
      bounceCriticalPercent: 2,
      complaintWarningPercent: 0.02,
      complaintCriticalPercent: 0.05,
    });
    expect(health.status).toBe("warning");
    expect(health.thresholds.bounceCriticalPercent).toBe(2);
  });
});
