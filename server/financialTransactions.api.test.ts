import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

const { service } = vi.hoisted(() => ({
  service: {
    createFinancialTransaction: vi.fn(async (input: any) => ({ id: 101, transactionType: input.transactionType, approvalStatus: "pending", amount: input.amount, createdBy: input.createdBy })),
    approveFinancialTransaction: vi.fn(async (id: number, managerId: number) => ({ id, approvalStatus: "approved", approvedBy: managerId, approvedAt: new Date() })),
    rejectFinancialTransaction: vi.fn(async (id: number, managerId: number, rejectionReason: string) => ({ id, approvalStatus: "rejected", approvedBy: managerId, rejectionReason, approvedAt: new Date() })),
    correctFinancialTransaction: vi.fn(async (id: number, input: any) => ({ id: 102, correctionOfTransactionId: id, approvalStatus: "pending", createdBy: input.createdBy, description: input.reason })),
    reverseFinancialTransaction: vi.fn(async (id: number, input: any) => ({ id: 103, reversalOfTransactionId: id, approvalStatus: "pending", createdBy: input.createdBy, description: input.reason })),
    getFinancialTransaction: vi.fn(async (id: number) => id === 999 ? null : ({ id, approvalStatus: "pending" })),
    listFinancialTransactions: vi.fn(async () => []),
  },
}));

vi.mock("./financialTransactions", () => service);

const userContext = (id = 7): TrpcContext => ({
  user: { id, openId: `user-${id}`, name: "موظف", email: null, loginMethod: "local", role: "user", isActive: true, permissions: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
  req: { protocol: "http", headers: {} },
  res: {},
} as TrpcContext);

const managerContext = (id = 9): TrpcContext => ({
  user: { id, openId: `manager-${id}`, name: "مدير", email: null, loginMethod: "local", role: "admin", isActive: true, permissions: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
  req: { protocol: "http", headers: {} },
  res: {},
} as TrpcContext);

describe("financialTransactions API", () => {
  it("creates a pending transaction and does not accept a client-supplied status", async () => {
    service.createFinancialTransaction.mockClear();
    const result = await appRouter.createCaller(userContext()).financialTransactions.create({ transactionType: "payment", amount: "300", paymentMethod: "cash", approvalStatus: "approved" } as any);
    expect(result).toEqual(expect.objectContaining({ approvalStatus: "pending" }));
    expect(service.createFinancialTransaction).toHaveBeenCalledWith(expect.objectContaining({ transactionType: "payment", amount: "300", createdBy: 7 }),);
    expect(service.createFinancialTransaction.mock.calls[0][0]).not.toHaveProperty("approvalStatus");
  });

  it("requires an explicit payment method for payment transactions", async () => {
    service.createFinancialTransaction.mockClear();
    await expect(appRouter.createCaller(userContext()).financialTransactions.create({ transactionType: "payment", amount: "300" })).rejects.toBeTruthy();
    expect(service.createFinancialTransaction).not.toHaveBeenCalled();
  });

  it("prevents an employee from approving any transaction", async () => {
    await expect(appRouter.createCaller(userContext()).financialTransactions.approve({ id: 101 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(service.approveFinancialTransaction).not.toHaveBeenCalled();
  });

  it("allows the current manager to approve and records the manager identity", async () => {
    service.approveFinancialTransaction.mockClear();
    const result = await appRouter.createCaller(managerContext(12)).financialTransactions.approve({ id: 101 });
    expect(result).toEqual(expect.objectContaining({ approvalStatus: "approved", approvedBy: 12 }));
    expect(service.approveFinancialTransaction).toHaveBeenCalledWith(101, 12);
  });

  it("requires a non-empty rejection reason and preserves it", async () => {
    await expect(appRouter.createCaller(managerContext()).financialTransactions.reject({ id: 101, rejectionReason: "" })).rejects.toBeTruthy();
    service.rejectFinancialTransaction.mockClear();
    const result = await appRouter.createCaller(managerContext(12)).financialTransactions.reject({ id: 101, rejectionReason: "تصحيح مبلغ الحركة" });
    expect(result).toEqual(expect.objectContaining({ approvalStatus: "rejected", approvedBy: 12, rejectionReason: "تصحيح مبلغ الحركة" }));
  });

  it("passes nonexistent and duplicate decision failures through the server API", async () => {
    service.approveFinancialTransaction.mockRejectedValueOnce(new Error("الحركة المالية غير موجودة"));
    await expect(appRouter.createCaller(managerContext()).financialTransactions.approve({ id: 999 })).rejects.toThrow("الحركة المالية غير موجودة");
    service.approveFinancialTransaction.mockRejectedValueOnce(new Error("تم اتخاذ قرار الاعتماد مسبقاً"));
    await expect(appRouter.createCaller(managerContext()).financialTransactions.approve({ id: 101 })).rejects.toThrow("تم اتخاذ قرار الاعتماد مسبقاً");
  });

  it("creates immutable correction and reversal links with reasons", async () => {
    service.correctFinancialTransaction.mockClear();
    service.reverseFinancialTransaction.mockClear();
    const caller = appRouter.createCaller(userContext(7));
    const correction = await caller.financialTransactions.correct({ id: 101, transactionType: "payment", amount: "280", reason: "تصحيح المبلغ" });
    const reversal = await caller.financialTransactions.reverse({ id: 101, transactionType: "payment", amount: "300", reason: "إلغاء الحركة" });
    expect(correction).toEqual(expect.objectContaining({ correctionOfTransactionId: 101, approvalStatus: "pending" }));
    expect(reversal).toEqual(expect.objectContaining({ reversalOfTransactionId: 101, approvalStatus: "pending" }));
    expect(service.correctFinancialTransaction).toHaveBeenCalledWith(101, expect.objectContaining({ reason: "تصحيح المبلغ", createdBy: 7 }));
    expect(service.reverseFinancialTransaction).toHaveBeenCalledWith(101, expect.objectContaining({ reason: "إلغاء الحركة", createdBy: 7 }));
  });
});
