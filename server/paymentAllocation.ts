import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { contracts, customers, financialPaymentAllocations, financialTransactions, officeLiabilities, payments, vehicles } from "../drizzle/schema";
import { calculateLateAmount } from "../shared/contractCalculation";
import { getDb } from "./db";
import { calculateFinancialPaymentAllocations } from "../shared/financialLedger";

export { FINANCIAL_ALLOCATION_ORDER as ALLOCATION_ORDER } from "../shared/financialLedger";
export type { FinancialAllocationType as PaymentAllocationType } from "../shared/financialLedger";
import type { FinancialAllocationType as PaymentAllocationType } from "../shared/financialLedger";

type BucketBalances = Record<PaymentAllocationType, number>;
const allocationLocks = new Map<number, Promise<void>>();

function fail(code: "BAD_REQUEST" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_SERVER_ERROR", message: string): never {
  throw new TRPCError({ code, message });
}

function money(value: string | number | null | undefined) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : 0;
}

function fixed(value: number) {
  return value.toFixed(2);
}

export function calculatePaymentAllocations(amount: string | number, balances: BucketBalances) {
  try {
    return calculateFinancialPaymentAllocations(amount, balances);
  } catch (error) {
    fail("BAD_REQUEST", error instanceof Error ? error.message : "تعذر توزيع الدفعة");
  }
}

async function withAllocationLock<T>(transactionId: number, operation: () => Promise<T>) {
  const previous = allocationLocks.get(transactionId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  allocationLocks.set(transactionId, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (allocationLocks.get(transactionId) === current) allocationLocks.delete(transactionId);
  }
}

export async function allocateApprovedPayment(transactionId: number, asOf = new Date()) {
  const db = await getDb();
  if (!db) fail("INTERNAL_SERVER_ERROR", "قاعدة البيانات غير متاحة");
  return withAllocationLock(transactionId, async () => {
    return db.transaction(async tx => {
    const transaction = (await tx.select().from(financialTransactions).where(eq(financialTransactions.id, transactionId)).limit(1))[0];
    if (!transaction) fail("NOT_FOUND", "المعاملة المالية غير موجودة");
    if (transaction.transactionType !== "payment") fail("BAD_REQUEST", "التوزيع متاح للدفعات فقط");
    if (transaction.approvalStatus !== "approved") fail("CONFLICT", "لا يمكن توزيع دفعة قبل اعتمادها");
    if (!Number.isFinite(Number(transaction.amount)) || Number(transaction.amount) <= 0) fail("BAD_REQUEST", "مبلغ الدفعة يجب أن يكون أكبر من صفر");
    const existing = await tx.select().from(financialPaymentAllocations).where(eq(financialPaymentAllocations.transactionId, transactionId));
    if (existing.length) fail("CONFLICT", "تم توزيع هذه المعاملة مسبقاً");
    if (!transaction.contractId) fail("BAD_REQUEST", "لا يمكن توزيع دفعة غير مرتبطة بعقد");
    const contract = (await tx.select().from(contracts).where(eq(contracts.id, transaction.contractId)).limit(1))[0];
    if (!contract) fail("BAD_REQUEST", "العقد المرتبط بالدفعة غير موجود");
    if (transaction.customerId !== undefined && transaction.customerId !== null && transaction.customerId !== contract.customerId) fail("BAD_REQUEST", "العميل لا يتوافق مع العقد");
    if (transaction.vehicleId !== undefined && transaction.vehicleId !== null && transaction.vehicleId !== contract.vehicleId) fail("BAD_REQUEST", "السيارة لا تتوافق مع العقد");
    if (transaction.sourceTable === "payments" && transaction.sourceId !== undefined && transaction.sourceId !== null) {
      const payment = (await tx.select().from(payments).where(eq(payments.id, transaction.sourceId)).limit(1))[0];
      if (!payment) fail("BAD_REQUEST", "الدفعة المصدر غير موجودة");
      if (payment.contractId !== contract.id) fail("BAD_REQUEST", "الدفعة المصدر لا تتوافق مع العقد");
      if (payment.customerId !== contract.customerId) fail("BAD_REQUEST", "الدفعة المصدر لا تتوافق مع العميل");
    }
    const customer = transaction.customerId ? (await tx.select({ id: customers.id }).from(customers).where(eq(customers.id, transaction.customerId)).limit(1))[0] : null;
    if (transaction.customerId && !customer) fail("BAD_REQUEST", "العميل غير موجود");
    const vehicle = transaction.vehicleId ? (await tx.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.id, transaction.vehicleId)).limit(1))[0] : null;
    if (transaction.vehicleId && !vehicle) fail("BAD_REQUEST", "السيارة غير موجودة");
    const linkedLiabilities = await tx.select().from(officeLiabilities).where(and(eq(officeLiabilities.contractNumber, contract.contractNumber), eq(officeLiabilities.approvalStatus, "approved")));

    const late = calculateLateAmount(contract.expectedReturnDate, contract.rentalAmount, contract.type, asOf);
    const balances: BucketBalances = {
      remaining_contract_balance: Math.max(0, Number(contract.totalAmount) - Number(contract.paidAmount)),
      current_late_charges: money(late.amount),
      excess_mileage: money(contract.excessMileageAmount),
      other_liability: linkedLiabilities.reduce((sum, liability) => sum + Math.max(0, Number(liability.amount) - Number(liability.paidAmount)), 0),
    };
    const rows = calculatePaymentAllocations(transaction.amount, balances);
    await tx.insert(financialPaymentAllocations).values(rows.map(row => ({ transactionId, paymentId: transaction.sourceTable === "payments" ? transaction.sourceId : null, contractId: transaction.contractId, allocationType: row.allocationType, priority: row.priority, amount: row.amount })));
    const persisted = await tx.select().from(financialPaymentAllocations).where(eq(financialPaymentAllocations.transactionId, transactionId));
    const persistedTotal = persisted.reduce((sum, row) => sum + Number(row.amount), 0);
    if (persisted.some(row => Number(row.amount) <= 0)) fail("INTERNAL_SERVER_ERROR", "تم حفظ allocation غير صالح");
    if (Math.abs(persistedTotal - Number(transaction.amount)) > 0.005) fail("INTERNAL_SERVER_ERROR", "فشل تحقق مجموع التوزيعات بعد الحفظ");
    const nextPaidAmount = Number(contract.paidAmount) + persistedTotal;
    await tx.update(contracts).set({ paidAmount: fixed(nextPaidAmount) }).where(eq(contracts.id, contract.id));
    if (transaction.sourceTable === "payments" && transaction.sourceId !== null && transaction.sourceId !== undefined) {
      await tx.update(payments).set({ approvalStatus: "approved", approvedBy: transaction.approvedBy, approvedAt: transaction.approvedAt }).where(eq(payments.id, transaction.sourceId));
    }
    const otherAllocation = persisted.find(row => row.allocationType === "other_liability");
    if (otherAllocation) {
      let remaining = Number(otherAllocation.amount);
      for (const liability of linkedLiabilities) {
        if (remaining <= 0) break;
        const liabilityOutstanding = Math.max(0, Number(liability.amount) - Number(liability.paidAmount));
        const applied = Math.min(remaining, liabilityOutstanding);
        if (applied > 0) {
          const nextPaid = Number(liability.paidAmount) + applied;
          await tx.update(officeLiabilities).set({ paidAmount: fixed(nextPaid), status: nextPaid >= Number(liability.amount) ? "paid" : "partially_paid" }).where(eq(officeLiabilities.id, liability.id));
          remaining = Math.round((remaining - applied) * 100) / 100;
        }
      }
    }
    return { transactionId, allocations: persisted, totalAllocated: fixed(persistedTotal), balances };
    });
  });
}
