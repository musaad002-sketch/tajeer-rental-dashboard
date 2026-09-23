import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { contracts, customers, financialPaymentAllocations, financialTransactions, users, vehicles } from "../drizzle/schema";
import { getDb } from "./db";
import { approveFinancialTransaction, createFinancialTransaction } from "./financialTransactions";
import { allocateApprovedPayment } from "./paymentAllocation";

const suite = describe.skipIf(!process.env.DATABASE_URL);

suite("payment allocation MariaDB integration", () => {
  let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  let employeeId: number;
  let managerId: number;
  let customerId: number;
  let vehicleId: number;
  let contractId: number;
  const transactionIds: number[] = [];
  const suffix = `${Date.now()}`;

  beforeAll(async () => {
    db = (await getDb())!;
    employeeId = Number((await db.insert(users).values({ openId: `allocation-employee-${suffix}`, name: "Allocation Employee", role: "user", isActive: true, lastSignedIn: new Date() }))[0]?.insertId);
    managerId = Number((await db.insert(users).values({ openId: `allocation-manager-${suffix}`, name: "Allocation Manager", role: "admin", isActive: true, lastSignedIn: new Date() }))[0]?.insertId);
    customerId = Number((await db.insert(customers).values({ identityNumber: `ALLOC-${suffix}`, fullName: "Allocation Customer", phone: "0000000001" }))[0]?.insertId);
    vehicleId = Number((await db.insert(vehicles).values({ plateNumber: `ALLOC-${suffix}`, make: "Test", model: "Allocation", modelYear: 2026, dailyRate: "100", monthlyRate: "2500" }))[0]?.insertId);
    contractId = Number((await db.insert(contracts).values({ contractNumber: `ALLOC-${suffix}`, customerId, vehicleId, type: "daily", startDate: "2026-09-01", expectedReturnDate: "2026-09-10", rentalAmount: "100", days: 9, totalAmount: "900", paidAmount: "650", excessMileageAmount: "0" }))[0]?.insertId);
  });

  afterAll(async () => {
    if (!db) return;
    if (transactionIds.length) {
      await db.delete(financialPaymentAllocations).where(eq(financialPaymentAllocations.transactionId, transactionIds[0]));
      for (const id of transactionIds) await db.delete(financialPaymentAllocations).where(eq(financialPaymentAllocations.transactionId, id));
      for (const id of transactionIds) await db.delete(financialTransactions).where(eq(financialTransactions.id, id));
    }
    await db.delete(contracts).where(eq(contracts.id, contractId));
    await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    await db.delete(customers).where(eq(customers.id, customerId));
    await db.delete(users).where(and(eq(users.id, employeeId)));
    await db.delete(users).where(and(eq(users.id, managerId)));
  });

  async function approved(amount: string) {
    const created = await createFinancialTransaction({ transactionType: "payment", amount, contractId, customerId, vehicleId, createdBy: employeeId });
    transactionIds.push(created.id);
    return approveFinancialTransaction(created.id, managerId);
  }

  it("rejects before approval, then allocates the official 650 payment as 250 + 400", async () => {
    const created = await createFinancialTransaction({ transactionType: "payment", amount: "650", contractId, customerId, vehicleId, createdBy: employeeId });
    transactionIds.push(created.id);
    await expect(allocateApprovedPayment(created.id, new Date("2026-09-14T00:00:00Z"))).rejects.toMatchObject({ code: "CONFLICT" });
    await approveFinancialTransaction(created.id, managerId);
    const result = await allocateApprovedPayment(created.id, new Date("2026-09-14T00:00:00Z"));
    expect(result.allocations.map(row => [row.allocationType, row.amount])).toEqual([
      ["remaining_contract_balance", "250.00"],
      ["current_late_charges", "400.00"],
    ]);
    expect(result.totalAllocated).toBe("650.00");
    expect(result.balances.remaining_contract_balance).toBe(250);
    expect(result.balances.current_late_charges).toBe(400);
  });

  it("rejects a second allocation and protects concurrent requests", async () => {
    const approvedTransaction = await approved("100");
    const first = allocateApprovedPayment(approvedTransaction.id, new Date("2026-09-14T00:00:00Z"));
    const second = allocateApprovedPayment(approvedTransaction.id, new Date("2026-09-14T00:00:00Z"));
    const results = await Promise.allSettled([first, second]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
  });

  it("rejects a payment that cannot be fully allocated and never stores partial rows", async () => {
    const approvedTransaction = await approved("651");
    await expect(allocateApprovedPayment(approvedTransaction.id, new Date("2026-09-14T00:00:00Z"))).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const rows = await db.select().from(financialPaymentAllocations).where(eq(financialPaymentAllocations.transactionId, approvedTransaction.id));
    expect(rows).toHaveLength(0);
  });

  it("rolls back allocations when a later contract update fails", async () => {
    const approvedTransaction = await approved("100");
    const beforeContract = (await db.select({ paidAmount: contracts.paidAmount }).from(contracts).where(eq(contracts.id, contractId)).limit(1))[0];
    const triggerName = `test_atomicity_${suffix}`;
    await db.execute(sql.raw(`CREATE TRIGGER \`${triggerName}\` BEFORE UPDATE ON contracts FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'TEST atomicity forced failure'`));
    try {
      await expect(allocateApprovedPayment(approvedTransaction.id, new Date("2026-09-14T00:00:00Z"))).rejects.toThrow("Failed query");
      const allocations = await db.select().from(financialPaymentAllocations).where(eq(financialPaymentAllocations.transactionId, approvedTransaction.id));
      const contract = (await db.select({ paidAmount: contracts.paidAmount }).from(contracts).where(eq(contracts.id, contractId)).limit(1))[0];
      expect(allocations).toHaveLength(0);
      expect(contract?.paidAmount).toBe(beforeContract?.paidAmount);
    } finally {
      await db.execute(sql.raw(`DROP TRIGGER IF EXISTS \`${triggerName}\``));
    }
  });
});
