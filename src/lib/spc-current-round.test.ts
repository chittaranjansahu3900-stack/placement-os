import { describe, expect, it } from "vitest";
import { currentRoundByJd } from "./spc-current-round";

describe("currentRoundByJd", () => {
  it("uses the most recently assigned real round and counts candidates currently in it", () => {
    const result = currentRoundByJd([
      { jd_id: "jd-1", round_history: [{ round: "GD", assigned_at: "2026-08-20T10:00:00Z" }, { round: "PI", assigned_at: "2026-08-21T10:00:00Z", scheduled_at: "2026-08-22T10:00:00Z", location: "Room 1" }] },
      { jd_id: "jd-1", round_history: [{ round: "GD", assigned_at: "2026-08-20T11:00:00Z" }, { round: "PI", assigned_at: "2026-08-21T09:00:00Z" }] },
      { jd_id: "jd-1", round_history: [{ round: "GD", assigned_at: "2026-08-20T12:00:00Z" }] },
    ]).get("jd-1");

    expect(result).toMatchObject({ round: "PI", candidateCount: 2, location: "Room 1" });
  });

  it("ignores malformed histories", () => {
    expect(currentRoundByJd([{ jd_id: "jd-1", round_history: "bad" }]).has("jd-1")).toBe(false);
  });
});
