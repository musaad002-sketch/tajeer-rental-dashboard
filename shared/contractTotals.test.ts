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

    expect(totals).toMatchObject({
      baseTotal: "300.00",
      contractReferenceTotal: "300.00",
      delayDays: 4,
      delayTotal: "200.00",
      amountDueThroughDate: "500.00",
      grandTotal: "200.00",
    });
  });

  it("stops delay at the actual return date", () => {
    const totals = calculateContractTotals({
      baseTotal: "300",
      expectedReturnDate: "2026-08-28",
      actualReturnDate: "2026-08-30",
      rentalAmount: "50",
      type: "daily",
      asOf: new Date("2026-09-05T12:00:00Z"),
    });

    expect(totals.contractReferenceTotal).toBe("300.00");
    expect(totals.amountDueThroughDate).toBe("400.00");
    expect(totals.delayDays).toBe(2);
    expect(totals.delayTotal).toBe("100.00");
    expect(totals.grandTotal).toBe("100.00");
  });

  it("applies two-hour grace to short internal contracts without delay", () => {
    const totals = calculateContractTotals({
      baseTotal: "300",
      expectedReturnDate: "2026-08-28T10:00:00",
      rentalAmount: "50",
      type: "daily",
      contractScope: "domestic_limited",
      days: 3,
      asOf: new Date("2026-08-28T11:59:59"),
    });
    expect(totals.delayDays).toBe(0);
    expect(totals.delayTotal).toBe("0.00");
  });

  it("applies twelve-hour grace to monthly delivery", () => {
    const totals = calculateContractTotals({
      baseTotal: "3000",
      expectedReturnDate: "2026-08-28T10:00:00",
      rentalAmount: "3000",
      type: "monthly",
      asOf: new Date("2026-08-28T21:59:59"),
    });
    expect(totals.delayDays).toBe(0);
  });
});
