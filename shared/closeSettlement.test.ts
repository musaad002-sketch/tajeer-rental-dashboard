import { describe, expect, it } from "vitest";
import { calculateCloseSettlement } from "./closeSettlement";

describe("calculateCloseSettlement", () => {
  it("يخصم الأيام غير المستخدمة قبل الإغلاق ثم يمنع الإغلاق إذا بقي رصيد", () => {
    const result = calculateCloseSettlement({ baseTotal: 3000, expectedReturnDate: "2026-09-30", closedAt: "2026-09-20", rentalAmount: 100, type: "daily", paidAmount: 1000 });
    expect(result.remainingDays).toBe(11);
    expect(result.adjustedBase).toBe("1900.00");
    expect(result.balances.previousOutstanding).toBe("900.00");
    expect(result.canClose).toBe(false);
  });

  it("يسمح بالإغلاق فقط عندما يغطي المدفوع الرصيد بعد خصم الأيام غير المستخدمة", () => {
    const result = calculateCloseSettlement({ baseTotal: 3000, expectedReturnDate: "2026-09-30", closedAt: "2026-09-20", rentalAmount: 100, type: "daily", paidAmount: 1900 });
    expect(result.canClose).toBe(true);
    expect(result.balances.grandOutstanding).toBe("0.00");
  });
});
