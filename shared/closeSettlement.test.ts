import { describe, expect, it } from "vitest";
import { calculateCloseSettlement } from "./closeSettlement";

describe("calculateCloseSettlement", () => {
  it("يخصم الأيام غير المستخدمة قبل الإغلاق ثم يمنع الإغلاق إذا بقي رصيد حتى يوم الإغلاق", () => {
    const result = calculateCloseSettlement({ baseTotal: 3000, expectedReturnDate: "2026-09-30", closedAt: "2026-09-20", rentalAmount: 100, type: "daily", paidAmount: 1000 });
    expect(result.remainingDays).toBe(11);
    expect(result.adjustedBase).toBe("1900.00");
    expect(result.amountDueThroughClose).toBe("1900.00");
    expect(result.balances.previousOutstanding).toBe("900.00");
    expect(result.customerCredit).toBe("0.00");
    expect(result.canClose).toBe(false);
  });

  it("يسمح بالإغلاق عندما يغطي المدفوع المستحق حتى يوم الإغلاق ويسجل فائض الأيام كرصيد للعميل", () => {
    const result = calculateCloseSettlement({ baseTotal: 3000, expectedReturnDate: "2026-09-30", closedAt: "2026-09-20", rentalAmount: 100, type: "daily", paidAmount: 3000 });
    expect(result.canClose).toBe(true);
    expect(result.hasSurplusPaidDays).toBe(true);
    expect(result.shouldRecordReturn).toBe(true);
    expect(result.customerCredit).toBe("1100.00");
    expect(result.balances.grandOutstanding).toBe("0.00");
  });

  it("لا يحتسب الأيام المستقبلية غير المدفوعة عند وجود رصيد مستحق", () => {
    const result = calculateCloseSettlement({ baseTotal: 3000, expectedReturnDate: "2026-09-30", closedAt: "2026-09-20", rentalAmount: 100, type: "daily", paidAmount: 1500 });
    expect(result.amountDueThroughClose).toBe("1900.00");
    expect(result.balances.grandOutstanding).toBe("400.00");
    expect(result.customerCredit).toBe("0.00");
    expect(result.canClose).toBe(false);
  });

  it("يضيف التأخير حتى يوم الإغلاق فقط ولا يضيف أياماً بعده", () => {
    const result = calculateCloseSettlement({ baseTotal: 1000, expectedReturnDate: "2026-09-10", closedAt: "2026-09-20", rentalAmount: 100, type: "daily", paidAmount: 1500 });
    expect(result.totals.delayDays).toBe(10);
    expect(result.amountDueThroughClose).toBe("2000.00");
    expect(result.balances.grandOutstanding).toBe("500.00");
    expect(result.canClose).toBe(false);
  });
});
