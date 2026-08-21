import { describe, expect, it } from "vitest";
import { maskResumePii, unmaskResumePii } from "./resume-ai-pii";

describe("Resume AI PII masking", () => {
  it("masks known identity values plus contact patterns and restores them", () => {
    const source = "Asha Rao | asha@example.com | +91 98765 43210 | https://linkedin.com/in/asha";
    const masked = maskResumePii(source, ["Asha Rao"]);

    expect(masked.maskedText).not.toContain("Asha Rao");
    expect(masked.maskedText).not.toContain("asha@example.com");
    expect(masked.maskedText).not.toContain("98765 43210");
    expect(masked.maskedText).not.toContain("linkedin.com");
    expect(masked.replacements.size).toBe(4);
    expect(unmaskResumePii(masked.maskedText, masked.replacements)).toBe(source);
  });

  it("masks longer values first and matches known PII case-insensitively", () => {
    const masked = maskResumePii("ASHA RAO led Asha's project", ["Asha", "Asha Rao"]);
    expect(masked.maskedText).not.toMatch(/asha/i);
    expect(unmaskResumePii(masked.maskedText, masked.replacements)).toBe(
      "Asha Rao led Asha's project",
    );
  });

  it("does not treat ordinary metrics as Indian phone numbers", () => {
    const masked = maskResumePii("Improved revenue by 2026 and handled 12345 records", []);
    expect(masked.maskedText).toBe("Improved revenue by 2026 and handled 12345 records");
  });
});
