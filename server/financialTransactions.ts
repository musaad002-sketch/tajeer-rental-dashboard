import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  contracts,
  customers,
  financialTransactions,
  payments,
  officeLiabilities,
  vehicles,
  users,
  type FinancialTransaction,
} from "../drizzle/schema";
import { getDb } from "./db";

export const PENDING_APPROVAL = "pending" as const;
export const FINANCIAL_APPROVAL_STATUSES = ["pending", "approved", "rejected", "legacy_accepted"] as const;
export type FinancialApprovalStatus = (typeof FINANCIAL_APPROVAL_STATUSES)[number];
export type FinancialTransactionType = "payment" | "revenue" | "expense";
export type FinancialSourceTable = "payments" | "officeLiabilities" | "legacy" | "financialTransactions";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type TransactionInput = {
  transactionType: FinancialTransactionType;
  amount: string;
  paymentMethod?: "cash" | "network" | "transfer" | "mixed";
  settlementType?: "suspended_contract" | "previous_contract" | "non_suspended_contract" | "unlinked";
  revenueType?: "rental" | "insurance_deductible" | "accident_compensation" | "other";
  contractId?: number;
  customerId?: number;
  vehicleId?: number;
  paymentId?: number;
  liabilityId?: number;
  sourceTable?: FinancialSourceTable;
  sourceId?: number;
  description?: string;
  metadata?: string;
};

type TransactionLinkInput = TransactionInput & { reason: string; createdBy: number };

const sourceLocks = new Map<string, Promise<void>>();

async function withSourceLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = sourceLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  sourceLocks.set(key, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (sourceLocks.get(key) === current) sourceLocks.delete(key);
  }
}

function fail(code: "BAD_REQUEST" | "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "INTERNAL_SERVER_ERROR", message: string): never {
  throw new TRPCError({ code, message });
}

function requirePositiveAmount(amount: string) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) fail("BAD_REQUEST", "يجب أن يكون مبلغ الحركة أكبر من صفر");
  return amount;
}

async function findTransaction(db: Database, id: number) {
  const rows = await db.select().from(financialTransactions).where(eq(financialTransactions.id, id)).limit(1);
  return rows[0] ?? null;
}

async function validateReferences(db: Database, input: TransactionInput) {
  const amount = requirePositiveAmount(input.amount);
  if (input.transactionType === "payment" && !input.paymentMethod)
    fail("BAD_REQUEST", "طريقة الدفع مطلوبة للدفعات");
  if (
    input.transactionType === "payment" &&
    input.contractId === undefined &&
    !(input.settlementType === "unlinked" && input.sourceTable === "legacy")
  )
    fail("BAD_REQUEST", "لا يمكن إنشاء دفعة غير مرتبطة إلا كسداد تاريخي legacy");
  if (input.sourceTable === "legacy") {
    if (input.sourceId === undefined) fail("BAD_REQUEST", "sourceId مطلوب مع sourceTable");
    if (input.paymentId !== undefined || input.liabilityId !== undefined) fail("BAD_REQUEST", "لا يمكن ربط legacy بدفعة أو التزام");
  }
  if (input.paymentId !== undefined && input.liabilityId !== undefined) fail("BAD_REQUEST", "لا يمكن ربط الحركة بدفعة والتزام معاً");

  let contract: typeof contracts.$inferSelect | undefined;
  if (input.contractId !== undefined) {
    contract = (await db.select().from(contracts).where(eq(contracts.id, input.contractId)).limit(1))[0];
    if (!contract) fail("BAD_REQUEST", "العقد غير موجود");
    if (input.customerId !== undefined && contract.customerId !== input.customerId) fail("BAD_REQUEST", "العميل لا يتوافق مع العقد");
    if (input.vehicleId !== undefined && contract.vehicleId !== input.vehicleId) fail("BAD_REQUEST", "السيارة لا تتوافق مع العقد");
  }
  if (input.customerId !== undefined) {
    const customer = (await db.select({ id: customers.id }).from(customers).where(eq(customers.id, input.customerId)).limit(1))[0];
    if (!customer) fail("BAD_REQUEST", "العميل غير موجود");
  }
  if (input.vehicleId !== undefined) {
    const vehicle = (await db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.id, input.vehicleId)).limit(1))[0];
    if (!vehicle) fail("BAD_REQUEST", "السيارة غير موجودة");
  }

  let sourceTable = input.sourceTable;
  let sourceId = input.sourceId;
  if (input.paymentId !== undefined) {
    const payment = (await db.select().from(payments).where(eq(payments.id, input.paymentId)).limit(1))[0];
    if (!payment) fail("BAD_REQUEST", "الدفعة غير موجودة");
    if (input.transactionType !== "payment") fail("BAD_REQUEST", "الدفعة لا تتوافق مع نوع الحركة");
    if (input.contractId !== undefined && payment.contractId !== input.contractId) fail("BAD_REQUEST", "الدفعة لا تتوافق مع العقد");
    if (input.customerId !== undefined && payment.customerId !== input.customerId) fail("BAD_REQUEST", "الدفعة لا تتوافق مع العميل");
    sourceTable = "payments";
    sourceId = input.paymentId;
  }
  if (input.liabilityId !== undefined) {
    const liability = (await db.select().from(officeLiabilities).where(eq(officeLiabilities.id, input.liabilityId)).limit(1))[0];
    if (!liability) fail("BAD_REQUEST", "الالتزام غير موجود");
    if (input.transactionType !== "expense") fail("BAD_REQUEST", "الالتزام لا يتوافق مع نوع الحركة");
    if (input.vehicleId !== undefined && liability.vehicleId !== input.vehicleId) fail("BAD_REQUEST", "الالتزام لا يتوافق مع السيارة");
    sourceTable = "officeLiabilities";
    sourceId = input.liabilityId;
  }
  if (sourceTable && sourceId === undefined) fail("BAD_REQUEST", "sourceId مطلوب مع sourceTable");
  if (sourceId !== undefined && !sourceTable) fail("BAD_REQUEST", "sourceTable مطلوب مع sourceId");
  if (sourceTable === "payments" && sourceId !== undefined && !(await db.select({ id: payments.id }).from(payments).where(eq(payments.id, sourceId)).limit(1))[0]) fail("BAD_REQUEST", "الدفعة المصدر غير موجودة");
  if (sourceTable === "officeLiabilities" && sourceId !== undefined && !(await db.select({ id: officeLiabilities.id }).from(officeLiabilities).where(eq(officeLiabilities.id, sourceId)).limit(1))[0]) fail("BAD_REQUEST", "الالتزام المصدر غير موجود");
  if (sourceTable === "financialTransactions" && sourceId !== undefined && !(await findTransaction(db, sourceId))) fail("BAD_REQUEST", "المعاملة المصدر غير موجودة");
  return { amount, sourceTable, sourceId };
}

async function assertSourceIsUnique(db: Database, sourceTable?: string, sourceId?: number) {
  if (!sourceTable || sourceId === undefined) return;
  const existing = (await db.select({ id: financialTransactions.id }).from(financialTransactions).where(and(eq(financialTransactions.sourceTable, sourceTable), eq(financialTransactions.sourceId, sourceId))).limit(1))[0];
  if (existing) fail("CONFLICT", "يوجد financial transaction للمصدر نفسه بالفعل");
}

export async function createFinancialTransaction(input: TransactionInput & { createdBy: number }): Promise<FinancialTransaction> {
  const db = await getDb();
  if (!db) fail("INTERNAL_SERVER_ERROR", "قاعدة البيانات غير متاحة");
  const references = await validateReferences(db, input);
  const lockKey = references.sourceTable && references.sourceId !== undefined ? `${references.sourceTable}:${references.sourceId}` : `new:${input.createdBy}:${input.transactionType}:${input.amount}`;
  return withSourceLock(lockKey, async () => {
    await assertSourceIsUnique(db, references.sourceTable, references.sourceId);
    const result = await db.insert(financialTransactions).values({
      transactionType: input.transactionType,
      approvalStatus: PENDING_APPROVAL,
      amount: references.amount,
      paymentMethod: input.paymentMethod,
      settlementType: input.settlementType ?? "unlinked",
      revenueType: input.revenueType,
      contractId: input.contractId,
      customerId: input.customerId,
      vehicleId: input.vehicleId,
      createdBy: input.createdBy,
      sourceTable: references.sourceTable,
      sourceId: references.sourceId,
      description: input.description?.trim() || null,
      metadata: input.metadata ?? null,
    });
    const created = await findTransaction(db, Number(result[0]?.insertId));
    if (!created) fail("INTERNAL_SERVER_ERROR", "تعذر حفظ الحركة المالية");
    return created;
  });
}

async function assertManagerCanDecide(transaction: FinancialTransaction, managerId: number) {
  if (transaction.createdBy === managerId) fail("FORBIDDEN", "لا يمكن لمنشئ الحركة اعتمادها أو رفضها");
  const db = await getDb();
  if (!db) fail("INTERNAL_SERVER_ERROR", "قاعدة البيانات غير متاحة");
  const manager = (await db.select({ id: users.id, role: users.role, isActive: users.isActive }).from(users).where(eq(users.id, managerId)).limit(1))[0];
  if (!manager || !manager.isActive || manager.role !== "admin") fail("FORBIDDEN", "اعتماد الحركات المالية متاح للمدير فقط");
}

export async function approveFinancialTransaction(id: number, managerId: number): Promise<FinancialTransaction> {
  const db = await getDb();
  if (!db) fail("INTERNAL_SERVER_ERROR", "قاعدة البيانات غير متاحة");
  const transaction = await findTransaction(db, id);
  if (!transaction) fail("NOT_FOUND", "الحركة المالية غير موجودة");
  await assertManagerCanDecide(transaction, managerId);
  if (transaction.approvalStatus !== PENDING_APPROVAL) fail("CONFLICT", "لا يمكن اعتماد حركة ليست معلقة");
  const now = new Date();
  const result = await db.update(financialTransactions).set({ approvalStatus: "approved", approvedBy: managerId, approvedAt: now, rejectionReason: null }).where(and(eq(financialTransactions.id, id), eq(financialTransactions.approvalStatus, PENDING_APPROVAL)));
  if (Number((result as any)[0]?.affectedRows ?? 0) !== 1) fail("CONFLICT", "تم اتخاذ قرار الاعتماد مسبقاً");
  if (transaction.sourceTable === "payments" && transaction.sourceId !== null && transaction.sourceId !== undefined) {
    await db.update(payments).set({ approvalStatus: "approved", approvedBy: managerId, approvedAt: now, rejectionReason: null }).where(eq(payments.id, transaction.sourceId));
  }
  if (transaction.sourceTable === "officeLiabilities" && transaction.sourceId !== null && transaction.sourceId !== undefined) {
    await db.update(officeLiabilities).set({ approvalStatus: "approved", approvedBy: managerId, approvedAt: now, rejectionReason: null }).where(eq(officeLiabilities.id, transaction.sourceId));
  }
  return (await findTransaction(db, id))!;
}

export async function rejectFinancialTransaction(id: number, managerId: number, rejectionReason: string): Promise<FinancialTransaction> {
  const reason = rejectionReason.trim();
  if (!reason) fail("BAD_REQUEST", "سبب الرفض مطلوب");
  const db = await getDb();
  if (!db) fail("INTERNAL_SERVER_ERROR", "قاعدة البيانات غير متاحة");
  const transaction = await findTransaction(db, id);
  if (!transaction) fail("NOT_FOUND", "الحركة المالية غير موجودة");
  await assertManagerCanDecide(transaction, managerId);
  if (transaction.approvalStatus !== PENDING_APPROVAL) fail("CONFLICT", "لا يمكن رفض حركة ليست معلقة");
  const now = new Date();
  const result = await db.update(financialTransactions).set({ approvalStatus: "rejected", approvedBy: managerId, approvedAt: now, rejectionReason: reason }).where(and(eq(financialTransactions.id, id), eq(financialTransactions.approvalStatus, PENDING_APPROVAL)));
  if (Number((result as any)[0]?.affectedRows ?? 0) !== 1) fail("CONFLICT", "تم اتخاذ قرار الرفض مسبقاً");
  if (transaction.sourceTable === "payments" && transaction.sourceId !== null && transaction.sourceId !== undefined) {
    await db.update(payments).set({ approvalStatus: "rejected", approvedBy: managerId, approvedAt: now, rejectionReason: reason }).where(eq(payments.id, transaction.sourceId));
  }
  if (transaction.sourceTable === "officeLiabilities" && transaction.sourceId !== null && transaction.sourceId !== undefined) {
    await db.update(officeLiabilities).set({ approvalStatus: "rejected", approvedBy: managerId, approvedAt: now, rejectionReason: reason }).where(eq(officeLiabilities.id, transaction.sourceId));
  }
  return (await findTransaction(db, id))!;
}

async function createLinkedTransaction(id: number, input: TransactionLinkInput, field: "correctionOfTransactionId" | "reversalOfTransactionId") {
  const db = await getDb();
  if (!db) fail("INTERNAL_SERVER_ERROR", "قاعدة البيانات غير متاحة");
  const reason = input.reason.trim();
  if (!reason) fail("BAD_REQUEST", "سبب التصحيح أو العكس مطلوب");
  const original = await findTransaction(db, id);
  if (!original) fail("NOT_FOUND", "الحركة الأصلية غير موجودة");
  if (id <= 0 || id === input.sourceId || id === input.contractId) fail("BAD_REQUEST", "مرجع الحركة غير صالح");
  if (original.approvalStatus !== "approved") fail("CONFLICT", "لا يمكن تصحيح أو عكس حركة غير معتمدة");
  if (input.transactionType !== original.transactionType) fail("BAD_REQUEST", "نوع الحركة المرتبطة لا يتوافق مع الأصل");
  if (input.contractId !== undefined && input.contractId !== original.contractId) fail("BAD_REQUEST", "العقد لا يتوافق مع الحركة الأصلية");
  if (input.customerId !== undefined && input.customerId !== original.customerId) fail("BAD_REQUEST", "العميل لا يتوافق مع الحركة الأصلية");
  if (input.vehicleId !== undefined && input.vehicleId !== original.vehicleId) fail("BAD_REQUEST", "السيارة لا تتوافق مع الحركة الأصلية");
  const refs = await validateReferences(db, {
    ...input,
    contractId: input.contractId ?? original.contractId ?? undefined,
    customerId: input.customerId ?? original.customerId ?? undefined,
    vehicleId: input.vehicleId ?? original.vehicleId ?? undefined,
  });
  const related = (await db.select({ id: financialTransactions.id }).from(financialTransactions).where(eq(financialTransactions[field], id)).limit(1))[0];
  if (related) fail("CONFLICT", "تم إنشاء التصحيح أو العكس لهذه الحركة مسبقاً");
  const originalRoot = original.originalTransactionId ?? original.id;
  const created = await db.insert(financialTransactions).values({
    transactionType: input.transactionType,
    approvalStatus: PENDING_APPROVAL,
    amount: refs.amount,
    paymentMethod: input.paymentMethod ?? original.paymentMethod,
    settlementType: input.settlementType ?? original.settlementType,
    revenueType: input.revenueType ?? original.revenueType,
    contractId: input.contractId ?? original.contractId,
    customerId: input.customerId ?? original.customerId,
    vehicleId: input.vehicleId ?? original.vehicleId,
    createdBy: input.createdBy,
    originalTransactionId: originalRoot,
    [field]: id,
    description: reason,
    metadata: input.metadata ?? null,
  });
  const result = await findTransaction(db, Number(created[0]?.insertId));
  if (!result || result.id === id || result.originalTransactionId === result.id || result[field] === result.id) fail("INTERNAL_SERVER_ERROR", "تعذر حفظ الحركة المرتبطة");
  return result;
}

export async function correctFinancialTransaction(id: number, input: TransactionLinkInput & { createdBy: number }) {
  return createLinkedTransaction(id, input, "correctionOfTransactionId");
}

export async function reverseFinancialTransaction(id: number, input: TransactionLinkInput & { createdBy: number }) {
  return createLinkedTransaction(id, input, "reversalOfTransactionId");
}

export async function getFinancialTransaction(id: number) {
  const db = await getDb();
  if (!db) return null;
  return findTransaction(db, id);
}

export async function listFinancialTransactions() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(financialTransactions);
}
