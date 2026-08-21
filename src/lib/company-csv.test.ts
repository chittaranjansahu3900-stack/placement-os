import { describe, expect, it } from "vitest";
import { previewCompanyCsv } from "./company-csv";

describe("previewCompanyCsv", () => {
  it("parses a valid row and defaults pipeline_stage to prospect when blank", () => {
    const { validRows, invalidRows } = previewCompanyCsv("name,sector,pipeline_stage\nAcme Corp,IT,");
    expect(invalidRows).toEqual([]);
    expect(validRows).toEqual([
      expect.objectContaining({ name: "Acme Corp", sector: "IT", pipeline_stage: "prospect" }),
    ]);
  });

  it("normalizes a spaced pipeline stage like 'Not Interested'-style input", () => {
    const { validRows } = previewCompanyCsv("name,pipeline_stage\nAcme,Contacted");
    expect(validRows[0].pipeline_stage).toBe("contacted");
  });

  it("rejects an invalid pipeline stage rather than silently defaulting it into validRows", () => {
    const { invalidRows } = previewCompanyCsv("name,pipeline_stage\nAcme,not_a_real_stage");
    expect(invalidRows).toHaveLength(1);
    expect(invalidRows[0].issues).toContain("Invalid pipeline stage");
  });

  it("rejects a missing company name", () => {
    const { invalidRows } = previewCompanyCsv("name,sector\n,NoName");
    expect(invalidRows[0].issues).toContain("Missing company name");
  });

  it("flags a duplicate company name within the same file", () => {
    const { validRows, invalidRows } = previewCompanyCsv(
      "name,sector\nAcme Corp,IT\nacme corp,Finance",
    );
    expect(validRows).toHaveLength(1);
    expect(invalidRows).toHaveLength(1);
    expect(invalidRows[0].issues).toContain("Duplicate company name in this file");
  });

  it("works without a header row", () => {
    const { validRows } = previewCompanyCsv("Acme,IT,onboarded");
    expect(validRows[0]).toMatchObject({ name: "Acme", sector: "IT", pipeline_stage: "onboarded" });
  });
});
