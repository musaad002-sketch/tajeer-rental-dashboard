import { and, eq, inArray } from "drizzle-orm";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { contracts, contractOperations, customers, financialPaymentAllocations, financialTransactions, payments, users, vehicles } from "../drizzle/schema";
import { getDb, recordContractOperation } from "./db";
import { approveFinancialTransaction, rejectFinancialTransaction } from "./financialTransactions";
import { allocateApprovedPayment } from "./paymentAllocation";

const suite = describe.skipIf(!process.env.DATABASE_URL);

suite("operations.record financial cutover", () => {
  let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  let employeeId: number;
  let managerId: number;
  let customerId: number;
  let vehicleId: number;
  const contractIds: number[] = [];
  const transactionIds: number[] = [];
  const paymentIds: number[] = [];
  const suffix = `${Date.now()}`;

  beforeAll(async () => {
    db = (await getDb())!;
    employeeId = Number((await db.insert(users).values({ openId: `cutover-employee-${suffix}`, name: "Cutover Employee", role: "user", isActive: true, lastSignedIn: new Date() }))[0]?.insertId);
    managerId = Number((await db.insert(users).values({ openId: `cutover-manager-${suffix}`, name: "Cutover Manager", role: "admin", isActive: true, lastSignedIn: new Date() }))[0]?.insertId);
    customerId = Number((await db.insert(customers).values({ identityNumber: `CUTOVER-${suffix}`, fullName: "Cutover Customer", phone: "0000000002" }))[0]?.insertId);
    vehicleId = Number((await db.insert(vehicles).values({ plateNumber: `CUTOVER-${suffix}`, make: "Test", model: "Cutover", modelYear: 2026, dailyRate: "100", monthlyRate: "2500" }))[0]?.insertId);
  });

  afterAll(async () => {
    if (!db) return;
    if (transactionIds.length) {
      await db.delete(financialPaymentAllocations).where(inArray(financialPaymentAllocations.transactionId, transactionIds));
      await db.delete(financialTransactions).where(inArray(financialTransactions.id, transactionIds));
    }
    if (paymentIds.length) await db.delete(payments).where(inArray(payments.id, paymentIds));
    if (contractIds.length) {
      await db.delete(contractOperations).where(inArray(contractOperations.contractId, contractIds));
      await db.delete(contracts).where(inArray(contracts.id, contractIds));
    }
    await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    await db.delete(customers).where(eq(customers.id, customerId));
    await db.delete(users).where(and(eq(users.id, employeeId)));
    await db.delete(users).where(and(eq(users.id, managerId)));
  });

  async function createContract(number: string) {
    const id = Number((await db.insert(contracts).values({ contractNumber: number, customerId, vehicleId, type: "daily", startDate: "2026-09-01", expectedReturnDate: "2099-09-10", rentalAmount: "100", days: 9, totalAmount: "900", paidAmount: "0" }))[0]?.insertId);
    contractIds.push(id);
    return id;
  }

  it("keeps a new operations.record payment pending until approval and allocation", async () => {
    const contractId = await createContract(`CUTOVER-P-${suffix}`);
    await recordContractOperation({ contractId, operation: "payment", amount: "100", paymentMethod: "cash", createdBy: employeeId });
    const payment = (await db.select().from(payments).where(eq(payments.contractId, contractId)).limit(1))[0];
    expect(payment.approvalStatus).toBe("pending");
    paymentIds.push(payment.id);
    const transaction = (await db.select().from(financialTransactions).where(and(eq(financialTransactions.sourceTable, "payments"), eq(financialTransactions.sourceId, payment.id))).limit(1))[0];
    expect(transaction).toBeTruthy();
    expect(transaction.approvalStatus).toBe("pending");
    transactionIds.push(transaction.id);
    expect((await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1))[0].paidAmount).toBe("0.00");

    await approveFinancialTransaction(transaction.id, managerId);
    await allocateApprovedPayment(transaction.id, new Date("2026-09-05T00:00:00Z"));
    expect((await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1))[0].paidAmount).toBe("100.00");
    expect((await db.select().from(payments).where(eq(payments.id, payment.id)).limit(1))[0].approvalStatus).toBe("approved");
  });

  it("rejects an operations.record payment without changing the operational balance", async () => {
    const contractId = await createContract(`CUTOVER-R-${suffix}`);
    await recordContractOperation({ contractId, operation: "payment", amount: "200", paymentMethod: "network", createdBy: employeeId });
    const payment = (await db.select().from(payments).where(eq(payments.contractId, contractId)).orderBy(payments.id).limit(1))[0];
    paymentIds.push(payment.id);
    const transaction = (await db.select().from(financialTransactions).where(and(eq(financialTransactions.sourceTable, "payments"), eq(financialTransactions.sourceId, payment.id))).limit(1))[0];
    transactionIds.push(transaction.id);
    await rejectFinancialTransaction(transaction.id, managerId, "مبلغ غير مطابق");
    expect((await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1))[0].paidAmount).toBe("0.00");
    expect((await db.select().from(payments).where(eq(payments.id, payment.id)).limit(1))[0].approvalStatus).toBe("rejected");
    expect((await db.select().from(financialTransactions).where(eq(financialTransactions.id, transaction.id)).limit(1))[0].rejectionReason).toBe("مبلغ غير مطابق");
  });
});
