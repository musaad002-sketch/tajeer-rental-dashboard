import { describe, expect, it } from "vitest";
import { calculateContractTotals } from "./contractTotals";

describe("calculateContractTotals", () => {
  it("separates base total, delay total, and grand total", () => {
    const totals = calculateContractTotals({
      baseTotal: "300",
      expectedReturnDate: "2026-08-28",
      rentalAmount: "50",
      type: "daily",
      asOf: new Date("2026-08-31T12:00:00Z"),
    });

    expect(totals).toEqual({
      baseTotal: "300.00",
      delayDays: 3,
      delayTotal: "150.00",
      grandTotal: "450.00",
    });
  });
});
