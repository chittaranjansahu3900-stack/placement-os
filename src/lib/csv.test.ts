import { describe, expect, it } from "vitest";
import { parseCsvRecords } from "./csv";

describe("parseCsvRecords", () => {
  it("splits plain comma-separated rows", () => {
    const { records, unclosedQuote } = parseCsvRecords("a,b,c\n1,2,3");
    expect(records).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
    expect(unclosedQuote).toBe(false);
  });

  it("handles a quoted field containing a comma", () => {
    const { records } = parseCsvRecords('name,note\nAlice,"Bangalore, Chennai"');
    expect(records).toEqual([
      ["name", "note"],
      ["Alice", "Bangalore, Chennai"],
    ]);
  });

  it("handles an escaped double-quote inside a quoted field", () => {
    const { records } = parseCsvRecords('field\n"She said ""hi"""');
    expect(records[1]).toEqual(['She said "hi"']);
  });

  it("handles a quoted field containing a newline", () => {
    const { records } = parseCsvRecords('note\n"line one\nline two"');
    expect(records).toEqual([["note"], ["line one\nline two"]]);
  });

  it("handles CRLF line endings without producing a blank row", () => {
    const { records } = parseCsvRecords("a,b\r\n1,2\r\n3,4");
    expect(records).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("skips blank lines", () => {
    const { records } = parseCsvRecords("a,b\n\n1,2\n\n\n3,4");
    expect(records).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("trims whitespace around unquoted cells", () => {
    const { records } = parseCsvRecords("  a  , b ,c ");
    expect(records).toEqual([["a", "b", "c"]]);
  });

  it("flags an unclosed quote", () => {
    const { unclosedQuote } = parseCsvRecords('a,"unterminated');
    expect(unclosedQuote).toBe(true);
  });

  it("returns no records for empty input", () => {
    const { records, unclosedQuote } = parseCsvRecords("");
    expect(records).toEqual([]);
    expect(unclosedQuote).toBe(false);
  });
});
