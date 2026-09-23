import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { summarizeFinancialRevenues, validateFinancialRevenueInput } from "./financialRevenues";

const { service } = vi.hoisted(() => ({
  service: {
    createFinancialRevenue: vi.fn(async (input: any) => ({ id: 201, transactionType: "revenue", revenueType: input.revenueType, amount: input.amount, approvalStatus: "pending", createdBy: input.createdBy })),
    approveFinancialRevenue: vi.fn(async (id: number, managerId: number) => ({ id, transactionType: "revenue", approvalStatus: "approved", approvedBy: managerId })),
    rejectFinancialRevenue: vi.fn(async (id: number, managerId: number, reason: string) => ({ id, transactionType: "revenue", approvalStatus: "rejected", approvedBy: managerId, rejectionReason: reason })),
    correctFinancialRevenue: vi.fn(async (id: number, input: any) => ({ id: 202, transactionType: "revenue", revenueType: input.revenueType, originalTransactionId: id, correctionOfTransactionId: id, approvalStatus: "pending" })),
    reverseFinancialRevenue: vi.fn(async (id: number, input: any) => ({ id: 203, transactionType: "revenue", revenueType: input.revenueType, originalTransactionId: id, reversalOfTransactionId: id, approvalStatus: "pending" })),
    listFinancialRevenues: vi.fn(async () => []),
    getFinancialRevenueSummary: vi.fn(async () => ({ pending: "0.00", rejected: "0.00", approved: "0.00", legacyAccepted: "0.00" })),
  },
}));
vi.mock("./financialRevenues", async importOriginal => ({ ...(await importOriginal<typeof import("./financialRevenues")>()), ...service }));

const context = (id: number, role: "user" | "admin"): TrpcContext => ({
  user: { id, openId: `revenue-${id}`, name: role === "admin" ? "مدير" : "موظف", email: null, loginMethod: "local", role, isActive: true, permissions: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
  req: { protocol: "http", headers: {} },
  res: {},
} as TrpcContext);

describe("financial revenue validation", () => {
  const base = { revenueType: "other" as const, amount: "100", description: "إيراد اختبار" };
  it("accepts the approved revenue types and rejects invalid amounts", () => {
    for (const revenueType of ["rental", "insurance_deductible", "other"] as const) expect(() => validateFinancialRevenueInput({ ...base, revenueType })).not.toThrow();
    expect(() => validateFinancialRevenueInput({ ...base, revenueType: "accident_compensation", evidenceReference: "مطالبة-123" })).not.toThrow();
    expect(() => validateFinancialRevenueInput({ ...base, amount: "0" })).toThrow();
    expect(() => validateFinancialRevenueInput({ ...base, amount: "-1" })).toThrow();
  });
  it("requires explicit evidence for accident compensation", () => {
    expect(() => validateFinancialRevenueInput({ ...base, revenueType: "accident_compensation" })).toThrow(/مرجع/);
  });
  it("counts only revenue rows once and excludes pending/rejected from approved totals", () => {
    expect(summarizeFinancialRevenues([
      { id: 1, transactionType: "revenue", approvalStatus: "pending", amount: "40" },
      { id: 2, transactionType: "revenue", approvalStatus: "rejected", amount: "20" },
      { id: 3, transactionType: "revenue", approvalStatus: "approved", amount: "100" },
      { id: 3, transactionType: "revenue", approvalStatus: "approved", amount: "100" },
      { id: 4, transactionType: "payment", approvalStatus: "approved", amount: "999" },
    ])).toEqual({ pending: "40.00", rejected: "20.00", approved: "100.00", legacyAccepted: "0.00" });
  });
  it("does not double-count an approved correction and reversal", () => {
    expect(summarizeFinancialRevenues([
      { id: 1, transactionType: "revenue", approvalStatus: "approved", amount: "100", originalTransactionId: null, correctionOfTransactionId: null, reversalOfTransactionId: null },
      { id: 2, transactionType: "revenue", approvalStatus: "approved", amount: "120", originalTransactionId: 1, correctionOfTransactionId: 1, reversalOfTransactionId: null },
      { id: 3, transactionType: "revenue", approvalStatus: "approved", amount: "120", originalTransactionId: 1, correctionOfTransactionId: null, reversalOfTransactionId: 1 },
    ])).toEqual({ pending: "0.00", rejected: "0.00", approved: "0.00", legacyAccepted: "0.00" });
  });
});

describe("financial revenues API", () => {
  it("creates pending revenue and routes correction/reversal", async () => {
    const caller = appRouter.createCaller(context(7, "user"));
    const created = await caller.financialRevenues.create({ revenueType: "rental", amount: "300", description: "إيجار إضافي" });
    expect(created).toEqual(expect.objectContaining({ approvalStatus: "pending", revenueType: "rental" }));
    expect(service.createFinancialRevenue).toHaveBeenCalledWith(expect.objectContaining({ revenueType: "rental", createdBy: 7 }));
    const correction = await caller.financialRevenues.correct({ id: 201, revenueType: "rental", amount: "280", description: "تصحيح الإيراد" });
    const reversal = await caller.financialRevenues.reverse({ id: 201, revenueType: "rental", amount: "300", description: "عكس الإيراد" });
    expect(correction).toEqual(expect.objectContaining({ originalTransactionId: 201, approvalStatus: "pending" }));
    expect(reversal).toEqual(expect.objectContaining({ originalTransactionId: 201, approvalStatus: "pending" }));
  });

  it("allows only the manager to decide, requires rejection reason, and preserves it", async () => {
    const employee = appRouter.createCaller(context(7, "user"));
    await expect(employee.financialRevenues.approve({ id: 201 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const manager = appRouter.createCaller(context(9, "admin"));
    const approved = await manager.financialRevenues.approve({ id: 201 });
    expect(approved).toEqual(expect.objectContaining({ approvalStatus: "approved", approvedBy: 9 }));
    await expect(manager.financialRevenues.reject({ id: 201, rejectionReason: "" })).rejects.toBeTruthy();
    const rejected = await manager.financialRevenues.reject({ id: 201, rejectionReason: "تصحيح مصدر الإيراد" });
    expect(rejected).toEqual(expect.objectContaining({ approvalStatus: "rejected", rejectionReason: "تصحيح مصدر الإيراد" }));
  });
});
