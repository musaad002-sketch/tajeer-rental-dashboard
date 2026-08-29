import { describe, expect, it } from "vitest";
import { calculateSuspensionSettlement, statusAfterSuspendedSettlement } from "./suspensionSettlement";

describe("calculateSuspensionSettlement", () => {
  it("يخصم بقية الأيام غير المستخدمة من الرصيد عند تعليق العقد", () => {
    const result = calculateSuspensionSettlement({ baseTotal: 3000, expectedReturnDate: "2026-09-30", suspendedAt: "2026-09-20", rentalAmount: 100, type: "daily", paidAmount: 1000 });
    expect(result.remainingDays).toBe(11);
    expect(result.unusedValue).toBe("1100.00");
    expect(result.adjustedBase).toBe("1900.00");
    expect(result.balances.grandOutstanding).toBe("900.00");
  });

  it("لا يحتسب أياماً بعد تاريخ التعليق عند وجود رصيد مستحق", () => {
    const result = calculateSuspensionSettlement({ baseTotal: 1000, expectedReturnDate: "2026-09-10", suspendedAt: "2026-09-20", rentalAmount: 100, type: "daily", paidAmount: 1500 });
    expect(result.amountDueThroughSuspension).toBe("2000.00");
    expect(result.totals.delayDays).toBe(10);
    expect(result.balances.grandOutstanding).toBe("500.00");
  });
});

describe("statusAfterSuspendedSettlement", () => {
  it("يعيد تفعيل العقد المعلق عند تسوية الرصيد قبل التسليم", () => {
    expect(statusAfterSuspendedSettlement({ status: "suspended", outstanding: "0.00", expectedReturnDate: "2026-09-10", now: new Date("2026-09-01") })).toBe("active");
  });

  it("يعيد العقد متأخراً عند تسوية الرصيد بعد التسليم ولا ينقل العقد ذي الرصيد المتبقي", () => {
    expect(statusAfterSuspendedSettlement({ status: "suspended", outstanding: "0.00", expectedReturnDate: "2026-08-20", now: new Date("2026-08-25") })).toBe("overdue");
    expect(statusAfterSuspendedSettlement({ status: "suspended", outstanding: "1.00", expectedReturnDate: "2026-09-10" })).toBeNull();
  });
});
