import { describe, expect, it } from "vitest";
import { addAdditionalFee, calculateRateAdjustedTotal, calculateRemaining } from "./contractFinance";

describe("الحسابات المالية لعمليات العقد", () => {
  it("يحسب المتبقي من الإجمالي ناقص المدفوع ولا يسمح بقيمة سالبة", () => {
    expect(calculateRemaining("1500.00", "400.00")).toBe(1100);
    expect(calculateRemaining("400.00", "1500.00")).toBe(0);
  });

  it("يضيف الرسوم الإضافية إلى إجمالي العقد", () => {
    expect(addAdditionalFee("1500.00", "125.50")).toBe("1625.50");
  });

  it("يعيد احتساب العقد اليومي مع إبقاء الإضافات السابقة", () => {
    expect(calculateRateAdjustedTotal({ currentTotal: "1000.00", currentRate: "100.00", nextRate: "120.00", days: 10, type: "daily" })).toBe("1200.00");
    expect(calculateRateAdjustedTotal({ currentTotal: "1125.00", currentRate: "100.00", nextRate: "120.00", days: 10, type: "daily" })).toBe("1325.00");
  });

  it("يحسب السعر الشهري بوحدات ثلاثين يوماً", () => {
    expect(calculateRateAdjustedTotal({ currentTotal: "3000.00", currentRate: "1500.00", nextRate: "1800.00", days: 45, type: "monthly" })).toBe("3600.00");
  });
});
