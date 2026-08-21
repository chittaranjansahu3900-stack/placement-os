import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  applicationStatusTemplate,
  jdPublishedTemplate,
  outreachTemplate,
  roundTemplate,
} from "./templates";

describe("notification templates", () => {
  const originalBaseUrl = process.env.APP_BASE_URL;

  beforeEach(() => {
    process.env.APP_BASE_URL = "https://placements.example.test/";
  });

  afterEach(() => {
    process.env.APP_BASE_URL = originalBaseUrl;
  });

  it("renders a JD notice without allowing recipient HTML injection", () => {
    const result = jdPublishedTemplate({
      recipientName: "<script>alert(1)</script>",
      companyName: "Acme & Co",
      roleTitle: "Analyst",
      deadline: "2026-08-31T12:00:00.000Z",
      locations: ["Raipur"],
      ctcTotal: 18,
      jdId: "jd-1",
    });

    expect(result.subject).toContain("Acme & Co");
    expect(result.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(result.html).not.toContain("<script>alert(1)</script>");
    expect(result.text).toContain("https://placements.example.test/jobs");
  });

  it("keeps status and reminder templates fact-based", () => {
    expect(
      applicationStatusTemplate({
        companyName: "Acme",
        roleTitle: "Analyst",
        status: "under_review",
      }).text,
    ).toContain("under review");
    expect(
      roundTemplate({
        companyName: "Acme",
        roleTitle: "Analyst",
        round: "PI",
        scheduledAt: "2026-09-01T04:30:00.000Z",
        location: "Room 1",
        reminder: true,
      }).subject,
    ).toContain("Reminder");
  });

  it("escapes outreach HTML while preserving plain text", () => {
    const result = outreachTemplate({ subject: "Hello", message: "Use <strong>facts</strong>" });
    expect(result.text).toBe("Use <strong>facts</strong>");
    expect(result.html).toContain("&lt;strong&gt;facts&lt;/strong&gt;");
  });
});
