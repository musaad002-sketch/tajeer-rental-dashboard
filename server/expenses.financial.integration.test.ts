import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contracts, customers, financialPaymentAllocations, financialTransactions, officeLiabilities, users, vehicles } from "../drizzle/schema";
import { createOfficeLiability, getDb } from "./db";
import { approveFinancialTransaction, createFinancialTransaction, rejectFinancialTransaction } from "./financialTransactions";
import { allocateApprovedPayment } from "./paymentAllocation";

const suite = describe.skipIf(!process.env.DATABASE_URL);

suite("financial expenses and other liability", () => {
  let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  let employeeId: number;
  let managerId: number;
  let customerId: number;
  let vehicleId: number;
  let contractId: number;
  const liabilityIds: number[] = [];
  const transactionIds: number[] = [];
  const suffix = `${Date.now()}`;

  beforeAll(async () => {
    db = (await getDb())!;
    employeeId = Number((await db.insert(users).values({ openId: `expense-employee-${suffix}`, name: "Expense Employee", role: "user", isActive: true, lastSignedIn: new Date() }))[0]?.insertId);
    managerId = Number((await db.insert(users).values({ openId: `expense-manager-${suffix}`, name: "Expense Manager", role: "admin", isActive: true, lastSignedIn: new Date() }))[0]?.insertId);
    customerId = Number((await db.insert(customers).values({ identityNumber: `EXP-${suffix}`, fullName: "Expense Customer", phone: "0000000003" }))[0]?.insertId);
    vehicleId = Number((await db.insert(vehicles).values({ plateNumber: `EXP-${suffix}`, make: "Test", model: "Expense", modelYear: 2026, dailyRate: "100", monthlyRate: "2500" }))[0]?.insertId);
    contractId = Number((await db.insert(contracts).values({ contractNumber: `EXP-${suffix}`, customerId, vehicleId, type: "daily", startDate: "2026-09-01", expectedReturnDate: "2099-09-10", rentalAmount: "100", days: 9, totalAmount: "0", paidAmount: "0" }))[0]?.insertId);
  });

  afterAll(async () => {
    if (!db) return;
    if (transactionIds.length) {
      await db.delete(financialPaymentAllocations).where(inArray(financialPaymentAllocations.transactionId, transactionIds));
      await db.delete(financialTransactions).where(inArray(financialTransactions.id, transactionIds));
    }
    if (liabilityIds.length) await db.delete(officeLiabilities).where(inArray(officeLiabilities.id, liabilityIds));
    await db.delete(contracts).where(eq(contracts.id, contractId));
    await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    await db.delete(customers).where(eq(customers.id, customerId));
    await db.delete(users).where(and(eq(users.id, employeeId)));
    await db.delete(users).where(and(eq(users.id, managerId)));
  });

  it("creates a pending expense transaction and keeps rejected expenses out", async () => {
    const pendingResult = await createOfficeLiability({ category: "parts", description: "Pending parts", amount: "120", createdBy: employeeId });
    const pendingId = Number(pendingResult[0]?.insertId);
    liabilityIds.push(pendingId);
    const pendingTx = (await db.select().from(financialTransactions).where(and(eq(financialTransactions.sourceTable, "officeLiabilities"), eq(financialTransactions.sourceId, pendingId))).limit(1))[0];
    expect(pendingTx.approvalStatus).toBe("pending");
    transactionIds.push(pendingTx.id);
    await rejectFinancialTransaction(pendingTx.id, managerId, "فاتورة غير معتمدة");
    expect((await db.select().from(officeLiabilities).where(eq(officeLiabilities.id, pendingId)).limit(1))[0].approvalStatus).toBe("rejected");
    expect((await db.select().from(financialTransactions).where(eq(financialTransactions.id, pendingTx.id)).limit(1))[0].approvalStatus).toBe("rejected");
  });

  it("approves an expense once and prevents a duplicate source transaction", async () => {
    const result = await createOfficeLiability({ category: "glass", description: "Approved glass", amount: "100", contractNumber: `EXP-${suffix}`, expenseReason: "Contract damage", createdBy: employeeId });
    const liabilityId = Number(result[0]?.insertId);
    liabilityIds.push(liabilityId);
    const tx = (await db.select().from(financialTransactions).where(and(eq(financialTransactions.sourceTable, "officeLiabilities"), eq(financialTransactions.sourceId, liabilityId))).limit(1))[0];
    transactionIds.push(tx.id);
    await expect(createFinancialTransaction({ transactionType: "expense", amount: "100", liabilityId, createdBy: employeeId })).rejects.toMatchObject({ code: "CONFLICT" });
    await approveFinancialTransaction(tx.id, managerId);
    expect((await db.select().from(officeLiabilities).where(eq(officeLiabilities.id, liabilityId)).limit(1))[0].approvalStatus).toBe("approved");
  });

  it("allocates to other_liability only after earlier buckets are empty", async () => {
    const tx = await createFinancialTransaction({ transactionType: "payment", amount: "100", contractId, customerId, vehicleId, createdBy: employeeId });
    transactionIds.push(tx.id);
    await approveFinancialTransaction(tx.id, managerId);
    const result = await allocateApprovedPayment(tx.id, new Date("2026-09-05T00:00:00Z"));
    expect(result.allocations.map(row => row.allocationType)).toEqual(["other_liability"]);
    expect(result.totalAllocated).toBe("100.00");
    const liability = (await db.select().from(officeLiabilities).where(eq(officeLiabilities.contractNumber, `EXP-${suffix}`)).limit(1))[0];
    expect(liability.paidAmount).toBe("100.00");
    expect(liability.status).toBe("paid");
  });
});
