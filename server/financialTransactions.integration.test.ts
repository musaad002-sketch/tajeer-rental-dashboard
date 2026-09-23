import { and, eq } from "drizzle-orm";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import {
  contracts,
  customers,
  financialTransactions,
  payments,
  users,
  vehicles,
} from "../drizzle/schema";
import { getDb } from "./db";
import {
  approveFinancialTransaction,
  createFinancialTransaction,
  correctFinancialTransaction,
  rejectFinancialTransaction,
  reverseFinancialTransaction,
} from "./financialTransactions";

const run = Boolean(process.env.DATABASE_URL);
const suite = describe.skipIf(!run);

suite("financial transaction core MariaDB integration", () => {
  let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  let employeeId: number;
  let managerId: number;
  let customerId: number;
  let vehicleId: number;
  let contractId: number;
  let paymentId: number;
  const suffix = `${Date.now()}`;

  beforeAll(async () => {
    db = (await getDb())!;
    const employee = await db.insert(users).values({ openId: `phase3b-employee-${suffix}`, name: "Phase 3B Employee", role: "user", isActive: true, lastSignedIn: new Date() });
    employeeId = Number(employee[0]?.insertId);
    const manager = await db.insert(users).values({ openId: `phase3b-manager-${suffix}`, name: "Phase 3B Manager", role: "admin", isActive: true, lastSignedIn: new Date() });
    managerId = Number(manager[0]?.insertId);
    const customer = await db.insert(customers).values({ identityNumber: `PHASE3B-${suffix}`, fullName: "Phase 3B Customer", phone: "0000000000" });
    customerId = Number(customer[0]?.insertId);
    const vehicle = await db.insert(vehicles).values({ plateNumber: `P3B-${suffix}`, make: "Test", model: "Core", modelYear: 2026, dailyRate: "100", monthlyRate: "2500" });
    vehicleId = Number(vehicle[0]?.insertId);
    const contract = await db.insert(contracts).values({ contractNumber: `P3B-${suffix}`, customerId, vehicleId, type: "daily", startDate: "2026-09-14", expectedReturnDate: "2026-09-20", rentalAmount: "900", days: 6, totalAmount: "900" });
    contractId = Number(contract[0]?.insertId);
    const payment = await db.insert(payments).values({ contractId, customerId, amount: "300", method: "cash", notes: "Phase 3B integration payment" });
    paymentId = Number(payment[0]?.insertId);
  });

  afterAll(async () => {
    if (!db) return;
    await db.delete(financialTransactions).where(eq(financialTransactions.createdBy, employeeId));
    await db.delete(financialTransactions).where(eq(financialTransactions.createdBy, managerId));
    await db.delete(payments).where(eq(payments.id, paymentId));
    await db.delete(contracts).where(eq(contracts.id, contractId));
    await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    await db.delete(customers).where(eq(customers.id, customerId));
    await db.delete(users).where(and(eq(users.id, employeeId)));
    await db.delete(users).where(and(eq(users.id, managerId)));
  });

  it("creates pending, rejects self-approval, approves once, rejects duplicate decisions, and preserves audit fields", async () => {
    const pending = await createFinancialTransaction({ transactionType: "payment", amount: "300", paymentMethod: "cash", contractId, customerId, vehicleId, createdBy: employeeId });
    expect(pending.approvalStatus).toBe("pending");
    expect(pending.approvedBy).toBeNull();
    await expect(approveFinancialTransaction(pending.id, employeeId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const approved = await approveFinancialTransaction(pending.id, managerId);
    expect(approved.approvalStatus).toBe("approved");
    expect(approved.approvedBy).toBe(managerId);
    expect(approved.approvedAt).toBeInstanceOf(Date);
    await expect(approveFinancialTransaction(pending.id, managerId)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(rejectFinancialTransaction(pending.id, managerId, "محاولة قرار ثانٍ")).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects missing references, missing rejection reasons, and mismatched contract links", async () => {
    await expect(createFinancialTransaction({ transactionType: "payment", amount: "10", paymentId: 999999, createdBy: employeeId })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(createFinancialTransaction({ transactionType: "payment", amount: "10", contractId: 999999, createdBy: employeeId })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(createFinancialTransaction({ transactionType: "payment", amount: "10", contractId, customerId: customerId + 1, createdBy: employeeId })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const pending = await createFinancialTransaction({ transactionType: "payment", amount: "10", createdBy: employeeId, description: "rejection reason test" });
    await expect(rejectFinancialTransaction(pending.id, managerId, " ")).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const rejected = await rejectFinancialTransaction(pending.id, managerId, "سبب اختبار الرفض");
    expect(rejected.approvalStatus).toBe("rejected");
    expect(rejected.rejectionReason).toBe("سبب اختبار الرفض");
    expect(rejected.approvedBy).toBe(managerId);
  });

  it("keeps originals and links corrections and reversals", async () => {
    const original = await createFinancialTransaction({ transactionType: "payment", amount: "40", createdBy: employeeId, description: "original" });
    await expect(correctFinancialTransaction(original.id, { transactionType: "payment", amount: "45", reason: "تصحيح قبل الاعتماد", createdBy: employeeId })).rejects.toMatchObject({ code: "CONFLICT" });
    await approveFinancialTransaction(original.id, managerId);
    const correction = await correctFinancialTransaction(original.id, { transactionType: "payment", amount: "45", reason: "تصحيح المبلغ", createdBy: employeeId });
    const reversal = await reverseFinancialTransaction(original.id, { transactionType: "payment", amount: "40", reason: "عكس الحركة", createdBy: employeeId });
    expect(correction.correctionOfTransactionId).toBe(original.id);
    expect(reversal.reversalOfTransactionId).toBe(original.id);
    expect(correction.originalTransactionId).toBe(original.id);
    expect(reversal.originalTransactionId).toBe(original.id);
    await expect(correctFinancialTransaction(original.id, { transactionType: "payment", amount: "45", reason: "تصحيح مكرر", createdBy: employeeId })).rejects.toMatchObject({ code: "CONFLICT" });
    const stored = (await db.select().from(financialTransactions).where(eq(financialTransactions.id, original.id)).limit(1))[0];
    expect(stored).toEqual(expect.objectContaining({ id: original.id, description: "original", approvalStatus: "approved" }));
  });

  it("preserves legacy payment classification without auto-creating a financial transaction and serializes duplicate source creation", async () => {
    const legacyPayment = (await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1))[0];
    expect(legacyPayment.approvalStatus).toBe("legacy_accepted");
    const before = await db.select().from(financialTransactions).where(and(eq(financialTransactions.sourceTable, "payments"), eq(financialTransactions.sourceId, paymentId)));
    expect(before).toHaveLength(0);
    const attempts = await Promise.allSettled([
      createFinancialTransaction({ transactionType: "payment", amount: "300", paymentId, contractId, customerId, createdBy: employeeId }),
      createFinancialTransaction({ transactionType: "payment", amount: "300", paymentId, contractId, customerId, createdBy: employeeId }),
    ]);
    expect(attempts.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter(result => result.status === "rejected")).toHaveLength(1);
  });
});
