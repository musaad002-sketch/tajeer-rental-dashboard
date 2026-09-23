import { TRPCError } from "@trpc/server";
import {
  correctFinancialTransaction,
  createFinancialTransaction,
  getFinancialTransaction,
  listFinancialTransactions,
  rejectFinancialTransaction,
  reverseFinancialTransaction,
  approveFinancialTransaction,
} from "./financialTransactions";
import type { FinancialTransaction } from "../drizzle/schema";
import { summarizeEffectiveStatusTotals } from "./financialReporting";

export const FINANCIAL_REVENUE_TYPES = ["rental", "insurance_deductible", "accident_compensation", "other"] as const;
export type FinancialRevenueType = (typeof FINANCIAL_REVENUE_TYPES)[number];

type RevenueInput = {
  revenueType: FinancialRevenueType;
  amount: string;
  description: string;
  evidenceReference?: string;
  contractId?: number;
  customerId?: number;
  vehicleId?: number;
  paymentMethod?: "cash" | "network" | "transfer" | "mixed";
  sourceTable?: "payments" | "officeLiabilities" | "legacy" | "financialTransactions";
  sourceId?: number;
  metadata?: string;
};

function fail(code: "BAD_REQUEST" | "NOT_FOUND" | "CONFLICT", message: string): never {
  throw new TRPCError({ code, message });
}

export function validateFinancialRevenueInput(input: RevenueInput) {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) fail("BAD_REQUEST", "يجب أن يكون مبلغ الإيراد أكبر من صفر");
  if (!FINANCIAL_REVENUE_TYPES.includes(input.revenueType)) fail("BAD_REQUEST", "نوع الإيراد غير معتمد");
  if (!input.description.trim()) fail("BAD_REQUEST", "وصف الإيراد مطلوب");
  if (input.revenueType === "accident_compensation" && !input.evidenceReference?.trim()) fail("BAD_REQUEST", "مرجع تعويض الحادث مطلوب");
  return input;
}

function withEvidence(input: RevenueInput) {
  return input.evidenceReference?.trim() ? JSON.stringify({ ...(input.metadata ? { metadata: input.metadata } : {}), evidenceReference: input.evidenceReference.trim() }) : input.metadata;
}

export async function createFinancialRevenue(input: RevenueInput & { createdBy: number }): Promise<FinancialTransaction> {
  validateFinancialRevenueInput(input);
  return createFinancialTransaction({
    transactionType: "revenue",
    amount: input.amount,
    revenueType: input.revenueType,
    contractId: input.contractId,
    customerId: input.customerId,
    vehicleId: input.vehicleId,
    paymentMethod: input.paymentMethod,
    sourceTable: input.sourceTable,
    sourceId: input.sourceId,
    description: input.description.trim(),
    metadata: withEvidence(input),
    createdBy: input.createdBy,
  });
}

export async function approveFinancialRevenue(id: number, managerId: number) {
  const revenue = await getFinancialTransaction(id);
  if (!revenue || revenue.transactionType !== "revenue") fail("NOT_FOUND", "الإيراد غير موجود");
  return approveFinancialTransaction(id, managerId);
}

export async function rejectFinancialRevenue(id: number, managerId: number, rejectionReason: string) {
  const revenue = await getFinancialTransaction(id);
  if (!revenue || revenue.transactionType !== "revenue") fail("NOT_FOUND", "الإيراد غير موجود");
  return rejectFinancialTransaction(id, managerId, rejectionReason);
}

async function linkedRevenue(id: number, input: RevenueInput & { createdBy: number }, operation: typeof correctFinancialTransaction | typeof reverseFinancialTransaction) {
  validateFinancialRevenueInput(input);
  const original = await getFinancialTransaction(id);
  if (!original || original.transactionType !== "revenue") fail("NOT_FOUND", "الإيراد الأصلي غير موجود");
  if (original.revenueType !== input.revenueType) fail("BAD_REQUEST", "نوع الإيراد المرتبط لا يتوافق مع الأصل");
  return operation(id, {
    transactionType: "revenue",
    amount: input.amount,
    reason: input.description.trim(),
    paymentMethod: input.paymentMethod,
    contractId: input.contractId,
    customerId: input.customerId,
    vehicleId: input.vehicleId,
    metadata: withEvidence(input),
    createdBy: input.createdBy,
  });
}

export async function correctFinancialRevenue(id: number, input: RevenueInput & { createdBy: number }) {
  return linkedRevenue(id, input, correctFinancialTransaction);
}

export async function reverseFinancialRevenue(id: number, input: RevenueInput & { createdBy: number }) {
  return linkedRevenue(id, input, reverseFinancialTransaction);
}

export function summarizeFinancialRevenues(rows: Array<Pick<FinancialTransaction, "transactionType" | "approvalStatus" | "amount" | "id"> & Partial<Pick<FinancialTransaction, "originalTransactionId" | "correctionOfTransactionId" | "reversalOfTransactionId">>>) {
  return summarizeEffectiveStatusTotals(rows, "revenue");
}

export async function listFinancialRevenues() {
  const rows = await listFinancialTransactions();
  return rows.filter(row => row.transactionType === "revenue");
}

export async function getFinancialRevenueSummary() {
  return summarizeFinancialRevenues(await listFinancialRevenues());
}
