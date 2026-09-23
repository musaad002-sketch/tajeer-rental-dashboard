import { describe, expect, it } from "vitest";
import { calculateContractBalances } from "./contractBalances";

describe("financial source of truth balances", () => {
  it("calculates 900 - 300 - 350 = 250, then 250 + 400 = 650", () => {
    const balances = calculateContractBalances({ baseTotal: 900, delayTotal: 400, paidAmount: 650 });
    expect(balances.previousOutstanding).toBe("250.00");
    expect(balances.currentOutstanding).toBe("400.00");
    expect(balances.grandOutstanding).toBe("650.00");
    expect(Number(balances.grandOutstanding)).not.toBe(1550);
  });

  it("keeps pending or rejected payments out of the operational paid amount", () => {
    const pending = calculateContractBalances({ baseTotal: 900, delayTotal: 400, paidAmount: 0 });
    const approved = calculateContractBalances({ baseTotal: 900, delayTotal: 400, paidAmount: 100 });
    const rejected = calculateContractBalances({ baseTotal: 900, delayTotal: 400, paidAmount: 0 });
    expect(pending.grandOutstanding).toBe("1300.00");
    expect(approved.grandOutstanding).toBe("1200.00");
    expect(rejected.grandOutstanding).toBe("1300.00");
  });

  it("keeps excess mileage as a separate debt bucket", () => {
    const balances = calculateContractBalances({ baseTotal: 900, delayTotal: 400, paidAmount: 650, excessMileageBalance: 125 });
    expect(balances.previousOutstanding).toBe("250.00");
    expect(balances.currentOutstanding).toBe("400.00");
    expect(balances.excessMileageOutstanding).toBe("125.00");
    expect(balances.grandOutstanding).toBe("775.00");
  });
});
