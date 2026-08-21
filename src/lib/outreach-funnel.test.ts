import { describe, expect, it } from "vitest";
import { outreachFunnel } from "./outreach-funnel";

describe("outreachFunnel", () => {
  it("deduplicates companies and attributes explicit responses by JPC and season", () => {
    const rows = outreachFunnel(
      "season-1",
      [{ id: "jpc-1", name: "JPC One" }],
      [
        { batch_id: "season-1", company_id: "c1", logged_by_user_id: "jpc-1", merge_status: "email_sent" },
        { batch_id: "season-1", company_id: "c1", logged_by_user_id: "jpc-1", merge_status: "responded" },
        { batch_id: "season-1", company_id: "c2", logged_by_user_id: "jpc-1", merge_status: null },
        { batch_id: "season-2", company_id: "c3", logged_by_user_id: "jpc-1", merge_status: "responded" },
      ],
      [{ id: "c1", pipeline_stage: "onboarded" }, { id: "c2", pipeline_stage: "contacted" }],
    );

    expect(rows[0]).toMatchObject({ contacted: 2, responded: 1, onboarded: 1, responseRate: 50, onboardingRate: 50 });
  });
});
