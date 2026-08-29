import { describe, expect, it } from "vitest";
import { calculateReturnSettlement } from "./returnSettlement";

describe("calculateReturnSettlement", () => {
  it("يحسب الأيام المتبقية شاملاً يوم الاسترجاع واليوم المتوقع للتسليم للعقد اليومي", () => {
    expect(calculateReturnSettlement({ expectedReturnDate: "2026-09-06", returnedAt: "2026-09-02", rentalAmount: 80, type: "daily" })).toEqual({ remainingDays: 5, dailyRate: "80.00", remainingValue: "400.00" });
  });

  it("يقسم الإيجار الشهري على 30 يوماً ثابتة عند حساب قيمة الاسترجاع", () => {
    expect(calculateReturnSettlement({ expectedReturnDate: "2026-09-06", returnedAt: "2026-09-05", rentalAmount: 3000, type: "monthly" })).toEqual({ remainingDays: 2, dailyRate: "100.00", remainingValue: "200.00" });
  });
});
