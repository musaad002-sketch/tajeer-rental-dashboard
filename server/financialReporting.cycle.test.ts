import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn() }));

import { getOperatingCycle } from "../shared/rentalRules";
import { aggregateByMonthlyCycle } from "./financialReporting";

describe("financial reporting operating cycle", () => {
  it("places the fifth day in the previous cycle", () => {
    const cycle = getOperatingCycle(new Date(2026, 8, 5));
    expect(cycle.start).toEqual(new Date(2026, 7, 6));
    expect(cycle.end).toEqual(new Date(2026, 8, 5));
  });

  it("places the sixth day in the new cycle", () => {
    const cycle = getOperatingCycle(new Date(2026, 8, 6));
    expect(cycle.start).toEqual(new Date(2026, 8, 6));
    expect(cycle.end).toEqual(new Date(2026, 9, 5));
  });

  it("crosses the year for December thirty-first", () => {
    const cycle = getOperatingCycle(new Date(2026, 11, 31));
    expect(cycle.start).toEqual(new Date(2026, 11, 6));
    expect(cycle.end).toEqual(new Date(2027, 0, 5));
  });

  it("places January first in the January operating cycle", () => {
    const cycle = getOperatingCycle(new Date(2027, 0, 1));
    expect(cycle.start).toEqual(new Date(2026, 11, 6));
    expect(cycle.end).toEqual(new Date(2027, 0, 5));
  });

  it("returns twelve monthly operating cycles for a year", () => {
    const monthly = aggregateByMonthlyCycle([], 2026);
    expect(monthly).toHaveLength(12);
    expect(monthly[0]).toMatchObject({
      label: "01/2026",
      cycleStart: "2026-01-06",
      cycleEnd: "2026-02-05",
    });
  });

  it("sums monthly revenues into the annual revenue total", () => {
    const monthly = aggregateByMonthlyCycle([
      {
        id: 1,
        transactionType: "revenue",
        approvalStatus: "approved",
        amount: "100",
        transactionDate: new Date(2026, 0, 10),
      },
      {
        id: 2,
        transactionType: "revenue",
        approvalStatus: "approved",
        amount: "250.50",
        transactionDate: new Date(2026, 5, 10),
      },
    ] as any, 2026);
    expect(monthly.reduce((sum, month) => sum + month.revenues, 0)).toBe(350.5);
  });
});