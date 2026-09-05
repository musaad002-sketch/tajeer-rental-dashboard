import { describe, expect, it } from "vitest";
import { calculateDashboardOutstandingBreakdown } from "./dashboardOutstanding";

describe("dashboard outstanding breakdown", () => {
  it("separates previous balance, delay, and current delay balance", () => {
    const result = calculateDashboardOutstandingBreakdown([
      { totalAmount: "100", expectedReturnDate: "2099-01-01", rentalAmount: "100", type: "daily", paidAmount: "25" },
      { totalAmount: "100", expectedReturnDate: "2020-01-01", rentalAmount: "20", type: "daily", paidAmount: "100" },
    ]);
    expect(result.previousOutstanding).toBe("75.00");
    expect(Number(result.delayOutstanding)).toBeGreaterThan(0);
    expect(Number(result.currentOutstanding)).toBeGreaterThan(0);
    expect(Number(result.grandOutstanding)).toBe(Number(result.previousOutstanding) + Number(result.currentOutstanding));
  });
});
