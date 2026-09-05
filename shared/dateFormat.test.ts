import { describe, expect, it } from "vitest";
import { formatGregorianDate, formatGregorianDateTime } from "./dateFormat";

describe("Gregorian date formatting", () => {
  it("formats date-only values as dd/mm/yyyy", () => {
    expect(formatGregorianDate("2026-09-05")).toBe("05/09/2026");
    expect(formatGregorianDate(new Date(2026, 8, 5))).toBe("05/09/2026");
  });

  it("formats date and time with the same Gregorian date", () => {
    expect(formatGregorianDateTime("2026-09-05T13:45:00")).toMatch(/^05\/09\/2026/);
  });

  it("handles empty and invalid values safely", () => {
    expect(formatGregorianDate(null)).toBe("—");
    expect(formatGregorianDate("not-a-date")).toBe("—");
  });
});
