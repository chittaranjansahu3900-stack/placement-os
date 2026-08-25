import { describe, expect, it } from "vitest";
import { canViewDeliverability } from "@/lib/notifications/deliverability-access";

describe("deliverability access", () => {
  it("allows an active Audit Log View holder", () => {
    expect(canViewDeliverability({
      status: "active",
      permissionNames: new Set(["Audit Log View"]),
    })).toBe(true);
  });

  it("does not infer access from reporting or outreach permissions", () => {
    expect(canViewDeliverability({
      status: "active",
      permissionNames: new Set(["Reports & Export", "CRM/Outreach"]),
    })).toBe(false);
  });

  it.each(["pending", "deactivated"])("denies a %s Audit Log View holder", (status) => {
    expect(canViewDeliverability({
      status,
      permissionNames: new Set(["Audit Log View"]),
    })).toBe(false);
  });

  it("denies a missing context", () => {
    expect(canViewDeliverability(null)).toBe(false);
  });
});
