import { describe, expect, it } from "vitest";
import { summarizeFinancialExpenses, validateFinancialExpenseInput } from "./financialExpenses";

describe("financial expense validation", () => {
  const base = { expenseType: "other" as const, amount: "100", description: "مصروف اختبار" };

  it("accepts all approved expense types", () => {
    for (const expenseType of ["parts", "labor", "external_workshop", "freon", "glass", "warranty", "other"] as const) {
      expect(() => validateFinancialExpenseInput({ ...base, expenseType, partType: expenseType === "parts" ? "فلتر" : undefined })).not.toThrow();
    }
  });

  it("rejects zero and negative amounts", () => {
    expect(() => validateFinancialExpenseInput({ ...base, amount: "0" })).toThrow();
    expect(() => validateFinancialExpenseInput({ ...base, amount: "-10" })).toThrow();
  });

  it("requires partType only for parts", () => {
    expect(() => validateFinancialExpenseInput({ ...base, expenseType: "parts" })).toThrow(/partType|القطعة/);
    expect(() => validateFinancialExpenseInput({ ...base, expenseType: "parts", partType: "زجاج" })).not.toThrow();
    expect(() => validateFinancialExpenseInput({ ...base, expenseType: "labor", partType: "غير مسموح" })).toThrow();
  });

  it("requires a description and accepts the approved payment methods", () => {
    expect(() => validateFinancialExpenseInput({ ...base, description: "   " })).toThrow();
    for (const paymentMethod of ["cash", "network", "transfer"] as const) {
      expect(() => validateFinancialExpenseInput({ ...base, paymentMethod })).not.toThrow();
    }
  });

  it("does not double-count an approved correction and reversal", () => {
    expect(summarizeFinancialExpenses([
      { id: 1, transactionType: "expense", approvalStatus: "approved", amount: "100", originalTransactionId: null, correctionOfTransactionId: null, reversalOfTransactionId: null },
      { id: 2, transactionType: "expense", approvalStatus: "approved", amount: "120", originalTransactionId: 1, correctionOfTransactionId: 1, reversalOfTransactionId: null },
      { id: 3, transactionType: "expense", approvalStatus: "approved", amount: "120", originalTransactionId: 1, correctionOfTransactionId: null, reversalOfTransactionId: 1 },
    ])).toEqual({ pending: "0.00", rejected: "0.00", approved: "0.00", legacyAccepted: "0.00" });
  });
});
