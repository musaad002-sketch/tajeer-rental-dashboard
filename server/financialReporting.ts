import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { financialPaymentAllocations, financialTransactions, type FinancialPaymentAllocation, type FinancialTransaction } from "../drizzle/schema";
import { getOperatingCycle } from "../shared/rentalRules";
import { getDb } from "./db";

export type ReportingTransaction = Pick<FinancialTransaction, "id" | "transactionType" | "approvalStatus" | "amount" | "paymentMethod" | "description" | "transactionDate" | "revenueType" | "originalTransactionId" | "correctionOfTransactionId" | "reversalOfTransactionId" | "sourceTable" | "sourceId" | "contractId" | "vehicleId">;
export type FinancialReportingTransaction = ReportingTransaction;
export type ReportingAllocation = Pick<FinancialPaymentAllocation, "id" | "transactionId" | "paymentId" | "contractId" | "allocationType" | "priority" | "amount">;
type ReportingTransactionCore = Pick<FinancialTransaction, "id" | "transactionType" | "approvalStatus" | "amount"> & Partial<Pick<FinancialTransaction, "transactionDate" | "originalTransactionId" | "correctionOfTransactionId" | "reversalOfTransactionId">>;

export type FinancialReportingSummary = {
  revenue: { approved: string; pending: string; rejected: string; legacyAccepted: string };
  expense: { approved: string; pending: string; rejected: string; legacyAccepted: string };
  payment: { approved: string; pending: string; rejected: string; legacyAccepted: string };
  approvedAllocations: { total: string; count: number };
};

function money(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fixed(value: number) { return value.toFixed(2); }

function statusTotals() { return { approved: 0, pending: 0, rejected: 0, legacyAccepted: 0 }; }

function effectiveTransactions<T extends ReportingTransactionCore>(rows: T[]) {
  const unique = Array.from(new Map(rows.map(row => [row.id, row])).values());
  const approvedOrLegacy = unique.filter(row => row.approvalStatus === "approved" || row.approvalStatus === "legacy_accepted");
  const approvedChildren = new Map<number, T[]>();
  for (const row of approvedOrLegacy) {
    const parent = row.correctionOfTransactionId ?? row.reversalOfTransactionId;
    if (parent !== null && parent !== undefined) approvedChildren.set(parent, [...(approvedChildren.get(parent) ?? []), row]);
  }
  return approvedOrLegacy.filter(row => {
    const children = approvedChildren.get(row.id) ?? [];
    return !children.some(child => child.correctionOfTransactionId === row.id);
  });
}

export function summarizeEffectiveStatusTotals(rows: ReportingTransactionCore[], transactionType: FinancialTransaction["transactionType"]) {
  const totals = { pending: 0, rejected: 0, approved: 0, legacyAccepted: 0 };
  const unique = Array.from(new Map(rows.map(row => [row.id, row])).values());
  for (const row of unique.filter(row => row.transactionType === transactionType && (row.approvalStatus === "pending" || row.approvalStatus === "rejected"))) {
    totals[row.approvalStatus === "pending" ? "pending" : "rejected"] += money(row.amount);
  }
  for (const row of effectiveTransactions(unique).filter(row => row.transactionType === transactionType)) {
    const status = row.approvalStatus === "legacy_accepted" ? "legacyAccepted" : "approved";
    totals[status] += money(row.amount) * (row.reversalOfTransactionId ? -1 : 1);
  }
  return { pending: fixed(totals.pending), rejected: fixed(totals.rejected), approved: fixed(totals.approved), legacyAccepted: fixed(totals.legacyAccepted) };
}

export function summarizeEffectivePayments(transactions: ReportingTransaction[], from?: Date) {
  const payments = effectiveTransactions(transactions).filter(row => row.transactionType === "payment" && (!from || (row.transactionDate !== undefined && row.transactionDate >= from)));
  return {
    amount: payments.reduce((sum, row) => sum + money(row.amount) * (row.reversalOfTransactionId ? -1 : 1), 0),
    count: payments.length,
  };
}

export function summarizeFinancialReporting(transactions: ReportingTransaction[], allocations: ReportingAllocation[] = []): FinancialReportingSummary {
  const totals = { revenue: statusTotals(), expense: statusTotals(), payment: statusTotals() };
  const unique = Array.from(new Map(transactions.map(row => [row.id, row])).values());
  const effective = effectiveTransactions(unique);
  for (const transactionType of ["revenue", "expense", "payment"] as const) {
    const summary = summarizeEffectiveStatusTotals(unique, transactionType);
    totals[transactionType] = { approved: money(summary.approved), pending: money(summary.pending), rejected: money(summary.rejected), legacyAccepted: money(summary.legacyAccepted) };
  }
  const approvedIds = new Set(effective.filter(row => row.transactionType === "payment" && (row.approvalStatus === "approved" || row.approvalStatus === "legacy_accepted")).map(row => row.id));
  const approvedAllocations = allocations.filter(row => approvedIds.has(row.transactionId) && money(row.amount) > 0);
  return {
    revenue: { approved: fixed(totals.revenue.approved), pending: fixed(totals.revenue.pending), rejected: fixed(totals.revenue.rejected), legacyAccepted: fixed(totals.revenue.legacyAccepted) },
    expense: { approved: fixed(totals.expense.approved), pending: fixed(totals.expense.pending), rejected: fixed(totals.expense.rejected), legacyAccepted: fixed(totals.expense.legacyAccepted) },
    payment: { approved: fixed(totals.payment.approved), pending: fixed(totals.payment.pending), rejected: fixed(totals.payment.rejected), legacyAccepted: fixed(totals.payment.legacyAccepted) },
    approvedAllocations: { total: fixed(approvedAllocations.reduce((sum, row) => sum + money(row.amount), 0)), count: approvedAllocations.length },
  };
}

export function buildFinancialReportingReadModel(transactions: ReportingTransaction[], allocations: ReportingAllocation[] = []) {
  const effective = effectiveTransactions(transactions);
  const includedIds = new Set(effective.map(row => row.id));
  return {
    summary: summarizeFinancialReporting(transactions, allocations),
    transactions: effective,
    allocations: allocations.filter(row => includedIds.has(row.transactionId) && effective.some(tx => tx.id === row.transactionId && tx.transactionType === "payment")),
  };
}

export type FinancialReportingReadModel = ReturnType<typeof buildFinancialReportingReadModel>;

export type MonthlyAggregate = {
  cycleStart: string;
  cycleEnd: string;
  label: string;
  revenues: number;
  expenses: number;
  payments: number;
  net: number;
};

export function aggregateByMonthlyCycle(
  transactions: FinancialReportingTransaction[],
  year: number
): MonthlyAggregate[] {
  const cycles: MonthlyAggregate[] = [];
  for (let month = 0; month < 12; month++) {
    const sampleDate = new Date(year, month, 15);
    const { start, end } = getOperatingCycle(sampleDate);
    const inCycle = transactions.filter(tx => {
      const d = new Date(tx.transactionDate);
      return d >= start && d <= end;
    });
    const revenues = inCycle
      .filter(t => t.transactionType === "revenue")
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const expenses = inCycle
      .filter(t => t.transactionType === "expense")
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const payments = inCycle
      .filter(t => t.transactionType === "payment")
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
    cycles.push({
      cycleStart: start.toISOString().slice(0, 10),
      cycleEnd: end.toISOString().slice(0, 10),
      label: `${String(month + 1).padStart(2, "0")}/${year}`,
      revenues,
      expenses,
      payments,
      net: revenues - expenses,
    });
  }
  return cycles;
}

export async function getFinancialReportingReadModel(input?: { cycleDate?: string | Date }): Promise<FinancialReportingReadModel> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
  let cycleStart: Date | undefined;
  let cycleEnd: Date | undefined;
  if (input?.cycleDate) {
    const cycle = getOperatingCycle(new Date(input.cycleDate));
    cycleStart = cycle.start;
    cycleEnd = cycle.end;
  }
  const dateConditions = [
    cycleStart ? gte(financialTransactions.transactionDate, cycleStart) : undefined,
    cycleEnd ? lte(financialTransactions.transactionDate, cycleEnd) : undefined,
  ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));
  const transactions = await db.select({
    id: financialTransactions.id,
    transactionType: financialTransactions.transactionType,
    approvalStatus: financialTransactions.approvalStatus,
    amount: financialTransactions.amount,
    paymentMethod: financialTransactions.paymentMethod,
    description: financialTransactions.description,
    transactionDate: financialTransactions.transactionDate,
    revenueType: financialTransactions.revenueType,
    originalTransactionId: financialTransactions.originalTransactionId,
    correctionOfTransactionId: financialTransactions.correctionOfTransactionId,
    reversalOfTransactionId: financialTransactions.reversalOfTransactionId,
    sourceTable: financialTransactions.sourceTable,
    sourceId: financialTransactions.sourceId,
    contractId: financialTransactions.contractId,
    vehicleId: financialTransactions.vehicleId,
  }).from(financialTransactions).where(dateConditions.length ? and(...dateConditions) : undefined);
  const paymentIds = transactions.filter(row => row.transactionType === "payment").map(row => row.id);
  const allocations = paymentIds.length ? await db.select({ id: financialPaymentAllocations.id, transactionId: financialPaymentAllocations.transactionId, paymentId: financialPaymentAllocations.paymentId, contractId: financialPaymentAllocations.contractId, allocationType: financialPaymentAllocations.allocationType, priority: financialPaymentAllocations.priority, amount: financialPaymentAllocations.amount }).from(financialPaymentAllocations).where(inArray(financialPaymentAllocations.transactionId, paymentIds)) : [];
  return buildFinancialReportingReadModel(transactions, allocations);
}

export async function getAllFinancialTransactionsForRange(
  start: Date,
  end: Date
): Promise<FinancialReportingTransaction[]> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
  return db.select({
    id: financialTransactions.id,
    transactionType: financialTransactions.transactionType,
    approvalStatus: financialTransactions.approvalStatus,
    amount: financialTransactions.amount,
    paymentMethod: financialTransactions.paymentMethod,
    description: financialTransactions.description,
    transactionDate: financialTransactions.transactionDate,
    revenueType: financialTransactions.revenueType,
    originalTransactionId: financialTransactions.originalTransactionId,
    correctionOfTransactionId: financialTransactions.correctionOfTransactionId,
    reversalOfTransactionId: financialTransactions.reversalOfTransactionId,
    sourceTable: financialTransactions.sourceTable,
    sourceId: financialTransactions.sourceId,
    contractId: financialTransactions.contractId,
    vehicleId: financialTransactions.vehicleId,
  }).from(financialTransactions).where(and(
    gte(financialTransactions.transactionDate, start),
    lte(financialTransactions.transactionDate, end)
  ));
}

export async function listFinancialReportingTransactions() {
  const model = await getFinancialReportingReadModel();
  return model.transactions;
}

export async function listApprovedFinancialAllocations() {
  const model = await getFinancialReportingReadModel();
  return model.allocations;
}
