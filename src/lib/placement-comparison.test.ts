import { describe, expect, it } from "vitest";
import { metricDelta, placementBatchMetrics } from "./placement-comparison";

describe("placementBatchMetrics", () => {
  it("keeps seasons separate and calculates rate, CTC, median, and unique companies", () => {
    const metrics = placementBatchMetrics(
      "new",
      [
        { id: "s1", batch_id: "new", placement_status: "placed" },
        { id: "s2", batch_id: "new", placement_status: "placed" },
        { id: "s3", batch_id: "new", placement_status: "unplaced" },
        { id: "old-s", batch_id: "old", placement_status: "placed" },
      ],
      [
        { student_id: "s1", company_id: "c1", final_ctc: 10 },
        { student_id: "s2", company_id: "c1", final_ctc: 20 },
        { student_id: "old-s", company_id: "c2", final_ctc: 99 },
      ],
    );
    expect(metrics).toMatchObject({
      total: 3,
      placed: 2,
      averageCtc: 15,
      medianCtc: 15,
      highestCtc: 20,
      hiringCompanies: 1,
    });
    expect(metrics.placementRate).toBeCloseTo(200 / 3);
  });

  it("returns honest empty metrics instead of manufacturing CTC values", () => {
    expect(placementBatchMetrics("empty", [], [])).toMatchObject({
      total: 0,
      placed: 0,
      placementRate: 0,
      averageCtc: null,
      medianCtc: null,
      highestCtc: null,
      hiringCompanies: 0,
    });
    expect(metricDelta(null, 10)).toBeNull();
    expect(metricDelta(12, 10)).toBe(2);
  });
});
