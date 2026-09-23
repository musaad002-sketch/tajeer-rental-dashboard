import { describe, expect, it } from "vitest";
import { toCsv } from "./exporting";

describe("toCsv", () => {
  it("returns empty for empty rows", () => {
    expect(toCsv([])).toBe("");
  });

  it("converts rows with Arabic headers", () => {
    const csv = toCsv(
      [{ name: "أحمد", amount: 100 }],
      [
        { key: "name", header: "الاسم" },
        { key: "amount", header: "المبلغ" },
      ]
    );
    expect(csv).toContain("الاسم");
    expect(csv).toContain("أحمد");
  });

  it("handles null values", () => {
    const csv = toCsv(
      [{ name: null, amount: 100 }],
      [
        { key: "name", header: "الاسم" },
        { key: "amount", header: "المبلغ" },
      ]
    );
    expect(csv).toContain("الاسم,المبلغ\r\n,100");
  });
});