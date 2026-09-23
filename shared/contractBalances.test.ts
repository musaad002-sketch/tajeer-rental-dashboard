import { describe, expect, it } from "vitest";
import { calculateContractBalances } from "./contractBalances";

describe("calculateContractBalances", () => {
  it("يعامل الإيجار غير المسدد عند إنشاء العقد كرصد سابق", () => {
    expect(calculateContractBalances({ baseTotal: "2200", delayTotal: "0", paidAmount: "0" })).toMatchObject({
      previousOutstanding: "2200.00",
      currentOutstanding: "0.00",
      grandOutstanding: "2200.00",
    });
  });

  it("does not count the original contract total twice after partial payments and delay", () => {
    expect(calculateContractBalances({ baseTotal: "900", delayTotal: "400", paidAmount: "650" })).toMatchObject({
      previousOutstanding: "250.00",
      currentOutstanding: "400.00",
      grandOutstanding: "650.00",
    });
  });

  it("يضع رسوم التأخير في الرصيد الحالي بعد سداد الرصيد السابق أولاً", () => {
    expect(calculateContractBalances({ baseTotal: "100", delayTotal: "200", paidAmount: "100" })).toMatchObject({
      previousOutstanding: "0.00",
      currentOutstanding: "200.00",
      grandOutstanding: "200.00",
    });
  });

  it("يخصم أي سداد زائد عن الأساس من الرصيد الحالي", () => {
    expect(calculateContractBalances({ baseTotal: "100", delayTotal: "200", paidAmount: "175" })).toMatchObject({
      previousOutstanding: "0.00",
      currentOutstanding: "125.00",
      grandOutstanding: "125.00",
    });
  });
});
