import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { financialExpenseDetails, financialTransactions, officeLiabilities, users, vehicles } from "../drizzle/schema";
import { getDb } from "./db";
import { createFinancialExpense, correctFinancialExpense, decideFinancialExpense, getFinancialExpenseSummary, reverseFinancialExpense } from "./financialExpenses";

const suite = describe.skipIf(!process.env.DATABASE_URL);
suite("financial expenses MariaDB integration", () => {
  let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  let employeeId: number;
  let managerId: number;
  let vehicleId: number;
  const liabilityIds: number[] = [];
  const suffix = `${Date.now()}`;

  beforeAll(async () => {
    db = (await getDb())!;
    employeeId = Number((await db.insert(users).values({ openId: `expense-employee-${suffix}`, name: "Expense Employee", role: "user", isActive: true, lastSignedIn: new Date() }))[0]?.insertId);
    managerId = Number((await db.insert(users).values({ openId: `expense-manager-${suffix}`, name: "Expense Manager", role: "admin", isActive: true, lastSignedIn: new Date() }))[0]?.insertId);
    vehicleId = Number((await db.insert(vehicles).values({ plateNumber: `EXP-${suffix}`, make: "Test", model: "Expense", modelYear: 2026, dailyRate: "100", monthlyRate: "2500" }))[0]?.insertId);
  });

  afterAll(async () => {
    if (!db) return;
    if (liabilityIds.length) {
      await db.delete(financialExpenseDetails).where(inArray(financialExpenseDetails.liabilityId, liabilityIds));
      await db.delete(financialTransactions).where(and(eq(financialTransactions.sourceTable, "officeLiabilities"), inArray(financialTransactions.sourceId, liabilityIds)));
      await db.delete(officeLiabilities).where(inArray(officeLiabilities.id, liabilityIds));
    }
    await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    await db.delete(users).where(inArray(users.id, [employeeId, managerId]));
  });

  async function create(input: Parameters<typeof createFinancialExpense>[0]) {
    const result = await createFinancialExpense(input);
    liabilityIds.push(result.liabilityId);
    return result;
  }

  it("creates pending expense, rejects self approval, and approves through both ledgers", async () => {
    const created = await create({ expenseType: "parts", amount: "125", vehicleId, partType: "فلتر", paymentMethod: "cash", description: "صيانة اختبارية", createdBy: employeeId });
    expect(created.transaction.approvalStatus).toBe("pending");
    await expect(decideFinancialExpense(created.liabilityId, employeeId, "approved")).rejects.toMatchObject({ code: "FORBIDDEN" });
    const approved = await decideFinancialExpense(created.liabilityId, managerId, "approved");
    expect(approved.liability.approvalStatus).toBe("approved");
    expect(approved.transaction.approvalStatus).toBe("approved");
    expect(approved.transaction.approvedBy).toBe(managerId);
    await expect(decideFinancialExpense(created.liabilityId, managerId, "approved")).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects and excludes rejected expenses from approved totals", async () => {
    const created = await create({ expenseType: "labor", amount: "80", description: "مصروف مرفوض", createdBy: employeeId });
    await expect(decideFinancialExpense(created.liabilityId, managerId, "rejected")).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const rejected = await decideFinancialExpense(created.liabilityId, managerId, "rejected", "فاتورة غير معتمدة");
    expect(rejected.liability.rejectionReason).toBe("فاتورة غير معتمدة");
    const summary = await getFinancialExpenseSummary();
    expect(summary.rejected).toBe("80.00");
  });

  it("creates approved-only correction and reversal links without self-reference or duplicates", async () => {
    const original = await create({ expenseType: "other", amount: "40", description: "مصروف أصلي", createdBy: employeeId });
    await decideFinancialExpense(original.liabilityId, managerId, "approved");
    const correction = await correctFinancialExpense(original.liabilityId, { expenseType: "other", amount: "45", description: "تصحيح مصروف", createdBy: employeeId });
    liabilityIds.push(correction.liabilityId);
    const reversal = await reverseFinancialExpense(original.liabilityId, { expenseType: "other", amount: "40", description: "عكس مصروف", createdBy: employeeId });
    liabilityIds.push(reversal.liabilityId);
    expect(correction.transaction.originalTransactionId).toBe(original.transaction.id);
    expect(reversal.transaction.originalTransactionId).toBe(original.transaction.id);
    await expect(correctFinancialExpense(original.liabilityId, { expenseType: "other", amount: "45", description: "تصحيح مكرر", createdBy: employeeId })).rejects.toMatchObject({ code: "CONFLICT" });
    await decideFinancialExpense(correction.liabilityId, managerId, "approved");
    await decideFinancialExpense(reversal.liabilityId, managerId, "approved");
  });
});
