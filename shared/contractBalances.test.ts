import { describe, expect, it } from "vitest";
import { calculateContractBalances } from "./contractBalances";

describe("calculateContractBalances", () => {
  it("يعامل الإيجار غير المسدد عند إنشاء العقد كرصد سابق", () => {
    expect(calculateContractBalances({ baseTotal: "2200", delayTotal: "0", paidAmount: "0" })).toEqual({
      previousOutstanding: "2200.00",
      currentOutstanding: "0.00",
      grandOutstanding: "2200.00",
    });
  });

  it("يضع رسوم التأخير في الرصيد الحالي بعد سداد الرصيد السابق أولاً", () => {
    expect(calculateContractBalances({ baseTotal: "100", delayTotal: "200", paidAmount: "100" })).toEqual({
      previousOutstanding: "0.00",
      currentOutstanding: "200.00",
      grandOutstanding: "200.00",
    });
  });

  it("يخصم أي سداد زائد عن الأساس من الرصيد الحالي", () => {
    expect(calculateContractBalances({ baseTotal: "100", delayTotal: "200", paidAmount: "175" })).toEqual({
      previousOutstanding: "0.00",
      currentOutstanding: "125.00",
      grandOutstanding: "125.00",
    });
  });
});

