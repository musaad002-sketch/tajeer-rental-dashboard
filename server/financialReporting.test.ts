import { describe, expect, it } from "vitest";
import { buildFinancialReportingReadModel, summarizeEffectivePayments, summarizeFinancialReporting } from "./financialReporting";

const tx = (input: any) => input;

describe("financial reporting read layer", () => {
  it("includes approved revenues and excludes pending and rejected rows", () => {
    const summary = summarizeFinancialReporting([
      tx({ id: 1, transactionType: "revenue", approvalStatus: "approved", amount: "100", correctionOfTransactionId: null, reversalOfTransactionId: null }),
      tx({ id: 2, transactionType: "revenue", approvalStatus: "pending", amount: "50", correctionOfTransactionId: null, reversalOfTransactionId: null }),
      tx({ id: 3, transactionType: "revenue", approvalStatus: "rejected", amount: "25", correctionOfTransactionId: null, reversalOfTransactionId: null }),
    ]);
    expect(summary.revenue).toEqual({ approved: "100.00", pending: "50.00", rejected: "25.00", legacyAccepted: "0.00" });
  });

  it("keeps legacy_accepted visible without counting it as approved", () => {
    const summary = summarizeFinancialReporting([tx({ id: 1, transactionType: "expense", approvalStatus: "legacy_accepted", amount: "75", correctionOfTransactionId: null, reversalOfTransactionId: null })]);
    expect(summary.expense.approved).toBe("0.00");
    expect(summary.expense.legacyAccepted).toBe("75.00");
  });

  it("deduplicates transactions and does not read officeLiabilities as a second expense source", () => {
    const rows = [tx({ id: 7, transactionType: "expense", approvalStatus: "approved", amount: "80", sourceTable: "officeLiabilities", sourceId: 99, correctionOfTransactionId: null, reversalOfTransactionId: null }), tx({ id: 7, transactionType: "expense", approvalStatus: "approved", amount: "80", sourceTable: "officeLiabilities", sourceId: 99, correctionOfTransactionId: null, reversalOfTransactionId: null })];
    const model = buildFinancialReportingReadModel(rows, []);
    expect(model.summary.expense.approved).toBe("80.00");
  });

  it("preserves correction/reversal audit rows while preventing double counting", () => {
    const model = buildFinancialReportingReadModel([
      tx({ id: 1, transactionType: "revenue", approvalStatus: "approved", amount: "100", originalTransactionId: null, correctionOfTransactionId: null, reversalOfTransactionId: null }),
      tx({ id: 2, transactionType: "revenue", approvalStatus: "approved", amount: "120", originalTransactionId: 1, correctionOfTransactionId: 1, reversalOfTransactionId: null }),
      tx({ id: 3, transactionType: "revenue", approvalStatus: "approved", amount: "100", originalTransactionId: 1, correctionOfTransactionId: null, reversalOfTransactionId: 1 }),
    ]);
    expect(model.summary.revenue.approved).toBe("20.00");
    expect(model.transactions.map(row => row.id)).toEqual([2, 3]);
  });

  it("reads allocations without changing them and only includes allocations for approved payments", () => {
    const model = buildFinancialReportingReadModel([
      tx({ id: 10, transactionType: "payment", approvalStatus: "approved", amount: "100", correctionOfTransactionId: null, reversalOfTransactionId: null }),
      tx({ id: 11, transactionType: "payment", approvalStatus: "pending", amount: "40", correctionOfTransactionId: null, reversalOfTransactionId: null }),
    ], [
      { id: 1, transactionId: 10, paymentId: 5, contractId: 9, allocationType: "remaining_contract_balance", priority: 1, amount: "100" },
      { id: 2, transactionId: 11, paymentId: 6, contractId: 9, allocationType: "remaining_contract_balance", priority: 1, amount: "40" },
    ]);
    expect(model.summary.approvedAllocations).toEqual({ total: "100.00", count: 1 });
    expect(model.allocations).toHaveLength(1);
    expect(model.allocations[0].amount).toBe("100");
  });

  it("summarizes effective payments without double-counting corrections or reversals", () => {
    const totals = summarizeEffectivePayments([
      tx({ id: 10, transactionType: "payment", approvalStatus: "approved", amount: "100", transactionDate: new Date("2026-09-01"), correctionOfTransactionId: null, reversalOfTransactionId: null }),
      tx({ id: 11, transactionType: "payment", approvalStatus: "approved", amount: "120", transactionDate: new Date("2026-09-02"), correctionOfTransactionId: 10, reversalOfTransactionId: null }),
      tx({ id: 12, transactionType: "payment", approvalStatus: "approved", amount: "120", transactionDate: new Date("2026-09-03"), correctionOfTransactionId: null, reversalOfTransactionId: 10 }),
    ]);
    expect(totals).toEqual({ amount: 0, count: 2 });
  });
});
