import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  financialExpenseDetails,
  financialTransactions,
  officeLiabilities,
  users,
  vehicles,
  type FinancialTransaction,
} from "../drizzle/schema";
import { getDb } from "./db";
import { summarizeEffectiveStatusTotals } from "./financialReporting";

export const FINANCIAL_EXPENSE_TYPES = ["parts", "labor", "external_workshop", "freon", "glass", "warranty", "other"] as const;
export type FinancialExpenseType = (typeof FINANCIAL_EXPENSE_TYPES)[number];
export const FINANCIAL_EXPENSE_PAYMENT_METHODS = ["cash", "network", "transfer"] as const;
export type FinancialExpensePaymentMethod = (typeof FINANCIAL_EXPENSE_PAYMENT_METHODS)[number];

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type ExpenseInput = {
  expenseType: FinancialExpenseType;
  amount: string;
  vehicleId?: number;
  partType?: string;
  paymentMethod?: FinancialExpensePaymentMethod;
  description: string;
};

const expenseLocks = new Map<string, Promise<void>>();

function fail(code: "BAD_REQUEST" | "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "INTERNAL_SERVER_ERROR", message: string): never {
  throw new TRPCError({ code, message });
}

function positiveAmount(amount: string) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) fail("BAD_REQUEST", "يجب أن يكون مبلغ المصروف أكبر من صفر");
  return amount;
}

export function validateFinancialExpenseInput(input: ExpenseInput) {
  positiveAmount(input.amount);
  if (!FINANCIAL_EXPENSE_TYPES.includes(input.expenseType)) fail("BAD_REQUEST", "نوع المصروف غير معتمد");
  if (!input.description.trim()) fail("BAD_REQUEST", "وصف المصروف مطلوب");
  if (input.expenseType === "parts" && !input.partType?.trim()) fail("BAD_REQUEST", "نوع القطعة مطلوب لمصروف parts");
  if (input.expenseType !== "parts" && input.partType?.trim()) fail("BAD_REQUEST", "partType مسموح فقط لمصروف parts");
}

async function withExpenseLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = expenseLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  expenseLocks.set(key, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (expenseLocks.get(key) === current) expenseLocks.delete(key);
  }
}

async function findLiability(db: Database, id: number) {
  return (await db.select().from(officeLiabilities).where(eq(officeLiabilities.id, id)).limit(1))[0] ?? null;
}

async function findExpenseTransaction(db: Database, liabilityId: number) {
  return (await db.select().from(financialTransactions).where(and(eq(financialTransactions.sourceTable, "officeLiabilities"), eq(financialTransactions.sourceId, liabilityId))).limit(1))[0] ?? null;
}

async function assertVehicle(db: Database, vehicleId?: number) {
  if (vehicleId === undefined) return;
  const vehicle = (await db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.id, vehicleId)).limit(1))[0];
  if (!vehicle) fail("BAD_REQUEST", "السيارة غير موجودة");
}

async function assertManager(db: Database, createdBy: number | null, managerId: number) {
  if (createdBy === managerId) fail("FORBIDDEN", "لا يمكن لمنشئ المصروف اعتماده أو رفضه");
  const manager = (await db.select({ id: users.id, role: users.role, isActive: users.isActive }).from(users).where(eq(users.id, managerId)).limit(1))[0];
  if (!manager || !manager.isActive || manager.role !== "admin") fail("FORBIDDEN", "اعتماد المصروفات متاح للمدير فقط");
}

export async function createFinancialExpense(input: ExpenseInput & { createdBy: number }): Promise<{ liabilityId: number; detail: typeof financialExpenseDetails.$inferSelect; transaction: FinancialTransaction }> {
  validateFinancialExpenseInput(input);
  const db = await getDb();
  if (!db) fail("INTERNAL_SERVER_ERROR", "قاعدة البيانات غير متاحة");
  await assertVehicle(db, input.vehicleId);
  const lockKey = `new:${input.createdBy}:${input.expenseType}:${input.amount}:${input.description.trim()}`;
  return withExpenseLock(lockKey, async () => {
    return db.transaction(async tx => {
      const liabilityResult = await tx.insert(officeLiabilities).values({
        category: "financial_expense",
        description: input.description.trim(),
        amount: positiveAmount(input.amount),
        paidAmount: "0",
        vehicleId: input.vehicleId ?? null,
        paymentMethod: input.paymentMethod ?? null,
        approvalStatus: "pending",
        createdBy: input.createdBy,
        expenseReason: input.description.trim(),
      });
      const liabilityId = Number(liabilityResult[0]?.insertId);
      await tx.insert(financialExpenseDetails).values({ liabilityId, expenseType: input.expenseType, partType: input.partType?.trim() || null, vehicleId: input.vehicleId ?? null, paymentMethod: input.paymentMethod ?? null });
      await tx.insert(financialTransactions).values({ transactionType: "expense", approvalStatus: "pending", amount: input.amount, paymentMethod: input.paymentMethod ?? null, settlementType: "unlinked", vehicleId: input.vehicleId ?? null, createdBy: input.createdBy, sourceTable: "officeLiabilities", sourceId: liabilityId, description: input.description.trim() });
      const detail = (await tx.select().from(financialExpenseDetails).where(eq(financialExpenseDetails.liabilityId, liabilityId)).limit(1))[0];
      const transaction = (await tx.select().from(financialTransactions).where(and(eq(financialTransactions.sourceTable, "officeLiabilities"), eq(financialTransactions.sourceId, liabilityId))).limit(1))[0];
      if (!detail || !transaction) fail("INTERNAL_SERVER_ERROR", "تعذر حفظ تفاصيل المصروف المالي");
      return { liabilityId, detail, transaction };
    });
  });
}

export async function decideFinancialExpense(id: number, managerId: number, status: "approved" | "rejected", rejectionReason?: string) {
  const db = await getDb();
  if (!db) fail("INTERNAL_SERVER_ERROR", "قاعدة البيانات غير متاحة");
  return withExpenseLock(`decision:${id}`, async () => {
    const liability = await findLiability(db, id);
    if (!liability) fail("NOT_FOUND", "المصروف غير موجود");
    await assertManager(db, liability.createdBy, managerId);
    if (liability.approvalStatus !== "pending") fail("CONFLICT", "لا يمكن اتخاذ قرار على مصروف غير معلق");
    const reason = rejectionReason?.trim();
    if (status === "rejected" && !reason) fail("BAD_REQUEST", "سبب رفض المصروف مطلوب");
    const transaction = await findExpenseTransaction(db, id);
    if (!transaction) fail("CONFLICT", "المعاملة المالية المرتبطة بالمصروف غير موجودة");
    await db.transaction(async tx => {
      await tx.update(officeLiabilities).set({ approvalStatus: status, approvedBy: managerId, approvedAt: new Date(), rejectionReason: status === "rejected" ? reason : null }).where(and(eq(officeLiabilities.id, id), eq(officeLiabilities.approvalStatus, "pending")));
      await tx.update(financialTransactions).set({ approvalStatus: status, approvedBy: managerId, approvedAt: new Date(), rejectionReason: status === "rejected" ? reason : null }).where(and(eq(financialTransactions.id, transaction.id), eq(financialTransactions.approvalStatus, "pending")));
    });
    return { liability: (await findLiability(db, id))!, transaction: (await findExpenseTransaction(db, id))! };
  });
}

async function createLinkedExpense(id: number, input: ExpenseInput & { createdBy: number }, relation: "correction" | "reversal") {
  validateFinancialExpenseInput(input);
  const db = await getDb();
  if (!db) fail("INTERNAL_SERVER_ERROR", "قاعدة البيانات غير متاحة");
  const original = await findLiability(db, id);
  const originalTransaction = await findExpenseTransaction(db, id);
  if (!original || !originalTransaction) fail("NOT_FOUND", "المصروف الأصلي غير موجود");
  if (original.approvalStatus !== "approved" || originalTransaction.approvalStatus !== "approved") fail("CONFLICT", "لا يمكن تصحيح أو عكس مصروف غير معتمد");
  if (relation === "correction" && original.correctionOfLiabilityId) fail("CONFLICT", "تم تصحيح المصروف مسبقاً");
  if (relation === "reversal" && original.reversalOfLiabilityId) fail("CONFLICT", "تم عكس المصروف مسبقاً");
  if (input.vehicleId !== undefined && input.vehicleId !== original.vehicleId) fail("BAD_REQUEST", "السيارة لا تتوافق مع المصروف الأصلي");
  await assertVehicle(db, input.vehicleId ?? original.vehicleId ?? undefined);
  return withExpenseLock(`link:${relation}:${id}`, async () => db.transaction(async tx => {
    const existing = (await tx.select({ id: officeLiabilities.id }).from(officeLiabilities).where(relation === "correction" ? eq(officeLiabilities.correctionOfLiabilityId, id) : eq(officeLiabilities.reversalOfLiabilityId, id)).limit(1))[0];
    if (existing) fail("CONFLICT", "تم إنشاء الحركة المرتبطة مسبقاً");
    const liabilityResult = await tx.insert(officeLiabilities).values({ category: "financial_expense", description: input.description.trim(), amount: input.amount, paidAmount: "0", vehicleId: input.vehicleId ?? original.vehicleId, paymentMethod: input.paymentMethod ?? original.paymentMethod, approvalStatus: "pending", createdBy: input.createdBy, expenseReason: input.description.trim(), originalTransactionId: originalTransaction.id, correctionOfLiabilityId: relation === "correction" ? id : null, reversalOfLiabilityId: relation === "reversal" ? id : null });
    const liabilityId = Number(liabilityResult[0]?.insertId);
    await tx.insert(financialExpenseDetails).values({ liabilityId, expenseType: input.expenseType, partType: input.partType?.trim() || null, vehicleId: input.vehicleId ?? original.vehicleId, paymentMethod: input.paymentMethod ?? original.paymentMethod });
    await tx.insert(financialTransactions).values({ transactionType: "expense", approvalStatus: "pending", amount: input.amount, paymentMethod: input.paymentMethod ?? original.paymentMethod, settlementType: "unlinked", vehicleId: input.vehicleId ?? original.vehicleId, createdBy: input.createdBy, originalTransactionId: originalTransaction.originalTransactionId ?? originalTransaction.id, correctionOfTransactionId: relation === "correction" ? originalTransaction.id : null, reversalOfTransactionId: relation === "reversal" ? originalTransaction.id : null, sourceTable: "officeLiabilities", sourceId: liabilityId, description: input.description.trim() });
    const detail = (await tx.select().from(financialExpenseDetails).where(eq(financialExpenseDetails.liabilityId, liabilityId)).limit(1))[0];
    const transaction = (await tx.select().from(financialTransactions).where(and(eq(financialTransactions.sourceTable, "officeLiabilities"), eq(financialTransactions.sourceId, liabilityId))).limit(1))[0];
    if (!detail || !transaction || transaction.id === originalTransaction.id || transaction.originalTransactionId === transaction.id) fail("INTERNAL_SERVER_ERROR", "تعذر حفظ المصروف المرتبط");
    return { liabilityId, detail, transaction };
  }));
}

export async function correctFinancialExpense(id: number, input: ExpenseInput & { createdBy: number }) { return createLinkedExpense(id, input, "correction"); }
export async function reverseFinancialExpense(id: number, input: ExpenseInput & { createdBy: number }) { return createLinkedExpense(id, input, "reversal"); }

export async function listFinancialExpenses() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ liability: officeLiabilities, detail: financialExpenseDetails, transaction: financialTransactions }).from(officeLiabilities).innerJoin(financialExpenseDetails, eq(financialExpenseDetails.liabilityId, officeLiabilities.id)).innerJoin(financialTransactions, and(eq(financialTransactions.sourceTable, "officeLiabilities"), eq(financialTransactions.sourceId, officeLiabilities.id))).orderBy(officeLiabilities.createdAt);
}

export function summarizeFinancialExpenses(rows: Array<Pick<FinancialTransaction, "id" | "transactionType" | "approvalStatus" | "amount" | "originalTransactionId" | "correctionOfTransactionId" | "reversalOfTransactionId">>) {
  return summarizeEffectiveStatusTotals(rows, "expense");
}

export async function getFinancialExpenseSummary() {
  const db = await getDb();
  if (!db) return { pending: "0.00", rejected: "0.00", approved: "0.00", legacyAccepted: "0.00" };
  const rows = await db.select({ id: financialTransactions.id, transactionType: financialTransactions.transactionType, amount: financialTransactions.amount, approvalStatus: financialTransactions.approvalStatus, originalTransactionId: financialTransactions.originalTransactionId, correctionOfTransactionId: financialTransactions.correctionOfTransactionId, reversalOfTransactionId: financialTransactions.reversalOfTransactionId }).from(financialTransactions).where(eq(financialTransactions.transactionType, "expense"));
  return summarizeFinancialExpenses(rows);
}
