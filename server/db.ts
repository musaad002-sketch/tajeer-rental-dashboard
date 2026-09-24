import {
  formatGregorianDate,
  formatGregorianDateTime,
} from "../shared/dateFormat";
import { createHash } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { and, desc, eq, gte, inArray, like, lte, or, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  blockedCustomers,
  contractOperations,
  contracts,
  customers,
  deletionAudits,
  employees,
  expenseTypes,
  financialPaymentAllocations,
  financialTransactions,
  maintenanceRecords,
  monthlyInstallments,
  officeLiabilities,
  payments,
  siteContent,
  users,
  vehicles,
  vehicleReadiness,
  vehicleNotes,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import {
  buildOperationEffects,
  canSwapVehicleByThreshold,
  getContractReference,
  validateVehicleSwap,
} from "../shared/contractOperations";
import { nextContractNumber as computeNextContractNumber } from "../shared/contractNumbers";
import {
  extendReturnDate,
  isFinanciallyDistressed,
} from "../shared/contractCalculation";
import { calculateContractTotals } from "../shared/contractTotals";
import { isExpenseIncludedInNetRevenue } from "../shared/expenseApproval";
import { calculateContractBalances } from "../shared/contractBalances";
import { calculateDashboardOutstandingBreakdown } from "../shared/dashboardOutstanding";
import {
  addAdditionalFee,
  calculateRateAdjustedTotal,
} from "../shared/contractFinance";
import {
  calculateOilMaintenance,
  isMileageAdvanceValid,
  mileageWarningMessage,
} from "../shared/vehicleMaintenance";
import { allocatePayment } from "../shared/paymentAllocation";
import { calculateReturnSettlement } from "../shared/returnSettlement";
import { belongsToGeneralOutstanding } from "../shared/outstandingStatus";
import { calculateCloseSettlement } from "../shared/closeSettlement";
import {
  calculateSuspensionSettlement,
  statusAfterSuspendedSettlement,
} from "../shared/suspensionSettlement";
import { canChargeMonthlyAuthorizationFee } from "../shared/contractScope";
import {
  isOtherRevenueReason,
  paymentReasonLabels,
} from "../shared/paymentReasons";
import { calculateMileageCharge } from "../shared/mileageCharges";
import { buildOfficeInsights } from "../shared/officeInsights";
import { createFinancialTransaction } from "./financialTransactions";
import {
  getFinancialReportingReadModel,
  summarizeEffectivePayments,
} from "./financialReporting";
import {
  calculateOdometerDistance,
  requiresOdometerReading,
  validateOdometerReading,
  type DocumentedOdometer,
} from "../shared/odometer";
import {
  appendOperationAudit,
  findDuplicateOperation,
  operationKey,
  validatePaymentException,
  type PaymentException,
} from "../shared/contractOperationGuard";
import {
  hasRentalPeriodOverlap,
  isValidRentalPeriod,
} from "../shared/rentalRules";

let _db: ReturnType<typeof drizzle> | null = null;
const transactionContext = new AsyncLocalStorage<ReturnType<typeof drizzle>>();
const paymentFinancialTransactionLocks = new Map<number, Promise<void>>();
const contractOperationLocks = new Map<string, Promise<void>>();

async function acquireContractOperationLock(key: string) {
  const previous = contractOperationLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => {
    release = resolve;
  });
  contractOperationLocks.set(key, current);
  await previous;
  return () => {
    release();
    if (contractOperationLocks.get(key) === current)
      contractOperationLocks.delete(key);
  };
}

async function createPendingPayment(input: {
  contractId: number;
  customerId: number;
  amount: string;
  method: "cash" | "network" | "transfer";
  notes?: string;
  createdBy?: number;
  paymentReason?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const paymentResult = await db.insert(payments).values({
    contractId: input.contractId,
    customerId: input.customerId,
    amount: input.amount,
    method: input.method,
    notes: input.notes,
    approvalStatus: "pending",
    paymentReason: input.paymentReason,
  });
  const paymentId = Number(paymentResult[0]?.insertId);
  if (!paymentId) throw new Error("تعذر حفظ الدفعة");
  await createFinancialTransaction({
    transactionType: "payment",
    amount: input.amount,
    paymentMethod: input.method,
    contractId: input.contractId,
    customerId: input.customerId,
    paymentId,
    description: input.notes,
    createdBy: input.createdBy ?? 0,
  });
  return paymentId;
}

function approvedReceiptCondition() {
  return or(
    eq(payments.approvalStatus, "legacy_accepted"),
    and(
      eq(payments.approvalStatus, "approved"),
      sql`exists (select 1 from ${financialTransactions} ft inner join ${financialPaymentAllocations} fa on fa.transactionId = ft.id where ft.sourceTable = 'payments' and ft.sourceId = ${payments.id} and ft.approvalStatus = 'approved')`
    )
  );
}

export async function getDb() {
  const transactionDb = transactionContext.getStore();
  if (transactionDb) return transactionDb;
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

async function runInTransaction<T>(
  db: ReturnType<typeof drizzle>,
  callback: (transactionDb: ReturnType<typeof drizzle>) => Promise<T>
) {
  if (transactionContext.getStore()) return callback(db);
  if (typeof db.transaction !== "function")
    return transactionContext.run(db, () => callback(db));
  return db.transaction(transactionDb =>
    transactionContext.run(
      transactionDb as unknown as ReturnType<typeof drizzle>,
      () => callback(transactionDb as unknown as ReturnType<typeof drizzle>)
    )
  );
}

async function getDocumentedOdometerReadings(
  vehicleId: number,
  vehicleMileage?: number | null
): Promise<DocumentedOdometer[]> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [maintenanceReadings, contractReadings] = await Promise.all([
    db
      .select({
        mileage: maintenanceRecords.mileage,
        serviceType: maintenanceRecords.serviceType,
      })
      .from(maintenanceRecords)
      .where(eq(maintenanceRecords.vehicleId, vehicleId)),
    db
      .select({ startMileage: contracts.startMileage })
      .from(contracts)
      .where(eq(contracts.vehicleId, vehicleId)),
  ]);
  return [
    { source: "vehicle", reading: vehicleMileage },
    ...maintenanceReadings.map(row => ({
      source:
        row.serviceType === "oil_change"
          ? ("oil_change" as const)
          : ("maintenance" as const),
      reading: row.mileage,
    })),
    ...contractReadings.map(row => ({
      source: "contract" as const,
      reading: row.startMileage,
    })),
  ];
}

async function lockVehicleRow(vehicleId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const query = db
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(eq(vehicles.id, vehicleId))
  if (typeof query.for === "function") await query.for("update");
  else await query;
}

async function lockVehicleRows(vehicleIds: number[]) {
  for (const vehicleId of Array.from(new Set(vehicleIds)).sort((a, b) => a - b))
    await lockVehicleRow(vehicleId);
}

async function createPaymentFinancialTransaction(input: {
  paymentId: number;
  contractId: number;
  customerId: number;
  vehicleId?: number | null;
  amount: string;
  method: "cash" | "network" | "transfer" | "mixed";
  settlementType?:
    | "suspended_contract"
    | "previous_contract"
    | "non_suspended_contract"
    | "unlinked";
  notes?: string | null;
  createdBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const previous =
    paymentFinancialTransactionLocks.get(input.paymentId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => {
    release = resolve;
  });
  paymentFinancialTransactionLocks.set(input.paymentId, current);
  await previous;
  try {
    const existing = await db
      .select({ id: financialTransactions.id })
      .from(financialTransactions)
      .where(
        and(
          eq(financialTransactions.sourceTable, "payments"),
          eq(financialTransactions.sourceId, input.paymentId)
        )
      )
      .limit(1);
    if (existing[0]) return existing[0].id;
    const result = await db.insert(financialTransactions).values({
      transactionType: "payment",
      approvalStatus: "pending",
      amount: input.amount,
      paymentMethod: input.method,
      settlementType: input.settlementType ?? "unlinked",
      contractId: input.contractId,
      customerId: input.customerId,
      vehicleId: input.vehicleId ?? null,
      createdBy: input.createdBy,
      sourceTable: "payments",
      sourceId: input.paymentId,
      description: input.notes ?? null,
    });
    return Number(result[0]?.insertId);
  } finally {
    release();
    if (paymentFinancialTransactionLocks.get(input.paymentId) === current)
      paymentFinancialTransactionLocks.delete(input.paymentId);
  }
}

async function reconcilePaymentFinancialTransaction(input: {
  paymentId: number;
  contractId: number;
  customerId: number;
  vehicleId?: number | null;
  amount: string;
  method: "cash" | "network" | "transfer" | "mixed";
  action: "update" | "delete";
  reason: string;
  createdBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const source = (
    await db
      .select()
      .from(financialTransactions)
      .where(
        and(
          eq(financialTransactions.sourceTable, "payments"),
          eq(financialTransactions.sourceId, input.paymentId)
        )
      )
      .limit(1)
  )[0];
  if (!source) return;
  if (source.approvalStatus === "pending") {
    await db
      .update(financialTransactions)
      .set(
        input.action === "update"
          ? {
              amount: input.amount,
              paymentMethod: input.method,
              contractId: input.contractId,
              customerId: input.customerId,
              vehicleId: input.vehicleId ?? null,
              description: input.reason,
            }
          : {
              approvalStatus: "rejected",
              rejectionReason: input.reason,
              approvedBy: input.createdBy ?? null,
              approvedAt: new Date(),
              description: input.reason,
            }
      )
      .where(eq(financialTransactions.id, source.id));
    return;
  }
  const link =
    input.action === "update"
      ? financialTransactions.correctionOfTransactionId
      : financialTransactions.reversalOfTransactionId;
  const existing = (
    await db
      .select({ id: financialTransactions.id })
      .from(financialTransactions)
      .where(eq(link, source.id))
      .limit(1)
  )[0];
  if (existing) return;
  await db.insert(financialTransactions).values({
    transactionType: "payment",
    approvalStatus: "pending",
    amount: input.action === "update" ? input.amount : source.amount,
    paymentMethod:
      input.action === "update" ? input.method : source.paymentMethod,
    settlementType: source.settlementType,
    contractId: input.contractId,
    customerId: input.customerId,
    vehicleId: input.vehicleId ?? source.vehicleId ?? null,
    createdBy: input.createdBy,
    originalTransactionId: source.originalTransactionId ?? source.id,
    [input.action === "update"
      ? "correctionOfTransactionId"
      : "reversalOfTransactionId"]: source.id,
    sourceTable: "financialTransactions",
    sourceId: source.id,
    description: input.reason,
  });
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  values.lastSignedIn = user.lastSignedIn ?? new Date();
  updateSet.lastSignedIn = values.lastSignedIn;
  if (user.role !== undefined || user.openId === ENV.ownerOpenId) {
    values.role = user.role ?? "admin";
    updateSet.role = values.role;
  }
  await db
    .insert(users)
    .values(values)
    .onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  return result[0];
}

export function hashLocalPassword(password: string) {
  return createHash("sha256").update(password).digest("hex");
}
export function hashEmailVerificationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export function isEmailVerificationTokenValid(
  expiresAt: Date | null | undefined,
  now = Date.now()
) {
  return Boolean(expiresAt && expiresAt.getTime() > now);
}

export async function getVerifiedUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const normalizedEmail = email.trim().toLowerCase();
  const result = await db
    .select({
      id: users.id,
      email: users.email,
      emailVerifiedAt: users.emailVerifiedAt,
      isActive: users.isActive,
    })
    .from(users)
    .where(
      and(
        sql`LOWER(${users.email}) = ${normalizedEmail}`,
        sql`${users.emailVerifiedAt} IS NOT NULL`,
        eq(users.isActive, true)
      )
    )
    .limit(1);
  return result[0];
}

export async function createEmailVerificationToken(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const user = (
    await db
      .select({ id: users.id, email: users.email, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
  )[0];
  if (!user || !user.isActive) throw new Error("الحساب غير موجود أو غير نشط");
  if (!user.email) throw new Error("أضف بريد المستخدم أولاً");
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db
    .update(users)
    .set({
      emailVerificationTokenHash: hashEmailVerificationToken(token),
      emailVerificationExpiresAt: expiresAt,
    })
    .where(eq(users.id, userId));
  return { token, expiresAt, email: user.email };
}

export async function verifyManagedUserEmail(token: string) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const hash = hashEmailVerificationToken(token);
  const user = (
    await db
      .select()
      .from(users)
      .where(eq(users.emailVerificationTokenHash, hash))
      .limit(1)
  )[0];
  if (
    !user ||
    !user.isActive ||
    !isEmailVerificationTokenValid(user.emailVerificationExpiresAt)
  )
    return null;
  await db
    .update(users)
    .set({
      emailVerifiedAt: new Date(),
      emailVerificationTokenHash: null,
      emailVerificationExpiresAt: null,
    })
    .where(eq(users.id, user.id));
  return { id: user.id, name: user.name, email: user.email };
}

export async function changeManagedUserPassword(
  userId: number,
  currentPassword: string,
  newPassword: string
) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const user = (
    await db
      .select({
        id: users.id,
        passwordHash: users.passwordHash,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
  )[0];
  if (
    !user ||
    !user.isActive ||
    !user.passwordHash ||
    user.passwordHash !== hashLocalPassword(currentPassword)
  )
    throw new Error("كلمة المرور الحالية غير صحيحة");
  await db
    .update(users)
    .set({
      passwordHash: hashLocalPassword(newPassword),
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
    })
    .where(eq(users.id, userId));
  return { success: true } as const;
}

export async function createPasswordResetToken(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const user = (
    await db
      .select({
        id: users.id,
        email: users.email,
        emailVerifiedAt: users.emailVerifiedAt,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
  )[0];
  if (!user || !user.isActive || !user.email || !user.emailVerifiedAt)
    throw new Error("يجب توثيق بريد الحساب أولاً");
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await db
    .update(users)
    .set({
      passwordResetTokenHash: hashEmailVerificationToken(token),
      passwordResetExpiresAt: expiresAt,
    })
    .where(eq(users.id, userId));
  return { token, expiresAt, email: user.email };
}

export async function clearPasswordResetToken(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(users)
    .set({ passwordResetTokenHash: null, passwordResetExpiresAt: null })
    .where(eq(users.id, userId));
}

export async function resetManagedUserPassword(
  token: string,
  newPassword: string
) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const hash = hashEmailVerificationToken(token);
  const result = await db
    .update(users)
    .set({
      passwordHash: hashLocalPassword(newPassword),
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
    })
    .where(
      and(
        eq(users.passwordResetTokenHash, hash),
        eq(users.isActive, true),
        sql`${users.passwordResetExpiresAt} > ${new Date()}`
      )
    );
  return Number(result[0]?.affectedRows ?? 0) === 1;
}

export async function listManagedUsers() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: users.id,
      openId: users.openId,
      name: users.name,
      email: users.email,
      username: users.username,
      role: users.role,
      isActive: users.isActive,
      permissions: users.permissions,
      emailVerifiedAt: users.emailVerifiedAt,
      createdAt: users.createdAt,
      lastSignedIn: users.lastSignedIn,
    })
    .from(users)
    .orderBy(desc(users.createdAt));
}

export async function getUserByUsername(username: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  return result[0];
}

export async function createManagedUser(input: {
  username: string;
  password: string;
  name: string;
  email?: string;
  role: "user" | "admin";
  permissions: string[];
}) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const existing = await getUserByUsername(input.username);
  if (existing) throw new Error("اسم المستخدم مستخدم مسبقاً");
  await db.insert(users).values({
    openId: `local_user_${input.username}_${Date.now()}`,
    username: input.username,
    passwordHash: hashLocalPassword(input.password),
    name: input.name,
    email: input.email || null,
    loginMethod: "local",
    role: input.role,
    isActive: true,
    permissions: JSON.stringify(input.permissions),
    lastSignedIn: new Date(),
  });
  return getUserByUsername(input.username);
}

export async function updateManagedUser(input: {
  id: number;
  username?: string;
  name?: string;
  email?: string;
  password?: string;
  role?: "user" | "admin";
  isActive?: boolean;
  permissions?: string[];
}) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const values: Record<string, unknown> = {};
  if (input.username !== undefined) {
    const username = input.username.trim();
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.username, username), sql`${users.id} <> ${input.id}`))
      .limit(1);
    if (existing[0]) throw new Error("اسم المستخدم مستخدم مسبقاً");
    values.username = username;
  }
  if (input.name !== undefined) values.name = input.name;
  if (input.email !== undefined) {
    values.email = input.email || null;
    values.emailVerifiedAt = null;
    values.emailVerificationTokenHash = null;
    values.emailVerificationExpiresAt = null;
  }
  if (input.password) values.passwordHash = hashLocalPassword(input.password);
  if (input.role !== undefined) values.role = input.role;
  if (input.isActive !== undefined) values.isActive = input.isActive;
  if (input.permissions !== undefined)
    values.permissions = JSON.stringify(input.permissions);
  if (Object.keys(values).length)
    await db.update(users).set(values).where(eq(users.id, input.id));
  const result = await db
    .select({
      id: users.id,
      openId: users.openId,
      name: users.name,
      email: users.email,
      username: users.username,
      role: users.role,
      isActive: users.isActive,
      permissions: users.permissions,
      emailVerifiedAt: users.emailVerifiedAt,
      createdAt: users.createdAt,
      lastSignedIn: users.lastSignedIn,
    })
    .from(users)
    .where(eq(users.id, input.id))
    .limit(1);
  return result[0];
}

export async function deleteManagedUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const user = await db
    .select({ id: users.id, openId: users.openId, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user[0]) throw new Error("الحساب غير موجود");
  if (user[0].role === "admin" || user[0].openId === process.env.OWNER_OPEN_ID)
    throw new Error("لا يمكن حذف حساب المدير الرئيسي");
  const references = await db
    .select({ count: sql<number>`count(*)` })
    .from(contractOperations)
    .where(eq(contractOperations.createdBy, userId));
  const liabilities = await db
    .select({ count: sql<number>`count(*)` })
    .from(officeLiabilities)
    .where(
      or(
        eq(officeLiabilities.createdBy, userId),
        eq(officeLiabilities.approvedBy, userId)
      )
    );
  const edits = await db
    .select({ count: sql<number>`count(*)` })
    .from(siteContent)
    .where(eq(siteContent.updatedBy, userId));
  if (
    Number(references[0]?.count ?? 0) +
      Number(liabilities[0]?.count ?? 0) +
      Number(edits[0]?.count ?? 0) >
    0
  )
    throw new Error("لا يمكن حذف حساب لديه سجلات تشغيلية؛ عطّله بدلاً من حذفه");
  await db.delete(users).where(eq(users.id, userId));
  return { success: true } as const;
}

export async function listContracts(
  status?: "active" | "overdue" | "suspended" | "closed" | "returned"
) {
  const db = await getDb();
  if (!db) return [];
  await db
    .update(contracts)
    .set({ status: "overdue" })
    .where(
      and(
        eq(contracts.status, "active"),
        sql`${contracts.expectedReturnDate} < curdate()`
      )
    );
  const rows = await db
    .select({ contract: contracts, customer: customers, vehicle: vehicles })
    .from(contracts)
    .leftJoin(customers, eq(contracts.customerId, customers.id))
    .leftJoin(vehicles, eq(contracts.vehicleId, vehicles.id))
    .where(status ? eq(contracts.status, status) : undefined)
    .orderBy(desc(contracts.createdAt));
  const ids = rows.map(row => row.contract.id);
  const paymentRows = ids.length
    ? await db
        .select()
        .from(payments)
        .where(inArray(payments.contractId, ids))
        .orderBy(desc(payments.createdAt))
    : [];
  return rows.map(row => {
    const totals = calculateContractTotals({
      baseTotal: row.contract.totalAmount,
      expectedReturnDate: row.contract.expectedReturnDate,
      rentalAmount: row.contract.rentalAmount,
      previousDueAmount: Number(row.contract.totalAmount) - Number(row.contract.paidAmount),
      type: row.contract.type,
      contractScope: ("contractScope" in row.contract
        ? row.contract.contractScope
        : undefined) as
        | "domestic_limited"
        | "domestic_open"
        | "international"
        | undefined,
      days: ("days" in row.contract ? row.contract.days : undefined) as
        | number
        | undefined,
      actualReturnDate: row.contract.actualReturnDate,
    });
    const balances = calculateContractBalances({
      baseTotal: totals.baseTotal,
      delayTotal: totals.delayTotal,
      paidAmount: row.contract.paidAmount,
      excessMileageBalance: row.contract.excessMileageAmount,
    });
    return { ...row, totals, ...balances };
  });
}

export async function listAvailableVehicles() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(vehicles)
    .where(
      and(
        eq(vehicles.status, "available"),
        sql`not exists (select 1 from contracts c where c.vehicleId = ${vehicles.id} and c.contractStatus in ('active','overdue'))`,
        sql`not exists (select 1 from maintenanceRecords m where m.vehicleId = ${vehicles.id} and m.status in ('pending','in_progress'))`,
        sql`not exists (select 1 from vehicleReadiness vr1 where vr1.vehicleId = ${vehicles.id} and vr1.state <> 'ready' and vr1.changedAt = (select max(vr2.changedAt) from vehicleReadiness vr2 where vr2.vehicleId = vehicles.id))`
      )
    )
    .orderBy(vehicles.make, vehicles.model);
}

export async function getVehicleReadiness(vehicleId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const row = (
    await db
      .select()
      .from(vehicleReadiness)
      .where(eq(vehicleReadiness.vehicleId, vehicleId))
      .orderBy(desc(vehicleReadiness.changedAt))
      .limit(1)
  )[0];
  return row ?? { vehicleId, state: "ready" as const, blockedReason: null, notes: null, changedAt: null };
}

export async function setVehicleReadiness(input: {
  vehicleId: number;
  state: "returned" | "cleaning" | "qc" | "ready" | "blocked";
  blockedReason?: string;
  notes?: string;
  changedBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const vehicle = (await db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.id, input.vehicleId)).limit(1))[0];
  if (!vehicle) throw new Error("السيارة غير موجودة");
  const blockedReason = input.blockedReason?.trim();
  if (input.state === "blocked" && !blockedReason) throw new Error("سبب منع السيارة مطلوب");
  const result = await db.insert(vehicleReadiness).values({
    vehicleId: input.vehicleId,
    state: input.state,
    blockedReason: input.state === "blocked" ? blockedReason : null,
    notes: input.notes?.trim() || null,
    changedBy: input.changedBy,
  });
  return (await db.select().from(vehicleReadiness).where(eq(vehicleReadiness.id, Number(result[0]?.insertId))).limit(1))[0];
}

export async function getVehicleReadinessHistory(vehicleId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(vehicleReadiness).where(eq(vehicleReadiness.vehicleId, vehicleId)).orderBy(desc(vehicleReadiness.changedAt));
}

export async function getFleetReadiness() {
  const db = await getDb();
  if (!db) return [];
  const [fleet, history] = await Promise.all([
    db.select().from(vehicles).orderBy(vehicles.make, vehicles.model),
    db.select().from(vehicleReadiness).orderBy(desc(vehicleReadiness.changedAt)),
  ]);
  const latest = new Map<number, (typeof history)[number]>();
  history.forEach(row => {
    if (!latest.has(row.vehicleId)) latest.set(row.vehicleId, row);
  });
  return fleet.map(vehicle => ({
    vehicle,
    readiness: latest.get(vehicle.id) ?? { vehicleId: vehicle.id, state: "ready" as const, blockedReason: null, notes: null, changedAt: null },
  }));
}

export async function checkVehicleAvailability(input: {
  vehicleId: number;
  requestedStart: Date;
  requestedEnd: Date;
  excludeContractId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (!isValidRentalPeriod(input.requestedStart, input.requestedEnd))
    throw new Error("يجب أن يكون وقت بداية التأجير قبل وقت نهايته");

  const vehicleQuery = db
    .select()
    .from(vehicles)
    .where(eq(vehicles.id, input.vehicleId))
    .limit(1)
    .for("update");
  const vehicleRows = await vehicleQuery;
  const vehicle = vehicleRows[0];
  if (!vehicle)
    return { available: false as const, reason: "vehicle_not_found" as const };
  if (
    vehicle.status !== "available" &&
    !(vehicle.status === "rented" && input.excludeContractId !== undefined)
  )
    return { available: false as const, reason: "vehicle_status" as const };

  const contractQuery = db
    .select({
      id: contracts.id,
      startDate: contracts.startDate,
      expectedReturnDate: contracts.expectedReturnDate,
    })
    .from(contracts)
    .where(
      and(
        eq(contracts.vehicleId, input.vehicleId),
        sql`${contracts.status} in ('active','overdue')`,
        input.excludeContractId !== undefined
          ? sql`${contracts.id} <> ${input.excludeContractId}`
          : undefined
      )
    )
    .for("update");
  const contractRows = await contractQuery;
  const conflictingContract = contractRows.find(contract =>
    hasRentalPeriodOverlap(
      new Date(contract.startDate),
      new Date(contract.expectedReturnDate),
      input.requestedStart,
      input.requestedEnd
    )
  );
  if (conflictingContract)
    return {
      available: false as const,
      reason: "contract_overlap" as const,
      conflictingContractId: conflictingContract.id,
    };

  const maintenanceQuery = db
    .select({
      id: maintenanceRecords.id,
      startDate: maintenanceRecords.startDate,
      endDate: maintenanceRecords.endDate,
    })
    .from(maintenanceRecords)
    .where(
      and(
        eq(maintenanceRecords.vehicleId, input.vehicleId),
        sql`${maintenanceRecords.status} in ('pending','in_progress')`
      )
    )
    .for("update");
  const maintenanceRows = await maintenanceQuery;
  const conflictingMaintenance = maintenanceRows.find(maintenance =>
    hasRentalPeriodOverlap(
      new Date(maintenance.startDate),
      maintenance.endDate
        ? new Date(maintenance.endDate)
        : new Date("9999-12-31T23:59:59.999Z"),
      input.requestedStart,
      input.requestedEnd
    )
  );
  if (conflictingMaintenance)
    return {
      available: false as const,
      reason: "maintenance_overlap" as const,
      conflictingMaintenanceId: conflictingMaintenance.id,
    };
  return { available: true as const };
}

export async function getContractDetails(contractId: number) {
  const db = await getDb();
  if (!db) return null;
  const [contractRow, paymentRows, operationRows] = await Promise.all([
    db
      .select({ contract: contracts, customer: customers, vehicle: vehicles })
      .from(contracts)
      .leftJoin(customers, eq(contracts.customerId, customers.id))
      .leftJoin(vehicles, eq(contracts.vehicleId, vehicles.id))
      .where(eq(contracts.id, contractId))
      .limit(1),
    db
      .select()
      .from(payments)
      .where(eq(payments.contractId, contractId))
      .orderBy(desc(payments.createdAt)),
    db
      .select()
      .from(contractOperations)
      .where(eq(contractOperations.contractId, contractId))
      .orderBy(desc(contractOperations.createdAt)),
  ]);
  if (!contractRow[0]) return null;
  const vehicleIds = Array.from(
    new Set(
      operationRows
        .flatMap(operation => [
          operation.vehicleId,
          operation.previousVehicleId,
        ])
        .filter((id): id is number => typeof id === "number")
    )
  );
  const creatorIds = Array.from(
    new Set(
      operationRows
        .map(operation => operation.createdBy)
        .filter((id): id is number => typeof id === "number")
    )
  );
  const [operationVehicles, creators] = await Promise.all([
    vehicleIds.length
      ? db.select().from(vehicles).where(inArray(vehicles.id, vehicleIds))
      : Promise.resolve([]),
    creatorIds.length
      ? db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(inArray(users.id, creatorIds))
      : Promise.resolve([]),
  ]);
  const vehicleById = new Map(
    operationVehicles.map(vehicle => [vehicle.id, vehicle])
  );
  const creatorById = new Map(
    creators.map(creator => [creator.id, creator.name])
  );
  const operations = operationRows.map(operation => ({
    ...operation,
    createdByName: operation.createdBy
      ? (creatorById.get(operation.createdBy) ?? "مستخدم النظام")
      : "—",
    previousVehicle: operation.previousVehicleId
      ? (vehicleById.get(operation.previousVehicleId) ?? null)
      : null,
    currentVehicle: operation.vehicleId
      ? (vehicleById.get(operation.vehicleId) ?? null)
      : null,
  }));
  return { ...contractRow[0], payments: paymentRows, operations };
}

export async function searchCustomerLedger(query: string) {
  const db = await getDb();
  if (!db || !query.trim()) return [];
  const normalizedQuery = query.trim();
  const match = `%${normalizedQuery}%`;
  const contractRows = await db
    .select({ customer: customers, contract: contracts })
    .from(customers)
    .leftJoin(contracts, eq(contracts.customerId, customers.id))
    .where(
      or(
        like(customers.fullName, match),
        eq(customers.identityNumber, normalizedQuery),
        eq(customers.phone, normalizedQuery),
        eq(customers.phoneSecondary, normalizedQuery),
        like(contracts.contractNumber, match)
      )
    )
    .orderBy(desc(customers.createdAt));
  const contractIds = Array.from(
    new Set(
      contractRows
        .map(row => row.contract?.id)
        .filter((id): id is number => typeof id === "number")
    )
  );
  if (!contractIds.length)
    return contractRows.map(row => ({
      ...row,
      payment: null,
      operation: null,
    }));
  const [paymentRows, operationRows] = await Promise.all([
    db
      .select()
      .from(payments)
      .where(inArray(payments.contractId, contractIds))
      .orderBy(desc(payments.createdAt)),
    db
      .select()
      .from(contractOperations)
      .where(inArray(contractOperations.contractId, contractIds))
      .orderBy(desc(contractOperations.createdAt)),
  ]);
  const customerByContract = new Map(
    contractRows
      .filter(row => row.contract)
      .map(row => [row.contract!.id, row.customer])
  );
  const contractById = new Map(
    contractRows
      .filter(row => row.contract)
      .map(row => [row.contract!.id, row.contract])
  );
  const ledgerRows: Array<{
    customer: typeof customers.$inferSelect | null;
    contract: typeof contracts.$inferSelect | null;
    payment: typeof payments.$inferSelect | null;
    operation: typeof contractOperations.$inferSelect | null;
  }> = [];
  for (const contractId of contractIds) {
    const customer = customerByContract.get(contractId) ?? null;
    const contract = contractById.get(contractId) ?? null;
    const contractPayments = paymentRows.filter(
      row => row.contractId === contractId
    );
    const contractOperationsRows = operationRows.filter(
      row => row.contractId === contractId
    );
    for (const payment of contractPayments)
      ledgerRows.push({ customer, contract, payment, operation: null });
    for (const operation of contractOperationsRows)
      ledgerRows.push({ customer, contract, payment: null, operation });
    if (!contractPayments.length && !contractOperationsRows.length)
      ledgerRows.push({ customer, contract, payment: null, operation: null });
  }
  return ledgerRows.sort((a, b) => {
    const aTime =
      a.payment?.createdAt ??
      a.operation?.createdAt ??
      a.contract?.createdAt ??
      new Date(0);
    const bTime =
      b.payment?.createdAt ??
      b.operation?.createdAt ??
      b.contract?.createdAt ??
      new Date(0);
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });
}

export async function getDashboardSummary() {
  const db = await getDb();
  if (!db)
    return {
      activeContracts: 0,
      overdueContracts: 0,
      externalActiveContracts: 0,
      externalOverdueContracts: 0,
      suspendedContracts: 0,
      availableVehicles: 0,
      totalVehicles: 0,
      rentedVehicles: 0,
      outstandingAmount: "0.00",
      previousOutstanding: "0.00",
      delayOutstanding: "0.00",
      currentOutstanding: "0.00",
      grandOutstanding: "0.00",
      maintenanceVehicles: 0,
      oilDueVehicles: 0,
      expiringDocuments: 0,
      todayPayments: "0.00",
      todayPaymentDetails: [],
    };
  await db
    .update(contracts)
    .set({ status: "overdue" })
    .where(
      and(
        eq(contracts.status, "active"),
        sql`${contracts.expectedReturnDate} < curdate()`
      )
    );
  const [
    active,
    overdue,
    externalActive,
    externalOverdue,
    suspended,
    available,
    totalVehicles,
    rentedVehicles,
    outstanding,
    maintenance,
    oilDue,
    expiringDocuments,
  ] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(contracts)
      .where(eq(contracts.status, "active")),
    db
      .select({ count: sql<number>`count(*)` })
      .from(contracts)
      .where(eq(contracts.status, "overdue")),
    db
      .select({ count: sql<number>`count(*)` })
      .from(contracts)
      .where(
        and(
          eq(contracts.status, "active"),
          inArray(contracts.contractScope, ["domestic_open", "international"])
        )
      ),
    db
      .select({ count: sql<number>`count(*)` })
      .from(contracts)
      .where(
        and(
          eq(contracts.status, "overdue"),
          inArray(contracts.contractScope, ["domestic_open", "international"])
        )
      ),
    db
      .select({ count: sql<number>`count(*)` })
      .from(contracts)
      .where(eq(contracts.status, "suspended")),
    db
      .select({ count: sql<number>`count(*)` })
      .from(vehicles)
      .where(eq(vehicles.status, "available")),
    db.select({ count: sql<number>`count(*)` }).from(vehicles),
    db
      .select({ count: sql<number>`count(*)` })
      .from(vehicles)
      .where(inArray(vehicles.status, ["rented", "reserved"])),
    db
      .select({
        amount: sql<string>`coalesce(sum(${contracts.totalAmount} - ${contracts.paidAmount}), 0)`,
      })
      .from(contracts)
      .where(
        and(
          inArray(contracts.status, ["active", "overdue"]),
          sql`${contracts.totalAmount} > ${contracts.paidAmount}`
        )
      ),
    db
      .select({ count: sql<number>`count(*)` })
      .from(vehicles)
      .where(eq(vehicles.status, "maintenance")),
    db
      .select({ count: sql<number>`count(*)` })
      .from(vehicles)
      .where(
        sql`${vehicles.lastOilChangeMileage} is not null and ${vehicles.mileage} >= ${vehicles.lastOilChangeMileage} + ${vehicles.oilChangeInterval}`
      ),
    db
      .select({ count: sql<number>`count(*)` })
      .from(vehicles)
      .where(
        or(
          sql`${vehicles.insuranceExpiryDate} <= date_add(curdate(), interval 30 day)`,
          sql`${vehicles.inspectionExpiryDate} <= date_add(curdate(), interval 30 day)`,
          sql`${vehicles.registrationExpiryDate} <= date_add(curdate(), interval 30 day)`
        )
      ),
  ]);
  const financialRows = await db
    .select({ contract: contracts })
    .from(contracts)
    .where(inArray(contracts.status, ["active", "overdue"]));
  const breakdown = calculateDashboardOutstandingBreakdown(
    financialRows.map(({ contract }) => ({
      totalAmount: contract.totalAmount,
      expectedReturnDate: contract.expectedReturnDate,
      rentalAmount: contract.rentalAmount,
      previousDueAmount: Number(contract.totalAmount) - Number(contract.paidAmount),
      type: contract.type,
      contractScope: contract.contractScope ?? undefined,
      days: contract.days,
      actualReturnDate: contract.actualReturnDate,
      paidAmount: contract.paidAmount,
      excessMileageAmount: contract.excessMileageAmount,
    }))
  );
  const financialReport = await getFinancialReportingReadModel();
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const todayEffectivePayments = financialReport.transactions.filter(
    row =>
      row.transactionType === "payment" &&
      row.transactionDate >= dayStart &&
      row.transactionDate < dayEnd
  );
  const todayVehicleIds = todayEffectivePayments
    .map(row => row.vehicleId)
    .filter((id): id is number => id !== null);
  const todayVehicles = todayVehicleIds.length
    ? await db
        .select({ id: vehicles.id, plateNumber: vehicles.plateNumber })
        .from(vehicles)
        .where(inArray(vehicles.id, todayVehicleIds))
    : [];
  const plateByVehicleId = new Map(
    todayVehicles.map(vehicle => [vehicle.id, vehicle.plateNumber])
  );
  const todayAmount = todayEffectivePayments.reduce(
    (sum, row) =>
      sum + Number(row.amount) * (row.reversalOfTransactionId ? -1 : 1),
    0
  );
  return {
    activeContracts: Number(active[0]?.count ?? 0),
    overdueContracts: Number(overdue[0]?.count ?? 0),
    externalActiveContracts: Number(externalActive[0]?.count ?? 0),
    externalOverdueContracts: Number(externalOverdue[0]?.count ?? 0),
    suspendedContracts: Number(suspended[0]?.count ?? 0),
    availableVehicles: Number(available[0]?.count ?? 0),
    totalVehicles: Number(totalVehicles[0]?.count ?? 0),
    rentedVehicles: Number(rentedVehicles[0]?.count ?? 0),
    outstandingAmount: breakdown.grandOutstanding,
    previousOutstanding: breakdown.previousOutstanding,
    delayOutstanding: breakdown.delayOutstanding,
    currentOutstanding: breakdown.currentOutstanding,
    grandOutstanding: breakdown.grandOutstanding,
    maintenanceVehicles: Number(maintenance[0]?.count ?? 0),
    oilDueVehicles: Number(oilDue[0]?.count ?? 0),
    expiringDocuments: Number(expiringDocuments[0]?.count ?? 0),
    todayPayments: todayAmount.toFixed(2),
    todayPaymentDetails: todayEffectivePayments.map(payment => ({
      amount: (
        Number(payment.amount) * (payment.reversalOfTransactionId ? -1 : 1)
      ).toFixed(2),
      method: payment.paymentMethod,
      plateNumber:
        payment.vehicleId === null
          ? "غير معروف"
          : (plateByVehicleId.get(payment.vehicleId) ?? "غير معروف"),
      createdAt: payment.transactionDate,
    })),
  };
}

export async function createCustomer(input: {
  identityNumber: string;
  fullName: string;
  phone: string;
  phoneSecondary?: string;
  email?: string;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const identityNumber = input.identityNumber.trim();
  const fullName = input.fullName.trim();
  const phone = input.phone.trim();
  const phoneSecondary = input.phoneSecondary?.trim() || undefined;
  if (!identityNumber || !fullName || !phone)
    throw new Error("الهوية والاسم ورقم الجوال مطلوبة");
  const phoneValues = [phone, phoneSecondary].filter((value): value is string =>
    Boolean(value)
  );
  const duplicate = await db
    .select({ id: customers.id, fullName: customers.fullName })
    .from(customers)
    .where(
      or(
        eq(customers.identityNumber, identityNumber),
        ...phoneValues.flatMap(value => [
          eq(customers.phone, value),
          eq(customers.phoneSecondary, value),
        ])
      )
    )
    .limit(1);
  if (duplicate[0])
    throw new Error(
      `العميل مسجل مسبقاً باسم ${duplicate[0].fullName}; استخدم السجل الموجود بدلاً من تسجيله مرة أخرى`
    );
  const blocked = await db
    .select({
      id: blockedCustomers.id,
      fullName: blockedCustomers.fullName,
      reason: blockedCustomers.reason,
    })
    .from(blockedCustomers)
    .where(
      and(
        eq(blockedCustomers.isActive, true),
        or(
          eq(blockedCustomers.identityNumber, identityNumber),
          ...phoneValues.map(value => eq(blockedCustomers.phone, value))
        )
      )
    )
    .limit(1);
  if (blocked[0])
    throw new Error(
      `لا يمكن تسجيل العميل لأنه محظور: ${blocked[0].reason || "يوجد سجل حظر فعال"}`
    );
  const result = await db
    .insert(customers)
    .values({ ...input, identityNumber, fullName, phone, phoneSecondary });
  return result[0]?.insertId;
}

export async function updateCustomer(input: {
  id: number;
  identityNumber?: string;
  fullName?: string;
  phone?: string;
  phoneSecondary?: string | null;
  email?: string | null;
  notes?: string | null;
  reason: string;
  updatedBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (!input.reason.trim()) throw new Error("سبب تعديل العميل مطلوب");
  const existing = await db
    .select()
    .from(customers)
    .where(eq(customers.id, input.id))
    .limit(1);
  const customer = existing[0];
  if (!customer) throw new Error("العميل غير موجود");
  const values: Record<string, unknown> = {};
  for (const key of [
    "identityNumber",
    "fullName",
    "phone",
    "phoneSecondary",
    "email",
    "notes",
  ] as const)
    if (input[key] !== undefined) values[key] = input[key];
  await db.update(customers).set(values).where(eq(customers.id, input.id));
  await db.insert(deletionAudits).values({
    entityType: "customer_edit",
    entityId: input.id,
    snapshot: JSON.stringify({ before: customer, after: values }),
    reason: input.reason.trim(),
    deletedBy: input.updatedBy,
  });
  return { success: true as const };
}

export async function deleteCustomerSafely(input: {
  id: number;
  reason: string;
  deletedBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (!input.reason.trim()) throw new Error("سبب حذف العميل مطلوب");
  const existing = await db
    .select()
    .from(customers)
    .where(eq(customers.id, input.id))
    .limit(1);
  const customer = existing[0];
  if (!customer) throw new Error("العميل غير موجود");
  const linked = await db
    .select({ id: contracts.id })
    .from(contracts)
    .where(eq(contracts.customerId, input.id))
    .limit(1);
  if (linked[0])
    throw new Error(
      "لا يمكن حذف عميل مرتبط بعقود؛ عدّل بياناته أو أرشفه بدلاً من الحذف"
    );
  await db.insert(deletionAudits).values({
    entityType: "customer",
    entityId: input.id,
    snapshot: JSON.stringify(customer),
    reason: input.reason.trim(),
    deletedBy: input.deletedBy,
  });
  await db.delete(customers).where(eq(customers.id, input.id));
  return { success: true as const };
}

export async function createMaintenance(input: {
  vehicleId: number;
  issueType: string;
  serviceType?: "maintenance" | "oil_change";
  mileage?: number;
  startDate: string;
  status?: "pending" | "in_progress";
  cost?: string;
  notes?: string;
}): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (!transactionContext.getStore())
    return runInTransaction(db, () => createMaintenance(input));
  await lockVehicleRow(input.vehicleId);
  const vehicle = await db
    .select({
      id: vehicles.id,
      status: vehicles.status,
      mileage: vehicles.mileage,
      plateNumber: vehicles.plateNumber,
    })
    .from(vehicles)
    .where(eq(vehicles.id, input.vehicleId))
    .limit(1);
  if (!vehicle[0]) throw new Error("السيارة غير موجودة");
  if (vehicle[0].status === "rented" || vehicle[0].status === "reserved")
    throw new Error(
      "لا يمكن تسجيل صيانة لسيارة مرتبطة بعقد ساري؛ أغلِق العقد أو بدّل السيارة أولاً"
    );
  if (
    input.mileage !== undefined &&
    (!Number.isInteger(input.mileage) || input.mileage < 0)
  )
    throw new Error("قراءة عداد الصيانة يجب أن تكون رقماً صحيحاً غير سالب");
  if (
    input.mileage !== undefined &&
    !isMileageAdvanceValid(vehicle[0].mileage, input.mileage)
  )
    throw new Error("قراءة عداد الصيانة لا يمكن أن تكون أقل من العداد الحالي");
  const recordedMileage = input.mileage ?? vehicle[0].mileage;
  const serviceType = input.serviceType ?? "maintenance";
  const status =
    serviceType === "oil_change" ? "completed" : (input.status ?? "pending");
  const result = await db.insert(maintenanceRecords).values({
    ...input,
    mileage: recordedMileage,
    serviceType,
    status,
    cost: input.cost ?? "0",
    startDate: new Date(input.startDate),
    endDate: status === "completed" ? new Date(input.startDate) : null,
  });
  await db
    .update(vehicles)
    .set(
      serviceType === "oil_change"
        ? {
            mileage: recordedMileage,
            lastOilChangeMileage: recordedMileage,
            lastOilChangeDate: new Date(input.startDate),
            status: "available",
          }
        : { mileage: recordedMileage, status: "maintenance" }
    )
    .where(eq(vehicles.id, input.vehicleId));
  const paidCost = Number(input.cost) || 0;
  if (paidCost > 0)
    await db.insert(officeLiabilities).values({
      category: "maintenance",
      description: `صيانة السيارة ${vehicle[0].plateNumber}`,
      amount: paidCost.toFixed(2),
      paidAmount: paidCost.toFixed(2),
      status: "paid",
      approvalStatus: "pending",
      expenseDate: new Date(input.startDate),
      vehicleId: input.vehicleId,
      expenseReason: input.issueType.trim(),
      notes: input.notes ?? null,
    });
  return result[0]?.insertId;
}

export async function updateMaintenance(input: {
  id: number;
  issueType?: string;
  mileage?: number;
  startDate?: string;
  cost?: string;
  notes?: string | null;
  reason: string;
  updatedBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (!input.reason.trim()) throw new Error("سبب تعديل الصيانة مطلوب");
  const existing = await db
    .select()
    .from(maintenanceRecords)
    .where(eq(maintenanceRecords.id, input.id))
    .limit(1);
  const record = existing[0];
  if (!record) throw new Error("سجل الصيانة غير موجود");
  const values: Record<string, unknown> = {};
  if (input.issueType !== undefined) values.issueType = input.issueType;
  if (input.mileage !== undefined) values.mileage = input.mileage;
  if (input.startDate !== undefined)
    values.startDate = new Date(input.startDate);
  if (input.cost !== undefined) values.cost = input.cost;
  if (input.notes !== undefined) values.notes = input.notes;
  await db
    .update(maintenanceRecords)
    .set(values)
    .where(eq(maintenanceRecords.id, input.id));
  await db.insert(deletionAudits).values({
    entityType: "maintenance_edit",
    entityId: input.id,
    snapshot: JSON.stringify({ before: record, after: values }),
    reason: input.reason.trim(),
    deletedBy: input.updatedBy,
  });
  return { success: true as const };
}

export async function deleteMaintenanceSafely(input: {
  id: number;
  reason: string;
  deletedBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (!input.reason.trim()) throw new Error("سبب حذف الصيانة مطلوب");
  const existing = await db
    .select()
    .from(maintenanceRecords)
    .where(eq(maintenanceRecords.id, input.id))
    .limit(1);
  const record = existing[0];
  if (!record) throw new Error("سجل الصيانة غير موجود");
  await db.insert(deletionAudits).values({
    entityType: "maintenance",
    entityId: input.id,
    snapshot: JSON.stringify(record),
    reason: input.reason.trim(),
    deletedBy: input.deletedBy,
  });
  await db
    .delete(maintenanceRecords)
    .where(eq(maintenanceRecords.id, input.id));
  const remaining = await db
    .select({ id: maintenanceRecords.id })
    .from(maintenanceRecords)
    .where(
      and(
        eq(maintenanceRecords.vehicleId, record.vehicleId),
        eq(maintenanceRecords.status, "in_progress")
      )
    )
    .limit(1);
  if (!remaining[0])
    await db
      .update(vehicles)
      .set({ status: "available" })
      .where(eq(vehicles.id, record.vehicleId));
  return { success: true as const };
}

export async function listMaintenance() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ maintenance: maintenanceRecords, vehicle: vehicles })
    .from(maintenanceRecords)
    .leftJoin(vehicles, eq(maintenanceRecords.vehicleId, vehicles.id))
    .orderBy(desc(maintenanceRecords.createdAt));
}

export async function listVehicles() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(vehicles).orderBy(vehicles.id);
}

export async function getVehicleDetails(vehicleId: number) {
  const db = await getDb();
  if (!db) return null;
  const [vehicleRows, contractRows, maintenanceRows, operationRows] =
    await Promise.all([
      db.select().from(vehicles).where(eq(vehicles.id, vehicleId)).limit(1),
      db
        .select({ contract: contracts, customer: customers })
        .from(contracts)
        .leftJoin(customers, eq(contracts.customerId, customers.id))
        .where(eq(contracts.vehicleId, vehicleId))
        .orderBy(desc(contracts.createdAt)),
      db
        .select()
        .from(maintenanceRecords)
        .where(eq(maintenanceRecords.vehicleId, vehicleId))
        .orderBy(desc(maintenanceRecords.createdAt)),
      db
        .select()
        .from(contractOperations)
        .where(
          or(
            eq(contractOperations.vehicleId, vehicleId),
            eq(contractOperations.previousVehicleId, vehicleId)
          )
        )
        .orderBy(desc(contractOperations.createdAt)),
    ]);
  if (!vehicleRows[0]) return null;
  return {
    vehicle: vehicleRows[0],
    contracts: contractRows,
    maintenance: maintenanceRows,
    operations: operationRows,
  };
}

export async function getCustomerDetails(customerId: number) {
  const db = await getDb();
  if (!db) return null;
  const [customerRows, contractRows] = await Promise.all([
    db.select().from(customers).where(eq(customers.id, customerId)).limit(1),
    db
      .select({ contract: contracts, vehicle: vehicles })
      .from(contracts)
      .leftJoin(vehicles, eq(contracts.vehicleId, vehicles.id))
      .where(eq(contracts.customerId, customerId))
      .orderBy(desc(contracts.createdAt)),
  ]);
  if (!customerRows[0]) return null;
  const contractIds = contractRows.map(row => row.contract.id);
  const [paymentRows, operationRows] = contractIds.length
    ? await Promise.all([
        db
          .select()
          .from(payments)
          .where(inArray(payments.contractId, contractIds))
          .orderBy(desc(payments.createdAt)),
        db
          .select()
          .from(contractOperations)
          .where(inArray(contractOperations.contractId, contractIds))
          .orderBy(desc(contractOperations.createdAt)),
      ])
    : [[], []];
  return {
    customer: customerRows[0],
    contracts: contractRows,
    payments: paymentRows,
    operations: operationRows,
  };
}

export async function listCustomers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(customers).orderBy(desc(customers.createdAt));
}

export async function listOpenVehicleNotes(vehicleId?: number) {
  const db = await getDb();
  if (!db) return [];
  const open = sql`${vehicleNotes.resolution} in ('open','not_repaired')`;
  return db
    .select({
      note: vehicleNotes,
      vehicle: vehicles,
      contract: contracts,
      customer: customers,
    })
    .from(vehicleNotes)
    .leftJoin(vehicles, eq(vehicleNotes.vehicleId, vehicles.id))
    .leftJoin(contracts, eq(vehicleNotes.sourceContractId, contracts.id))
    .leftJoin(customers, eq(vehicleNotes.sourceCustomerId, customers.id))
    .where(vehicleId ? and(eq(vehicleNotes.vehicleId, vehicleId), open) : open)
    .orderBy(desc(vehicleNotes.createdAt));
}

export async function generateMonthlyInstallments(
  contractId: number,
  contractStart: Date,
  months: number,
  monthlyRate: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (!Number.isInteger(months) || months <= 0)
    throw new Error("عدد أشهر الاستحقاق غير صحيح");
  const rate = Number(monthlyRate);
  if (!Number.isFinite(rate) || rate <= 0)
    throw new Error("قيمة الاستحقاق الشهري غير صحيحة");
  const rows = Array.from({ length: months }, (_, index) => {
    const cycleStart = new Date(contractStart.getTime() + index * 30 * 86400000);
    const cycleEnd = new Date(contractStart.getTime() + (index + 1) * 30 * 86400000);
    return {
      contractId,
      monthNumber: index + 1,
      cycleStart,
      cycleEnd,
      amount: rate.toFixed(2),
    };
  });
  await db
    .insert(monthlyInstallments)
    .values(rows)
    .onDuplicateKeyUpdate({
      set: { contractId: sql`${monthlyInstallments.contractId}` },
    });
  return getMonthlyInstallments(contractId);
}

export async function getMonthlyInstallments(contractId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(monthlyInstallments)
    .where(eq(monthlyInstallments.contractId, contractId))
    .orderBy(monthlyInstallments.monthNumber);
}

export async function allocatePaymentToMonth(
  contractId: number,
  monthNumber: number,
  amount: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const amountCents = Math.round(amount * 100);
  if (!Number.isInteger(monthNumber) || monthNumber <= 0 || amountCents <= 0)
    throw new Error("مبلغ أو رقم الشهر غير صحيح");
  return db.transaction(async tx => {
    const installment = (
      await tx
        .select()
        .from(monthlyInstallments)
        .where(
          and(
            eq(monthlyInstallments.contractId, contractId),
            eq(monthlyInstallments.monthNumber, monthNumber)
          )
        )
        .limit(1)
    )[0];
    if (!installment) throw new Error("استحقاق الشهر غير موجود");
    const dueCents = Math.round(Number(installment.amount) * 100);
    const paidCents = Math.round(Number(installment.paidAmount) * 100);
    if (paidCents + amountCents > dueCents)
      throw new Error("لا يمكن أن يتجاوز المدفوع قيمة الاستحقاق الشهري");
    const nextPaidCents = paidCents + amountCents;
    const status =
      nextPaidCents === dueCents
        ? "fully_paid"
        : nextPaidCents > 0
          ? "partially_paid"
          : "unpaid";
    await tx
      .update(monthlyInstallments)
      .set({ paidAmount: (nextPaidCents / 100).toFixed(2), status })
      .where(eq(monthlyInstallments.id, installment.id));
    return {
      ...installment,
      paidAmount: (nextPaidCents / 100).toFixed(2),
      status,
    };
  });
}

export async function backfillMonthlyInstallments(contractId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const contract = (
    await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1)
  )[0];
  if (!contract) throw new Error("العقد غير موجود");
  if (contract.type !== "monthly")
    throw new Error("الاستحقاقات الشهرية متاحة للعقود الشهرية فقط");
  const months = Math.max(1, Math.ceil(Number(contract.days) / 30));
  return generateMonthlyInstallments(
    contract.id,
    new Date(contract.startDate),
    months,
    contract.rentalAmount
  );
}

export async function createVehicleNote(input: {
  vehicleId: number;
  sourceContractId?: number;
  sourceCustomerId?: number;
  note: string;
  createdBy?: number;
  managerFollowUpRequired?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const note = input.note.trim();
  if (!note) throw new Error("نص ملاحظة السيارة مطلوب");
  const result = await db
    .insert(vehicleNotes)
    .values({
      ...input,
      note,
      managerFollowUpRequired: input.managerFollowUpRequired ?? false,
    });
  return Number(result[0]?.insertId);
}

export async function resolveVehicleNote(input: {
  id: number;
  resolution: "repaired" | "not_repaired" | "not_needed";
  resolutionReason: string;
  resolvedBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const resolutionReason = input.resolutionReason.trim();
  if (!resolutionReason) throw new Error("سبب معالجة ملاحظة السيارة مطلوب");
  await db
    .update(vehicleNotes)
    .set({
      resolution: input.resolution,
      resolutionReason,
      resolvedBy: input.resolvedBy,
      resolvedAt: new Date(),
      managerFollowUpRequired: input.resolution === "not_repaired",
      managerFollowUpAt:
        input.resolution === "not_repaired" ? new Date() : null,
    })
    .where(eq(vehicleNotes.id, input.id));
  return { success: true as const };
}

export async function recordContractOperation(input: {
  contractId?: number;
  contractNumber?: string;
  operation:
    | "new_contract"
    | "extension"
    | "payment"
    | "additional_fee"
    | "rate_update"
    | "vehicle_swap"
    | "suspend"
    | "close"
    | "return";
  vehicleId?: number;
  vehicleMileage?: number;
  odometerCorrectionReason?: string;
  requestId?: string;
  paymentException?: PaymentException;
  exceptionReason?: string;
  amount?: string;
  paymentMethod?: "cash" | "network" | "transfer" | "mixed";
  paymentCashAmount?: string;
  paymentNetworkAmount?: string;
  paymentFirstMethod?: "cash" | "network" | "transfer";
  paymentSecondMethod?: "cash" | "network" | "transfer";
  paymentFirstAmount?: string;
  paymentSecondAmount?: string;
  extensionDays?: number;
  extensionPaymentAmount?: string;
  extensionPaymentMethod?: "cash" | "network" | "transfer" | "mixed";
  extensionPaymentCashAmount?: string;
  extensionPaymentNetworkAmount?: string;
  followUpDate?: string;
  paymentReason?: string;
  details?: string;
  vehicleNote?: string;
  createdBy?: number;
}): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (!transactionContext.getStore())
    return runInTransaction(db, () => recordContractOperation(input));
  const reference = getContractReference(input);
  const lookup =
    reference?.kind === "contractNumber"
      ? eq(contracts.contractNumber, reference.value)
      : reference?.kind === "contractId"
        ? eq(contracts.id, reference.value)
        : undefined;
  if (!lookup) throw new Error("أدخل رقم العقد أولاً");
  const existing = await db.select().from(contracts).where(lookup).limit(1);
  const contract = existing[0];
  if (!contract)
    throw new Error(
      "العقد غير موجود في قاعدة البيانات؛ أنشئ العقد أولاً ثم نفّذ العملية"
    );
  const contractId = contract.id;
  await lockVehicleRows([contract.vehicleId, ...(input.vehicleId ? [input.vehicleId] : [])]);
  const operationLockKey = operationKey({
    contractId,
    operation: input.operation,
    vehicleId: input.vehicleId ?? contract.vehicleId,
    requestId: input.requestId,
  });
  const releaseOperationLock =
    await acquireContractOperationLock(operationLockKey);
  try {
    if (contract.status === "returned")
      throw new Error(
        "لا يمكن تنفيذ أي عملية: تم استرجاع العقد وإغلاقه نهائياً"
      );
    if (input.operation === "extension") {
      const effectiveExtensionDays = contract.type === "monthly" ? 30 : (input.extensionDays ?? 0);
      if (contract.type !== "monthly" && (!Number.isInteger(input.extensionDays) || (input.extensionDays ?? 0) <= 0)) {
        throw new Error("أدخل عدد أيام التمديد الصحيح للعقد اليومي");
      }
      const requestedEnd = extendReturnDate(
        contract.expectedReturnDate,
        effectiveExtensionDays
      );
      if (!requestedEnd || !isValidRentalPeriod(contract.startDate, requestedEnd))
        throw new Error("مدة التمديد غير صحيحة");
      const availability = await checkVehicleAvailability({
        vehicleId: contract.vehicleId,
        requestedStart: contract.startDate,
        requestedEnd,
        excludeContractId: contract.id,
      });
      if (!availability.available)
        throw new Error(
          availability.reason === "contract_overlap"
            ? "لا يمكن تمديد العقد بسبب تداخل عقد آخر"
            : availability.reason === "maintenance_overlap"
              ? "لا يمكن تمديد العقد بسبب تداخل صيانة"
              : "السيارة غير متاحة خلال فترة التمديد"
        );
    }
    if (input.operation === "vehicle_swap" && input.vehicleId) {
      const availability = await checkVehicleAvailability({
        vehicleId: input.vehicleId,
        requestedStart: contract.startDate,
        requestedEnd: contract.expectedReturnDate,
        excludeContractId: contract.id,
      });
      if (!availability.available)
        throw new Error(
          availability.reason === "contract_overlap"
            ? "السيارة البديلة غير متاحة خلال فترة العقد بسبب تداخل عقد آخر"
            : availability.reason === "maintenance_overlap"
              ? "السيارة البديلة غير متاحة بسبب تداخل صيانة"
              : "السيارة البديلة غير متاحة خلال فترة العقد"
        );
    }
    const priorOperations = await db
      .select({
        contractId: contractOperations.contractId,
        operation: contractOperations.operation,
        amount: contractOperations.amount,
        paymentMethod: contractOperations.paymentMethod,
        vehicleId: contractOperations.vehicleId,
        details: contractOperations.details,
      })
      .from(contractOperations)
      .where(eq(contractOperations.contractId, contractId))
      .limit(10000);
    const vehicleOperations = input.vehicleId
      ? await db
          .select({
            contractId: contractOperations.contractId,
            operation: contractOperations.operation,
            amount: contractOperations.amount,
            paymentMethod: contractOperations.paymentMethod,
            vehicleId: contractOperations.vehicleId,
            details: contractOperations.details,
          })
          .from(contractOperations)
          .where(eq(contractOperations.vehicleId, input.vehicleId))
          .limit(10000)
      : [];
    const candidateContractIds = Array.from(
      new Set(
        vehicleOperations
          .map(row => row.contractId)
          .filter(id => id !== contractId)
      )
    );
    const candidateContracts = candidateContractIds.length
      ? await db
          .select({ id: contracts.id, status: contracts.status })
          .from(contracts)
          .where(inArray(contracts.id, candidateContractIds))
          .limit(10000)
      : [];
    const statusByContractId = new Map(
      candidateContracts.map(row => [row.id, row.status])
    );
    const operationRecords = [
      ...priorOperations,
      ...vehicleOperations.filter(row => row.contractId !== contractId),
    ].map(row => ({
      ...row,
      contractStatus:
        row.contractId === contractId
          ? contract.status
          : statusByContractId.get(row.contractId),
    }));
    const duplicate = findDuplicateOperation(operationRecords, {
      contractId,
      operation: input.operation,
      amount: input.amount,
      paymentMethod: input.paymentMethod,
      vehicleId: input.vehicleId ?? contract.vehicleId,
      requestId: input.requestId,
    });
    const exception =
      input.operation === "payment" && input.paymentException
        ? validatePaymentException({
            exception: input.paymentException,
            reason: input.exceptionReason,
            contractStatus: contract.status,
            contractCreatedAt: contract.createdAt,
            hasContractNumber: Boolean(reference?.kind === "contractNumber"),
          })
        : { allowed: false as const, audit: "" };
    if (duplicate)
      throw new Error(
        `تم منع تكرار العملية ${input.operation} على العقد؛ العملية السابقة ما زالت مسجلة وفعالة`
      );
    if (input.paymentException && input.operation !== "payment")
      throw new Error("استثناءات السداد متاحة لعمليات الدفع فقط");
    if (
      requiresOdometerReading(input.operation) &&
      input.vehicleMileage === undefined
    )
      throw new Error("يجب إدخال العداد الحالي قبل تنفيذ هذه العملية");
    const effects = buildOperationEffects(input.operation, input.amount);
    if (
      input.operation === "suspend" &&
      !isFinanciallyDistressed({
        startDate: contract.startDate,
        unitRate: contract.rentalAmount,
        type: contract.type,
        paidAmount: contract.paidAmount,
      })
    )
      throw new Error(
        "لا يمكن تعليق العقد: الدفعات تغطي الإيجار المستحق حتى اليوم"
      );
    if (
      input.operation === "extension" &&
      (!input.extensionDays ||
        !Number.isInteger(input.extensionDays) ||
        input.extensionDays <= 0)
    )
      throw new Error("أدخل عدد أيام التمديد صحيحة");
    if (
      (input.operation === "additional_fee" ||
        input.operation === "rate_update") &&
      (!input.amount ||
        !Number.isFinite(Number(input.amount)) ||
        Number(input.amount) <= 0)
    )
      throw new Error(
        input.operation === "additional_fee"
          ? "أدخل قيمة الرسم الإضافي"
          : "أدخل سعر التأجير الجديد"
      );
    let previousVehicleId: number | undefined;
    let operationDetails = appendOperationAudit(input.details, {
      requestId: input.requestId,
      exceptionAudit: exception.audit,
    });
    const paymentSettlementType =
      input.paymentException === "suspended_contract"
        ? "suspended_contract"
        : input.paymentException === "previous_contract"
          ? "previous_contract"
          : input.paymentException === "justified_non_suspended"
            ? "non_suspended_contract"
            : "unlinked";
    const operationAt = new Date();
    let statusAfterPayment: "active" | "overdue" | null = null;
    let mileageChargeAmount = 0;
    let extensionPaymentAllocation: ReturnType<typeof allocatePayment> | null =
      null;
    const extensionPaymentTotal =
      input.operation === "extension"
        ? Number(input.extensionPaymentAmount ?? 0)
        : 0;
    if (
      input.operation === "extension" &&
      extensionPaymentTotal > 0 &&
      input.extensionPaymentMethod === "mixed" &&
      (Number(input.extensionPaymentCashAmount) <= 0 ||
        Number(input.extensionPaymentNetworkAmount) <= 0 ||
        Number(input.extensionPaymentCashAmount) +
          Number(input.extensionPaymentNetworkAmount) !==
          extensionPaymentTotal)
    )
      throw new Error("يجب أن يساوي مجموع كاش وشبكة دفعة التمديد مبلغ الدفعة");
    if (input.operation === "extension") {
      const extensionTotals = calculateContractTotals({
        baseTotal: contract.totalAmount,
        expectedReturnDate: contract.expectedReturnDate,
        rentalAmount: contract.rentalAmount,
        previousDueAmount: Number(contract.totalAmount) - Number(contract.paidAmount),
        type: contract.type,
        contractScope: ("contractScope" in contract
          ? contract.contractScope
          : undefined) as
          | "domestic_limited"
          | "domestic_open"
          | "international"
          | undefined,
        days: ("days" in contract ? contract.days : undefined) as
          | number
          | undefined,
        actualReturnDate: operationAt,
      });
      const extensionBalances = calculateContractBalances({
        baseTotal: extensionTotals.baseTotal,
        delayTotal: extensionTotals.delayTotal,
        paidAmount: contract.paidAmount,
        excessMileageBalance: contract.excessMileageAmount,
      });
      if (
        Number(extensionBalances.grandOutstanding) > 0 &&
        extensionPaymentTotal < Number(extensionBalances.grandOutstanding)
      )
        throw new Error(
          `لا يمكن تمديد العقد قبل سداد المتأخرات. المتبقي السابق ${extensionBalances.previousOutstanding} ر.س؛ الحالي ${extensionBalances.currentOutstanding} ر.س؛ الإجمالي المطلوب للسداد ${extensionBalances.grandOutstanding} ر.س`
        );
      if (extensionPaymentTotal > 0) {
        extensionPaymentAllocation = allocatePayment({
          paymentAmount: extensionPaymentTotal,
          previousOutstanding: Number(extensionBalances.previousOutstanding),
          currentOutstanding: Number(extensionBalances.currentOutstanding),
          excessMileageOutstanding: Number(
            extensionBalances.excessMileageOutstanding
          ),
        });
        operationDetails = `دفعة مع التمديد: السابق ${extensionPaymentAllocation.appliedToPrevious.toFixed(2)} ر.س؛ الحالي ${extensionPaymentAllocation.appliedToCurrent.toFixed(2)} ر.س؛ الكيلومترات ${extensionPaymentAllocation.appliedToExcessMileage.toFixed(2)} ر.س${extensionPaymentAllocation.unapplied > 0 ? `؛ رصيد زائد ${extensionPaymentAllocation.unapplied.toFixed(2)} ر.س` : ""}`;
      }
    }
    let suspensionSettlement:
      | ReturnType<typeof calculateSuspensionSettlement>
      | undefined;
    if (input.operation === "suspend") {
      suspensionSettlement = calculateSuspensionSettlement({
        baseTotal: contract.totalAmount,
        expectedReturnDate: contract.expectedReturnDate,
        suspendedAt: operationAt,
        rentalAmount: contract.rentalAmount,
        type: contract.type,
        contractScope: ("contractScope" in contract
          ? contract.contractScope
          : undefined) as
          | "domestic_limited"
          | "domestic_open"
          | "international"
          | undefined,
        days: ("days" in contract ? contract.days : undefined) as
          | number
          | undefined,
        paidAmount: contract.paidAmount,
        excessMileageBalance:
          Number(contract.excessMileageAmount ?? 0) + mileageChargeAmount,
      });
      if (!input.followUpDate)
        throw new Error("حدد التاريخ المتوقع للسداد أو إعادة التواصل");
      operationDetails = `تسوية التعليق حتى ${operationAt}: خصم الأيام غير المستخدمة ${suspensionSettlement.remainingDays} يوم بقيمة ${suspensionSettlement.unusedValue} ر.س؛ المستحق حتى التعليق ${suspensionSettlement.amountDueThroughSuspension} ر.س؛ المتبقي السابق ${suspensionSettlement.balances.previousOutstanding} ر.س؛ المتبقي الحالي ${suspensionSettlement.balances.currentOutstanding} ر.س؛ موعد المتابعة ${input.followUpDate}${input.details ? `؛ ${input.details}` : ""}`;
    }
    const otherRevenuePayment =
      input.operation === "payment" &&
      isOtherRevenueReason(input.paymentReason);
    if (input.operation === "payment" && input.amount) {
      if (
        input.paymentMethod === "mixed" &&
        (() => {
          const firstAmount = Number(
            input.paymentFirstAmount ?? input.paymentCashAmount
          );
          const secondAmount = Number(
            input.paymentSecondAmount ?? input.paymentNetworkAmount
          );
          return (
            !Number.isFinite(firstAmount) ||
            !Number.isFinite(secondAmount) ||
            firstAmount <= 0 ||
            secondAmount <= 0 ||
            firstAmount + secondAmount !== Number(input.amount)
          );
        })()
      )
        throw new Error("يجب أن يساوي مجموع الكاش والشبكة مبلغ الدفعة");
      const reasonLabel = input.paymentReason
        ? (paymentReasonLabels[
            input.paymentReason as keyof typeof paymentReasonLabels
          ] ?? input.paymentReason)
        : undefined;
      const totals = calculateContractTotals({
        baseTotal: contract.totalAmount,
        expectedReturnDate: contract.expectedReturnDate,
        rentalAmount: contract.rentalAmount,
        previousDueAmount: Number(contract.totalAmount) - Number(contract.paidAmount),
        type: contract.type,
        contractScope: ("contractScope" in contract
          ? contract.contractScope
          : undefined) as
          | "domestic_limited"
          | "domestic_open"
          | "international"
          | undefined,
        days: ("days" in contract ? contract.days : undefined) as
          | number
          | undefined,
        actualReturnDate: contract.actualReturnDate,
      });
      const balances = calculateContractBalances({
        baseTotal: totals.baseTotal,
        delayTotal: totals.delayTotal,
        paidAmount: contract.paidAmount,
        excessMileageBalance: contract.excessMileageAmount,
      });
      const allocation = otherRevenuePayment
        ? null
        : allocatePayment({
            paymentAmount: Number(input.amount),
            previousOutstanding: Number(balances.previousOutstanding),
            currentOutstanding: Number(balances.currentOutstanding),
            excessMileageOutstanding: Number(balances.excessMileageOutstanding),
          });
      const allocationNote = allocation
        ? `تخصيص الدفعة: السابق ${allocation.appliedToPrevious.toFixed(2)} ر.س؛ الحالي ${allocation.appliedToCurrent.toFixed(2)} ر.س؛ الكيلومترات ${allocation.appliedToExcessMileage.toFixed(2)} ر.س${allocation.unapplied > 0 ? `؛ رصيد زائد ${allocation.unapplied.toFixed(2)} ر.س` : ""}`
        : "إيراد آخر مستقل؛ لا يخصم من المتبقي أو التأخير";
      operationDetails = [
        operationDetails,
        reasonLabel ? `سبب الدفعة: ${reasonLabel}` : undefined,
        allocationNote,
        input.paymentMethod === "mixed"
          ? `دفع مختلط: ${input.paymentFirstMethod ?? "cash"} ${Number(input.paymentFirstAmount ?? input.paymentCashAmount).toFixed(2)} ر.س؛ ${input.paymentSecondMethod ?? "network"} ${Number(input.paymentSecondAmount ?? input.paymentNetworkAmount).toFixed(2)} ر.س`
          : undefined,
      ]
        .filter(Boolean)
        .join("؛ ");
      if (!otherRevenuePayment) {
        statusAfterPayment = statusAfterSuspendedSettlement({
          status: contract.status,
          outstanding: Math.max(
            0,
            Number(balances.grandOutstanding) - Number(input.amount)
          ),
          expectedReturnDate: contract.expectedReturnDate,
          now: operationAt,
        });
        if (statusAfterPayment)
          operationDetails = `${operationDetails}؛ ستتم مراجعة حالة العقد بعد اعتماد الدفعة (${statusAfterPayment === "active" ? "ساري" : "متأخر"})`;
      }
    }
    if (input.vehicleMileage !== undefined) {
      if (!Number.isInteger(input.vehicleMileage) || input.vehicleMileage < 0)
        throw new Error("قراءة العداد يجب أن تكون رقماً صحيحاً غير سالب");
      const targetVehicleId = contract.vehicleId;
      if (targetVehicleId) {
        const currentVehicle = await db
          .select({ mileage: vehicles.mileage })
          .from(vehicles)
          .where(eq(vehicles.id, targetVehicleId))
          .limit(1);
        const odometer = validateOdometerReading({
          reading: input.vehicleMileage,
          documentedReadings: await getDocumentedOdometerReadings(
            targetVehicleId,
            currentVehicle[0]?.mileage
          ),
          correctionReason: input.odometerCorrectionReason,
        });
        await db
          .update(vehicles)
          .set({ mileage: input.vehicleMileage })
          .where(eq(vehicles.id, targetVehicleId));
        operationDetails = `${operationDetails ? `${operationDetails}؛ ` : ""}قراءة العداد: ${input.vehicleMileage.toLocaleString()} كم؛ الفرق عن آخر قراءة موثقة: ${odometer.difference.toLocaleString()} كم${odometer.corrected ? `؛ تصحيح موثق: ${input.odometerCorrectionReason!.trim()}` : ""}`;
        if (["vehicle_swap", "close", "return", "suspend"].includes(input.operation)) {
          const scope =
            contract.contractScope === "domestic_limited"
              ? "internal"
              : contract.contractScope === "international"
                ? "international"
                : "domestic";
          const mileage = calculateMileageCharge({
            startMileage: contract.startMileage,
            endMileage: input.vehicleMileage,
            rentalDays: contract.days,
            scope,
          });
          mileageChargeAmount = Number(mileage.amount);
          if (mileageChargeAmount > 0) {
            const nextMileageBalance =
              Number(contract.excessMileageAmount ?? 0) + mileageChargeAmount;
            await db
              .update(contracts)
              .set({ excessMileageAmount: nextMileageBalance.toFixed(2) })
              .where(eq(contracts.id, contractId));
            operationDetails = `${operationDetails}؛ المسافة المستخدمة ${calculateOdometerDistance(contract.startMileage, input.vehicleMileage)} كم؛ كيلومترات زائدة ${mileage.excess} كم × ${mileage.rate.toFixed(2)} ر.س = ${mileage.amount} ر.س`;
          }
        }
      }
    }
    if (input.operation === "suspend" && mileageChargeAmount > 0) {
      suspensionSettlement = calculateSuspensionSettlement({
        baseTotal: contract.totalAmount,
        expectedReturnDate: contract.expectedReturnDate,
        suspendedAt: operationAt,
        rentalAmount: contract.rentalAmount,
        type: contract.type,
        contractScope: ("contractScope" in contract
          ? contract.contractScope
          : undefined) as
          | "domestic_limited"
          | "domestic_open"
          | "international"
          | undefined,
        days: ("days" in contract ? contract.days : undefined) as
          | number
          | undefined,
        paidAmount: contract.paidAmount,
        excessMileageBalance:
          Number(contract.excessMileageAmount ?? 0) + mileageChargeAmount,
      });
      operationDetails = `تسوية التعليق حتى ${operationAt}: خصم الأيام غير المستخدمة ${suspensionSettlement.remainingDays} يوم بقيمة ${suspensionSettlement.unusedValue} ر.س؛ المستحق حتى التعليق ${suspensionSettlement.amountDueThroughSuspension} ر.س؛ المتبقي السابق ${suspensionSettlement.balances.previousOutstanding} ر.س؛ المتبقي الحالي ${suspensionSettlement.balances.currentOutstanding} ر.س؛ الكيلومترات ${suspensionSettlement.balances.excessMileageOutstanding} ر.س؛ موعد المتابعة ${input.followUpDate}${input.details ? `؛ ${input.details}` : ""}`;
    }
    if (input.operation === "additional_fee") {
      if (contract.contractScope !== "international")
        throw new Error("رسوم التفويض الدولي متاحة للعقد الخارجي الدولي فقط");
      const fee = Number(input.amount);
      const previousFees = await db
        .select({ createdAt: contractOperations.createdAt })
        .from(contractOperations)
        .where(
          and(
            eq(contractOperations.contractId, contractId),
            eq(contractOperations.operation, "additional_fee")
          )
        );
      const alreadyChargedThisMonth = previousFees.some(row => {
        const date = new Date(row.createdAt);
        return (
          date.getFullYear() === operationAt.getFullYear() &&
          date.getMonth() === operationAt.getMonth()
        );
      });
      if (
        !canChargeMonthlyAuthorizationFee(
          contract.contractScope,
          contract.type,
          alreadyChargedThisMonth
        )
      )
        throw new Error(
          "تم تسجيل رسم التفويض الدولي لهذا العقد خلال هذا الشهر أو أن نوع العقد لا يسمح به"
        );
      operationDetails = `رسوم تفويض دولي: ${fee.toFixed(2)}${input.details ? `؛ ${input.details}` : ""}`;
      await db
        .update(contracts)
        .set({ totalAmount: addAdditionalFee(contract.totalAmount, fee) })
        .where(eq(contracts.id, contractId));
    }
    if (input.operation === "rate_update") {
      const nextRate = Number(input.amount);
      const previousRate = Number(contract.rentalAmount);
      const nextTotal = calculateRateAdjustedTotal({
        currentTotal: contract.totalAmount,
        currentRate: previousRate,
        nextRate,
        days: contract.days,
        type: contract.type,
      });
      operationDetails = `تعديل سعر التأجير: ${previousRate.toFixed(2)} ← ${nextRate.toFixed(2)}${input.details ? `؛ ${input.details}` : ""}`;
      await db
        .update(contracts)
        .set({ rentalAmount: nextRate.toFixed(2), totalAmount: nextTotal })
        .where(eq(contracts.id, contractId));
    }
    if (input.operation === "vehicle_swap") {
      if (
        contract.contractScope === "international" &&
        (!input.amount ||
          !Number.isFinite(Number(input.amount)) ||
          Number(input.amount) <= 0)
      )
        throw new Error(
          "أدخل قيمة رسم التفويض الدولي الجديد عند تبديل سيارة العقد الدولي"
        );
      let replacementIsAvailable = false;
      if (input.vehicleId) {
        const replacement = await db
          .select()
          .from(vehicles)
          .where(
            and(
              eq(vehicles.id, input.vehicleId),
              eq(vehicles.status, "available")
            )
          )
          .limit(1);
        replacementIsAvailable = Boolean(replacement[0]);
      }
      const swapTotals = calculateContractTotals({
        baseTotal: contract.totalAmount,
        expectedReturnDate: contract.expectedReturnDate,
        rentalAmount: contract.rentalAmount,
        previousDueAmount: Number(contract.totalAmount) - Number(contract.paidAmount),
        type: contract.type,
        contractScope: ("contractScope" in contract
          ? contract.contractScope
          : undefined) as
          | "domestic_limited"
          | "domestic_open"
          | "international"
          | undefined,
        days: ("days" in contract ? contract.days : undefined) as
          | number
          | undefined,
        actualReturnDate: contract.actualReturnDate,
      });
      const swapBalances = calculateContractBalances({
        baseTotal: swapTotals.baseTotal,
        delayTotal: swapTotals.delayTotal,
        paidAmount: contract.paidAmount,
        excessMileageBalance: contract.excessMileageAmount,
      });
      const swapThreshold = canSwapVehicleByThreshold({
        contractTotal: contract.totalAmount,
        previousOutstanding: swapBalances.previousOutstanding,
        currentOutstanding: swapBalances.currentOutstanding,
        excessMileageOutstanding: swapBalances.excessMileageOutstanding,
        includeExcessMileage: true,
      });
      if (!swapThreshold.allowed) throw new Error(swapThreshold.reason);
      const swapValidation = validateVehicleSwap(
        contract.vehicleId,
        input.vehicleId,
        replacementIsAvailable
      );
      if (!swapValidation.ok) throw new Error(swapValidation.reason);
      previousVehicleId = contract.vehicleId;
      const totals = calculateContractTotals({
        baseTotal: contract.totalAmount,
        expectedReturnDate: contract.expectedReturnDate,
        rentalAmount: contract.rentalAmount,
        previousDueAmount: Number(contract.totalAmount) - Number(contract.paidAmount),
        type: contract.type,
        contractScope: ("contractScope" in contract
          ? contract.contractScope
          : undefined) as
          | "domestic_limited"
          | "domestic_open"
          | "international"
          | undefined,
        days: ("days" in contract ? contract.days : undefined) as
          | number
          | undefined,
        actualReturnDate: contract.actualReturnDate,
      });
      const balances = calculateContractBalances({
        baseTotal: totals.baseTotal,
        delayTotal: totals.delayTotal,
        paidAmount: contract.paidAmount,
        excessMileageBalance: contract.excessMileageAmount,
      });
      operationDetails = `تبديل السيارة: ${contract.vehicleId} ← ${input.vehicleId}؛ نقل الحسابات: المدفوع ${Number(contract.paidAmount).toFixed(2)} ر.س، السابق ${balances.previousOutstanding} ر.س، التأخير ${balances.currentOutstanding} ر.س، الإجمالي ${balances.grandOutstanding} ر.س${contract.contractScope === "international" ? `؛ رسم تفويض دولي جديد ${Number(input.amount).toFixed(2)} ر.س` : ""}${input.details ? `؛ ${input.details}` : ""}`;
    }
    let returnSettlement:
      | ReturnType<typeof calculateReturnSettlement>
      | undefined;
    let closeSettlement:
      | ReturnType<typeof calculateCloseSettlement>
      | undefined;
    if (input.operation === "close") {
      closeSettlement = calculateCloseSettlement({
        baseTotal: contract.totalAmount,
        expectedReturnDate: contract.expectedReturnDate,
        closedAt: operationAt,
        rentalAmount: contract.rentalAmount,
        type: contract.type,
        contractScope: ("contractScope" in contract
          ? contract.contractScope
          : undefined) as
          | "domestic_limited"
          | "domestic_open"
          | "international"
          | undefined,
        days: ("days" in contract ? contract.days : undefined) as
          | number
          | undefined,
        paidAmount: contract.paidAmount,
        excessMileageBalance:
          Number(contract.excessMileageAmount ?? 0) + mileageChargeAmount,
      });
      operationDetails = `تسوية الإغلاق حتى ${operationAt}: المستحق حتى يوم الإغلاق ${closeSettlement.amountDueThroughClose} ر.س؛ الأيام غير المستخدمة ${closeSettlement.remainingDays} يوم بقيمة ${closeSettlement.unusedValue} ر.س؛ الرصيد السابق ${closeSettlement.balances.previousOutstanding} ر.س؛ الرصيد الحالي ${closeSettlement.balances.currentOutstanding} ر.س${closeSettlement.shouldRecordReturn ? `؛ رصيد دائن للعميل ${closeSettlement.customerCredit} ر.س؛ رُحّلت السيارة إلى سجل الاسترجاعات` : ""}${input.details ? `؛ ${input.details}` : ""}`;
      if (
        !closeSettlement.canClose ||
        Number(closeSettlement.balances.grandOutstanding) > 0
      )
        throw new Error(
          `لا يمكن إغلاق العقد: يوجد مبلغ غير مسدد قدره ${closeSettlement.balances.grandOutstanding} ر.س. سجّل الدفعة أولاً أو علّق العقد.`
        );
    }
    if (input.operation === "return") {
      const returnTotals = calculateContractTotals({
        baseTotal: contract.totalAmount,
        expectedReturnDate: contract.expectedReturnDate,
        rentalAmount: contract.rentalAmount,
        previousDueAmount: Number(contract.totalAmount) - Number(contract.paidAmount),
        type: contract.type,
        contractScope: ("contractScope" in contract
          ? contract.contractScope
          : undefined) as
          | "domestic_limited"
          | "domestic_open"
          | "international"
          | undefined,
        days: ("days" in contract ? contract.days : undefined) as
          | number
          | undefined,
        actualReturnDate: operationAt,
      });
      const returnBalances = calculateContractBalances({
        baseTotal: returnTotals.baseTotal,
        delayTotal: returnTotals.delayTotal,
        paidAmount: contract.paidAmount,
        excessMileageBalance:
          Number(contract.excessMileageAmount ?? 0) + mileageChargeAmount,
      });
      if (Number(returnBalances.grandOutstanding) > 0)
        throw new Error(
          `لا يمكن استرجاع العقد: يوجد مبلغ غير مسدد قدره ${returnBalances.grandOutstanding} ر.س. سجّل الدفعة أولاً أو علّق العقد.`
        );
      returnSettlement = calculateReturnSettlement({
        expectedReturnDate: contract.expectedReturnDate,
        returnedAt: operationAt,
        rentalAmount: contract.rentalAmount,
        type: contract.type,
      });
      operationDetails = `استرجاع مبكر: الأيام المتبقية ${returnSettlement.remainingDays} يوم × ${returnSettlement.dailyRate} ر.س = ${returnSettlement.remainingValue} ر.س؛ المتبقي السابق ${returnBalances.previousOutstanding} ر.س؛ المتبقي الحالي ${returnBalances.currentOutstanding} ر.س${input.details ? `؛ ${input.details}` : ""}`;
    }
    const operationToPersist =
      input.operation === "close" && closeSettlement?.shouldRecordReturn
        ? "return"
        : input.operation;
    const operationVehicleId =
      input.operation === "close" || input.operation === "return"
        ? contract.vehicleId
        : input.vehicleId;
    await db.insert(contractOperations).values({
      contractId,
      operation: operationToPersist,
      vehicleId: operationVehicleId,
      previousVehicleId,
      amount:
        input.operation === "close" && closeSettlement?.shouldRecordReturn
          ? closeSettlement.customerCredit
          : (input.amount ?? "0"),
      paymentMethod:
        input.paymentMethod === "mixed" ? undefined : input.paymentMethod,
      details: operationDetails,
      createdBy: input.createdBy,
    });
    if (
      ["close", "return"].includes(input.operation) &&
      input.vehicleNote?.trim()
    ) {
      await db.insert(vehicleNotes).values({
        vehicleId: contract.vehicleId,
        sourceContractId: contract.id,
        sourceCustomerId: contract.customerId,
        note: input.vehicleNote.trim(),
        createdBy: input.createdBy ?? null,
        managerFollowUpRequired: true,
      });
    }
    if (
      input.operation === "vehicle_swap" &&
      contract.contractScope === "international"
    ) {
      const fee = Number(input.amount);
      await db.insert(contractOperations).values({
        contractId,
        operation: "additional_fee",
        vehicleId: input.vehicleId,
        amount: fee.toFixed(2),
        details:
          `رسم تفويض دولي جديد بسبب تبديل السيارة؛ ${input.details ?? ""}`.trim(),
        createdBy: input.createdBy,
      });
      await db
        .update(contracts)
        .set({ totalAmount: (Number(contract.totalAmount) + fee).toFixed(2) })
        .where(eq(contracts.id, contractId));
    }
    if (effects.shouldCreatePayment && input.amount) {
      if (input.paymentMethod === "mixed") {
        const firstMethod = input.paymentFirstMethod ?? "cash";
        const firstAmount = input.paymentFirstAmount ?? input.paymentCashAmount;
        const secondMethod = input.paymentSecondMethod ?? "network";
        const secondAmount =
          input.paymentSecondAmount ?? input.paymentNetworkAmount;
        for (const entry of [
          { method: firstMethod, amount: firstAmount },
          { method: secondMethod, amount: secondAmount },
        ]) {
          if (Number(entry.amount) <= 0) continue;
          const normalizedAmount = Number(entry.amount).toFixed(2);
          const payment = await db.insert(payments).values({
            contractId,
            customerId: contract.customerId,
            amount: normalizedAmount,
            method: entry.method,
            notes: operationDetails,
            approvalStatus: "pending",
            settlementType: paymentSettlementType,
            paymentReason: input.exceptionReason ?? input.paymentReason,
          });
          await createPaymentFinancialTransaction({
            paymentId: Number(payment[0]?.insertId),
            contractId,
            customerId: contract.customerId,
            vehicleId: contract.vehicleId,
            amount: normalizedAmount,
            method: entry.method,
            settlementType: paymentSettlementType,
            notes: operationDetails,
            createdBy: input.createdBy,
          });
        }
      } else {
        const method = input.paymentMethod ?? "cash";
        const payment = await db.insert(payments).values({
          contractId,
          customerId: contract.customerId,
          amount: input.amount,
          method,
          notes: operationDetails,
          approvalStatus: "pending",
          settlementType: paymentSettlementType,
          paymentReason: input.exceptionReason ?? input.paymentReason,
        });
        await createPaymentFinancialTransaction({
          paymentId: Number(payment[0]?.insertId),
          contractId,
          customerId: contract.customerId,
          vehicleId: contract.vehicleId,
          amount: input.amount,
          method,
          settlementType: paymentSettlementType,
          notes: operationDetails,
          createdBy: input.createdBy,
        });
      }
    }
    if (input.operation === "extension" && extensionPaymentTotal > 0) {
      const extensionCycleStart =
        contract.type === "monthly"
          ? new Date(new Date(contract.expectedReturnDate).getTime() + 86400000)
              .toISOString()
              .slice(0, 10)
          : undefined;
      const extensionCycleEnd =
        contract.type === "monthly"
          ? new Date(
              new Date(contract.expectedReturnDate).getTime() +
                30 * 86400000
            )
              .toISOString()
              .slice(0, 10)
          : undefined;
      const extensionPaymentReason =
        extensionCycleStart && extensionCycleEnd
          ? `monthly_cycle:${extensionCycleStart}:${extensionCycleEnd}`
          : undefined;
      if (input.extensionPaymentMethod === "mixed") {
        if (Number(input.extensionPaymentCashAmount) > 0) {
          const payment = await db.insert(payments).values({
            contractId,
            customerId: contract.customerId,
            amount: Number(input.extensionPaymentCashAmount).toFixed(2),
            method: "cash",
            notes: operationDetails,
            settlementType: "non_suspended_contract",
            paymentReason: extensionPaymentReason,
          });
          await createPaymentFinancialTransaction({
            paymentId: Number(payment[0]?.insertId),
            contractId,
            customerId: contract.customerId,
            vehicleId: contract.vehicleId,
            amount: Number(input.extensionPaymentCashAmount).toFixed(2),
            method: "cash",
            notes: operationDetails,
            createdBy: input.createdBy,
          });
        }
        if (Number(input.extensionPaymentNetworkAmount) > 0) {
          const payment = await db.insert(payments).values({
            contractId,
            customerId: contract.customerId,
            amount: Number(input.extensionPaymentNetworkAmount).toFixed(2),
            method: "network",
            notes: operationDetails,
            settlementType: "non_suspended_contract",
            paymentReason: extensionPaymentReason,
          });
          await createPaymentFinancialTransaction({
            paymentId: Number(payment[0]?.insertId),
            contractId,
            customerId: contract.customerId,
            vehicleId: contract.vehicleId,
            amount: Number(input.extensionPaymentNetworkAmount).toFixed(2),
            method: "network",
            notes: operationDetails,
            createdBy: input.createdBy,
          });
        }
      } else {
        const method = input.extensionPaymentMethod ?? "cash";
        const payment = await db.insert(payments).values({
          contractId,
          customerId: contract.customerId,
          amount: extensionPaymentTotal.toFixed(2),
          method,
          notes: operationDetails,
          settlementType: "non_suspended_contract",
          paymentReason: extensionPaymentReason,
        });
        await createPaymentFinancialTransaction({
          paymentId: Number(payment[0]?.insertId),
          contractId,
          customerId: contract.customerId,
          vehicleId: contract.vehicleId,
          amount: extensionPaymentTotal.toFixed(2),
          method,
          notes: operationDetails,
          createdBy: input.createdBy,
        });
      }
    }
    if (input.operation === "extension") {
      const nextReturn = extendReturnDate(
        contract.expectedReturnDate,
        contract.type === "monthly" ? 30 : (input.extensionDays ?? 0)
      );
      if (!nextReturn) throw new Error("مدة التمديد غير صحيحة");
      await db
        .update(contracts)
        .set({ expectedReturnDate: nextReturn })
        .where(eq(contracts.id, contractId));
    }
    if (input.operation === "vehicle_swap") {
      if (
        contract.contractScope === "international" &&
        (!input.amount ||
          !Number.isFinite(Number(input.amount)) ||
          Number(input.amount) <= 0)
      )
        throw new Error(
          "أدخل قيمة رسم التفويض الدولي الجديد عند تبديل سيارة العقد الدولي"
        );
      let replacementIsAvailable = false;
      if (input.vehicleId) {
        const replacement = await db
          .select()
          .from(vehicles)
          .where(
            and(
              eq(vehicles.id, input.vehicleId),
              eq(vehicles.status, "available")
            )
          )
          .limit(1);
        replacementIsAvailable = Boolean(replacement[0]);
      }
      const swapValidation = validateVehicleSwap(
        contract.vehicleId,
        input.vehicleId,
        replacementIsAvailable
      );
      if (!swapValidation.ok) throw new Error(swapValidation.reason);
      await db
        .update(vehicles)
        .set({ status: "available" })
        .where(eq(vehicles.id, contract.vehicleId));
      await db
        .update(vehicles)
        .set({ status: "rented" })
        .where(eq(vehicles.id, input.vehicleId!));
      await db
        .update(contracts)
        .set({ vehicleId: input.vehicleId })
        .where(eq(contracts.id, contractId));
    }
    if (input.operation === "suspend" && suspensionSettlement)
      await db
        .update(contracts)
        .set({
          totalAmount: suspensionSettlement.adjustedBase,
          suspensionFollowUpDate: new Date(
            `${input.followUpDate}T00:00:00.000Z`
          ),
        })
        .where(eq(contracts.id, contractId));
    if (input.operation === "return" && returnSettlement) {
      const adjustedTotal = Math.max(
        0,
        Number(contract.totalAmount) - Number(returnSettlement.remainingValue)
      );
      await db
        .update(contracts)
        .set({
          totalAmount: adjustedTotal.toFixed(2),
          status: "returned",
          actualReturnDate: operationAt,
        })
        .where(eq(contracts.id, contractId));
    }
    if (input.operation === "close" && closeSettlement)
      await db
        .update(contracts)
        .set({
          totalAmount: closeSettlement.adjustedBase,
          actualReturnDate: operationAt,
          status: closeSettlement.shouldRecordReturn ? "returned" : "closed",
        })
        .where(eq(contracts.id, contractId));
    if (
      effects.contractStatus &&
      !(input.operation === "close" && closeSettlement?.shouldRecordReturn)
    )
      await db
        .update(contracts)
        .set({ status: effects.contractStatus })
        .where(eq(contracts.id, contractId));
    if (effects.releasesVehicle)
      await db
        .update(vehicles)
        .set({ status: "available" })
        .where(eq(vehicles.id, contract.vehicleId));
    if (input.operation === "return")
      await db
        .update(contracts)
        .set({ status: "returned", actualReturnDate: new Date() })
        .where(eq(contracts.id, contractId));
  } finally {
    releaseOperationLock();
  }
}

export async function updateMaintenanceStatus(
  id: number,
  status: "pending" | "in_progress" | "completed" | "written_off",
  vehicleId: number,
  updatedBy?: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const existing = await db
    .select()
    .from(maintenanceRecords)
    .where(eq(maintenanceRecords.id, id))
    .limit(1);
  const item = existing[0];
  if (!item) throw new Error("سجل الصيانة غير موجود");
  const endDate =
    status === "completed" || status === "written_off" ? new Date() : null;
  const nextVehicleStatus =
    status === "completed"
      ? "available"
      : status === "written_off"
        ? "unavailable"
        : "maintenance";
  await db
    .update(maintenanceRecords)
    .set({ status, endDate })
    .where(eq(maintenanceRecords.id, id));
  await db
    .update(vehicles)
    .set({ status: nextVehicleStatus })
    .where(eq(vehicles.id, vehicleId));
  await db.insert(deletionAudits).values({
    entityType: "maintenance_status",
    entityId: id,
    snapshot: JSON.stringify({
      before: item,
      after: { status, endDate, vehicleId, vehicleStatus: nextVehicleStatus },
    }),
    reason: "تغيير حالة الصيانة",
    deletedBy: updatedBy,
  });
  return { success: true as const };
}

export async function createVehicle(input: {
  plateNumber: string;
  make: string;
  model: string;
  modelYear: number;
  dailyRate: string;
  monthlyRate: string;
  mileage?: number;
  lastOilChangeMileage?: number;
  lastOilChangeDate?: string;
  oilChangeInterval?: number;
  insuranceExpiryDate?: string;
  inspectionExpiryDate?: string;
  registrationExpiryDate?: string;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(vehicles).values({
    ...input,
    lastOilChangeDate: input.lastOilChangeDate
      ? new Date(input.lastOilChangeDate)
      : null,
    insuranceExpiryDate: input.insuranceExpiryDate
      ? new Date(input.insuranceExpiryDate)
      : null,
    inspectionExpiryDate: input.inspectionExpiryDate
      ? new Date(input.inspectionExpiryDate)
      : null,
    registrationExpiryDate: input.registrationExpiryDate
      ? new Date(input.registrationExpiryDate)
      : null,
  });
  return result[0]?.insertId;
}

export async function updateVehicle(
  id: number,
  input: {
    mileage?: number;
    lastOilChangeMileage?: number;
    lastOilChangeDate?: string;
    oilChangeInterval?: number;
    insuranceExpiryDate?: string;
    inspectionExpiryDate?: string;
    registrationExpiryDate?: string;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (
    input.mileage !== undefined &&
    (!Number.isInteger(input.mileage) || input.mileage < 0)
  )
    throw new Error("قراءة العداد يجب أن تكون رقماً صحيحاً غير سالب");
  if (
    input.lastOilChangeMileage !== undefined &&
    (!Number.isInteger(input.lastOilChangeMileage) ||
      input.lastOilChangeMileage < 0)
  )
    throw new Error("عداد تغيير الزيت غير صحيح");
  if (
    input.oilChangeInterval !== undefined &&
    (!Number.isInteger(input.oilChangeInterval) || input.oilChangeInterval <= 0)
  )
    throw new Error("فترة تغيير الزيت يجب أن تكون رقماً صحيحاً أكبر من صفر");
  if (input.mileage !== undefined) {
    const current = await db
      .select({ mileage: vehicles.mileage })
      .from(vehicles)
      .where(eq(vehicles.id, id))
      .limit(1);
    if (!current[0]) throw new Error("السيارة غير موجودة");
    if (!isMileageAdvanceValid(current[0].mileage, input.mileage))
      throw new Error(
        "قراءة العداد الجديدة لا يمكن أن تكون أقل من القراءة الحالية"
      );
  }
  await db
    .update(vehicles)
    .set({
      ...input,
      lastOilChangeDate: input.lastOilChangeDate
        ? new Date(input.lastOilChangeDate)
        : input.lastOilChangeDate === ""
          ? null
          : undefined,
      insuranceExpiryDate: input.insuranceExpiryDate
        ? new Date(input.insuranceExpiryDate)
        : input.insuranceExpiryDate === ""
          ? null
          : undefined,
      inspectionExpiryDate: input.inspectionExpiryDate
        ? new Date(input.inspectionExpiryDate)
        : input.inspectionExpiryDate === ""
          ? null
          : undefined,
      registrationExpiryDate: input.registrationExpiryDate
        ? new Date(input.registrationExpiryDate)
        : input.registrationExpiryDate === ""
          ? null
          : undefined,
    })
    .where(eq(vehicles.id, id));
}

export async function deleteVehicle(id: number, deletedBy?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [vehicleRows, contractRows, maintenanceRows] = await Promise.all([
    db.select().from(vehicles).where(eq(vehicles.id, id)).limit(1),
    db
      .select({ id: contracts.id })
      .from(contracts)
      .where(eq(contracts.vehicleId, id))
      .limit(1),
    db
      .select({ id: maintenanceRecords.id })
      .from(maintenanceRecords)
      .where(eq(maintenanceRecords.vehicleId, id))
      .limit(1),
  ]);
  if (!vehicleRows[0]) throw new Error("السيارة غير موجودة أو تم حذفها مسبقاً");
  if (contractRows[0])
    throw new Error(
      "لا يمكن حذف السيارة لوجود عقود مرتبطة بها؛ احتفظ بها في السجل التاريخي"
    );
  if (maintenanceRows[0])
    throw new Error(
      "لا يمكن حذف السيارة لوجود سجل صيانة مرتبط بها؛ احتفظ بها في السجل التاريخي"
    );
  await db.insert(deletionAudits).values({
    entityType: "vehicle",
    entityId: id,
    snapshot: JSON.stringify(vehicleRows[0]),
    reason: "حذف سيارة بلا سجلات تشغيلية",
    deletedBy,
  });
  await db.delete(vehicles).where(eq(vehicles.id, id));
  return { success: true };
}
export async function listContractOperations(contractId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(contractOperations)
    .where(eq(contractOperations.contractId, contractId))
    .orderBy(desc(contractOperations.createdAt));
}

export async function listAllContractOperations(
  filters: { from?: string; to?: string } = {}
) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters.from)
    conditions.push(
      sql`${contractOperations.createdAt} >= ${new Date(`${filters.from}T00:00:00.000`)}`
    );
  if (filters.to) {
    const nextDay = new Date(`${filters.to}T00:00:00.000`);
    nextDay.setDate(nextDay.getDate() + 1);
    conditions.push(sql`${contractOperations.createdAt} < ${nextDay}`);
  }
  return db
    .select({
      operation: contractOperations,
      contract: contracts,
      customer: customers,
      vehicle: vehicles,
      operator: users,
    })
    .from(contractOperations)
    .leftJoin(contracts, eq(contractOperations.contractId, contracts.id))
    .leftJoin(customers, eq(contracts.customerId, customers.id))
    .leftJoin(vehicles, eq(contractOperations.vehicleId, vehicles.id))
    .leftJoin(users, eq(contractOperations.createdBy, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(contractOperations.createdAt));
}

export async function listPayments() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ payment: payments, contract: contracts, customer: customers })
    .from(payments)
    .leftJoin(contracts, eq(payments.contractId, contracts.id))
    .leftJoin(customers, eq(payments.customerId, customers.id))
    .orderBy(desc(payments.createdAt));
}

export async function listReturns() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      operation: contractOperations,
      contract: contracts,
      vehicle: vehicles,
      customer: customers,
    })
    .from(contractOperations)
    .innerJoin(contracts, eq(contractOperations.contractId, contracts.id))
    .leftJoin(vehicles, eq(contractOperations.vehicleId, vehicles.id))
    .leftJoin(customers, eq(contracts.customerId, customers.id))
    .where(eq(contractOperations.operation, "return"))
    .orderBy(desc(contractOperations.createdAt));
}

export async function getPaymentForReceipt(paymentId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ payment: payments, contract: contracts, customer: customers })
    .from(payments)
    .leftJoin(contracts, eq(payments.contractId, contracts.id))
    .leftJoin(customers, eq(payments.customerId, customers.id))
    .where(eq(payments.id, paymentId))
    .limit(1);
  return rows[0] ?? null;
}

export async function nextContractNumber() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const rows = await db
    .select({ contractNumber: contracts.contractNumber })
    .from(contracts);
  return computeNextContractNumber(rows.map(row => row.contractNumber));
}

export async function createContract(input: {
  contractNumber?: string;
  customerId: number;
  vehicleId: number;
  vehicleMileage: number;
  odometerCorrectionReason?: string;
  oilOverrideAcknowledged?: boolean;
  vehicleNoteResolution?: "repaired" | "not_repaired" | "not_needed";
  type: "daily" | "monthly";
  contractScope?: "domestic_limited" | "domestic_open" | "international";
  startDate: string;
  expectedReturnDate: string;
  rentalAmount: string;
  days: number;
  totalAmount: string;
  paidAmount?: string;
  initialCashAmount?: string;
  initialNetworkAmount?: string;
  notes?: string;
  createdBy?: number;
}): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (!transactionContext.getStore())
    return runInTransaction(db, () => createContract(input));
  const customerRows = await db
    .select()
    .from(customers)
    .where(eq(customers.id, input.customerId))
    .limit(1);
  const customer = customerRows[0];
  if (!customer) throw new Error("العميل غير موجود؛ اختر عميلاً مسجلاً أولاً");
  const blockedByIdentity = await db
    .select({ id: blockedCustomers.id, reason: blockedCustomers.reason })
    .from(blockedCustomers)
    .where(
      and(
        eq(blockedCustomers.isActive, true),
        eq(blockedCustomers.identityNumber, customer.identityNumber)
      )
    )
    .limit(1);
  const blockedByPhone = blockedByIdentity[0]
    ? []
    : await db
        .select({ id: blockedCustomers.id, reason: blockedCustomers.reason })
        .from(blockedCustomers)
        .where(
          and(
            eq(blockedCustomers.isActive, true),
            or(
              eq(blockedCustomers.phone, customer.phone),
              ...(customer.phoneSecondary
                ? [eq(blockedCustomers.phone, customer.phoneSecondary)]
                : [])
            )
          )
        )
        .limit(1);
  const blocked = blockedByIdentity[0] || blockedByPhone[0];
  if (blocked)
    throw new Error(
      `لا يمكن إنشاء عقد لهذا العميل لأنه محظور: ${blocked.reason || "يوجد سجل حظر فعال"}`
    );
  await lockVehicleRow(input.vehicleId);
  const requestedStart = new Date(input.startDate);
  const requestedEnd = new Date(input.expectedReturnDate);
  if (Number.isNaN(requestedStart.getTime()) || Number.isNaN(requestedEnd.getTime()))
    throw new Error("تاريخ بداية ونهاية العقد غير صالح");
  const availability = await checkVehicleAvailability({
    vehicleId: input.vehicleId,
    requestedStart,
    requestedEnd,
  });
  if (!availability.available)
    throw new Error(
      availability.reason === "contract_overlap"
        ? "السيارة غير متاحة خلال فترة العقد بسبب تداخل عقد آخر"
        : availability.reason === "maintenance_overlap"
          ? "السيارة غير متاحة خلال فترة العقد بسبب تداخل صيانة"
          : "السيارة غير متاحة للتأجير بسبب حالتها الحالية"
    );
  const selectedVehicle = (
    await db
      .select()
      .from(vehicles)
      .where(eq(vehicles.id, input.vehicleId))
      .limit(1)
  )[0];
  if (!selectedVehicle) throw new Error("السيارة غير موجودة");
  const openVehicleNotes = await db
    .select()
    .from(vehicleNotes)
    .where(
      and(
        eq(vehicleNotes.vehicleId, input.vehicleId),
        sql`${vehicleNotes.resolution} in ('open','not_repaired')`
      )
    );
  if (openVehicleNotes.length && !input.vehicleNoteResolution)
    throw new Error(
      "توجد ملاحظة/خلل مسجل من العميل السابق. حدد نتيجة المعالجة قبل إنشاء العقد"
    );
  if (openVehicleNotes.length && input.vehicleNoteResolution) {
    const resolutionAt = new Date();
    await db
      .update(vehicleNotes)
      .set({
        resolution: input.vehicleNoteResolution,
        resolutionReason:
          input.vehicleNoteResolution === "repaired"
            ? "تم الإصلاح قبل إنشاء العقد"
            : input.vehicleNoteResolution === "not_needed"
              ? "لا يحتاج إلى إصلاح"
              : "لم يتم الإصلاح؛ يتطلب متابعة المدير",
        resolvedBy: input.createdBy ?? null,
        resolvedAt: resolutionAt,
        managerFollowUpRequired: input.vehicleNoteResolution === "not_repaired",
        managerFollowUpAt:
          input.vehicleNoteResolution === "not_repaired" ? resolutionAt : null,
      })
      .where(
        and(
          eq(vehicleNotes.vehicleId, input.vehicleId),
          sql`${vehicleNotes.resolution} in ('open','not_repaired')`
        )
      );
  }
  const odometer = validateOdometerReading({
    reading: input.vehicleMileage,
    documentedReadings: await getDocumentedOdometerReadings(
      input.vehicleId,
      selectedVehicle.mileage
    ),
    correctionReason: input.odometerCorrectionReason,
  });
  const oilStatus = calculateOilMaintenance({
    currentMileage: input.vehicleMileage,
    lastOilChangeMileage: selectedVehicle.lastOilChangeMileage,
    oilChangeInterval: selectedVehicle.oilChangeInterval,
    lastOilChangeDate: selectedVehicle.lastOilChangeDate,
  });
  const contractNumber =
    input.contractNumber?.trim() || (await nextContractNumber());
  const {
    vehicleMileage: _vehicleMileage,
    odometerCorrectionReason: _odometerCorrectionReason,
    oilOverrideAcknowledged: _oilOverrideAcknowledged,
    vehicleNoteResolution: _vehicleNoteResolution,
    initialCashAmount: _initialCashAmount,
    initialNetworkAmount: _initialNetworkAmount,
    ...contractInput
  } = input;
  const result = await db.insert(contracts).values({
    ...contractInput,
    startMileage: input.vehicleMileage,
    contractNumber,
    startDate: requestedStart,
    expectedReturnDate: requestedEnd,
    paidAmount: input.paidAmount ?? "0",
    createdBy: input.createdBy ?? null,
  });
  const contractId = Number(result[0]?.insertId);
  if (input.type === "monthly")
    await generateMonthlyInstallments(
      contractId,
      requestedStart,
      Math.max(1, Math.ceil(input.days / 30)),
      input.rentalAmount
    );
  await db
    .update(vehicles)
    .set({
      status: "rented",
      ...(input.vehicleMileage !== undefined
        ? { mileage: input.vehicleMileage }
        : {}),
    })
    .where(eq(vehicles.id, input.vehicleId!));
  const contractNotes =
    `${input.notes?.trim() ?? ""}${input.notes?.trim() ? "؛ " : ""}قراءة العداد عند فتح العقد: ${input.vehicleMileage.toLocaleString()} كم؛ الفرق عن آخر قراءة موثقة: ${odometer.difference.toLocaleString()} كم${odometer.corrected ? `؛ تصحيح موثق: ${input.odometerCorrectionReason!.trim()}` : ""}${oilStatus.due ? "؛ تم إنشاء العقد مع تنبيه مستحق لتغيير الزيت" : ""}`.trim();
  await db.insert(contractOperations).values({
    contractId,
    operation: "new_contract",
    vehicleId: input.vehicleId,
    details: contractNotes
      ? `إنشاء عقد ${input.type}؛ ملاحظات العقد: ${contractNotes}`
      : `إنشاء عقد ${input.type}`,
    createdBy: input.createdBy,
  });
  const initialCash = Number(input.initialCashAmount) || 0;
  const initialNetwork = Number(input.initialNetworkAmount) || 0;
  if (initialCash > 0 || initialNetwork > 0) {
    const paymentDetails = `دفعة عند إنشاء العقد ${contractNumber}`;
    if (initialCash > 0) {
      const payment = await db.insert(payments).values({
        contractId,
        customerId: input.customerId,
        amount: initialCash.toFixed(2),
        method: "cash",
        notes: paymentDetails,
      });
      await createPaymentFinancialTransaction({
        paymentId: Number(payment[0]?.insertId),
        contractId,
        customerId: input.customerId,
        vehicleId: input.vehicleId,
        amount: initialCash.toFixed(2),
        method: "cash",
        notes: paymentDetails,
        createdBy: input.createdBy,
      });
    }
    if (initialNetwork > 0) {
      const payment = await db.insert(payments).values({
        contractId,
        customerId: input.customerId,
        amount: initialNetwork.toFixed(2),
        method: "network",
        notes: paymentDetails,
      });
      await createPaymentFinancialTransaction({
        paymentId: Number(payment[0]?.insertId),
        contractId,
        customerId: input.customerId,
        vehicleId: input.vehicleId,
        amount: initialNetwork.toFixed(2),
        method: "network",
        notes: paymentDetails,
        createdBy: input.createdBy,
      });
    }
    await db.insert(contractOperations).values({
      contractId,
      operation: "payment",
      vehicleId: input.vehicleId,
      amount: (initialCash + initialNetwork).toFixed(2),
      paymentMethod:
        initialCash > 0 && initialNetwork > 0
          ? "mixed"
          : initialCash > 0
            ? "cash"
            : "network",
      details: paymentDetails,
      createdBy: input.createdBy,
    });
  }
  return { id: contractId, contractNumber };
}

export async function getOfficeInsights() {
  const [
    vehicleRows,
    contractRows,
    customerRows,
    paymentRows,
    maintenanceRows,
    operationRows,
  ] = await Promise.all([
    listVehicles(),
    listContracts(),
    listCustomers(),
    listPayments(),
    listMaintenance(),
    listAllContractOperations(),
  ]);
  const paymentsByContract = new Map<number, number>();
  paymentRows.forEach((payment: any) =>
    paymentsByContract.set(
      payment.contractId,
      (paymentsByContract.get(payment.contractId) ?? 0) +
        Number(payment.amount ?? 0)
    )
  );
  const maintenanceByVehicle = new Map<number, number>();
  maintenanceRows.forEach((record: any) =>
    maintenanceByVehicle.set(
      record.vehicleId,
      (maintenanceByVehicle.get(record.vehicleId) ?? 0) +
        Number(record.cost ?? 0)
    )
  );
  const contractsByVehicle = new Map<number, any[]>();
  const vehiclesById = new Map<number, any>(
    vehicleRows.map((vehicle: any) => [vehicle.id, vehicle])
  );
  const customersById = new Map<number, any>(
    customerRows.map((customer: any) => [customer.id, customer])
  );
  contractRows.forEach((contract: any) => {
    const list = contractsByVehicle.get(contract.vehicleId) ?? [];
    list.push(contract);
    contractsByVehicle.set(contract.vehicleId, list);
  });
  const insights = buildOfficeInsights({
    vehicles: vehicleRows.map((vehicle: any) => {
      const vehicleContracts = contractsByVehicle.get(vehicle.id) ?? [];
      return {
        id: vehicle.id,
        plateNumber: vehicle.plateNumber,
        rentalDays: vehicleContracts.reduce(
          (sum, contract) => sum + Number(contract.days ?? 0),
          0
        ),
        rentalRevenue: vehicleContracts.reduce(
          (sum, contract) => sum + Number(contract.totalAmount ?? 0),
          0
        ),
        otherRevenue: 0,
        maintenanceCost: maintenanceByVehicle.get(vehicle.id) ?? 0,
      };
    }),
    customers: customerRows.map((customer: any) => {
      const customerContracts = contractRows.filter(
        (contract: any) => contract.customerId === customer.id
      );
      return {
        id: customer.id,
        fullName: customer.fullName,
        previousContracts: customerContracts.length,
        latePaymentContracts: customerContracts.filter(
          (contract: any) =>
            contract.status === "overdue" ||
            Number(contract.totalAmount ?? 0) >
              (paymentsByContract.get(contract.id) ??
                Number(contract.paidAmount ?? 0))
        ).length,
      };
    }),
    contracts: contractRows.map((contract: any) => ({
      id: contract.id,
      contractNumber: contract.contractNumber,
      customerId: contract.customerId,
      hasAdvancePayment:
        Number(
          paymentsByContract.get(contract.id) ?? contract.paidAmount ?? 0
        ) > 0,
      durationDays: Number(contract.days ?? 0),
      customerDataComplete: Boolean(
        customersById.get(contract.customerId)?.identityNumber &&
          customersById.get(contract.customerId)?.fullName &&
          customersById.get(contract.customerId)?.phone
      ),
      vehicleInsured: Boolean(
        vehiclesById.get(contract.vehicleId)?.insuranceExpiryDate &&
          new Date(
            vehiclesById.get(contract.vehicleId).insuranceExpiryDate
          ).getTime() >= Date.now()
      ),
      previousDelayDays: contract.status === "overdue" ? -1 : 0,
      status: contract.status,
      hasReturnOrExtension:
        (contract.status !== "closed" && contract.status !== "returned") ||
        operationRows.some(
          (operation: any) =>
            operation.contractId === contract.id &&
            ["return", "extension"].includes(operation.operation)
        ),
    })),
    operationsToday: operationRows
      .filter(
        (operation: any) =>
          new Date(operation.createdAt).toDateString() ===
          new Date().toDateString()
      )
      .map((operation: any) => ({
        userId: Number(operation.createdBy ?? 0),
        userName: "مستخدم النظام",
        financial: ["payment", "additional_fee", "rate_update"].includes(
          operation.operation
        ),
      })),
  });
  return insights;
}

export async function getDashboardAlerts() {
  const db = await getDb();
  if (!db) return [];
  await db
    .update(contracts)
    .set({ status: "overdue" })
    .where(
      and(
        eq(contracts.status, "active"),
        sql`${contracts.expectedReturnDate} < curdate()`
      )
    );
  const alerts: Array<{
    type:
      | "overdue"
      | "maintenance"
      | "document"
      | "monthly_expiry"
      | "vehicle_note";
    title: string;
    description: string;
    severity: "warning" | "danger";
  }> = [];
  const overdue = await db
    .select({
      contractNumber: contracts.contractNumber,
      expectedReturnDate: contracts.expectedReturnDate,
    })
    .from(contracts)
    .where(eq(contracts.status, "overdue"))
    .orderBy(desc(contracts.expectedReturnDate));
  const monthlyExpiring = await db
    .select({
      contractNumber: contracts.contractNumber,
      expectedReturnDate: contracts.expectedReturnDate,
    })
    .from(contracts)
    .where(
      and(
        eq(contracts.type, "monthly"),
        inArray(contracts.status, ["active", "overdue"]),
        sql`datediff(${contracts.expectedReturnDate}, curdate()) between 0 and 4`
      )
    )
    .orderBy(contracts.expectedReturnDate);
  const maintenance = await db
    .select({
      plateNumber: vehicles.plateNumber,
      make: vehicles.make,
      model: vehicles.model,
    })
    .from(vehicles)
    .where(eq(vehicles.status, "maintenance"))
    .orderBy(desc(vehicles.updatedAt));
  const oilCandidates = await db
    .select({
      plateNumber: vehicles.plateNumber,
      mileage: vehicles.mileage,
      lastOilChangeMileage: vehicles.lastOilChangeMileage,
      lastOilChangeDate: vehicles.lastOilChangeDate,
      oilChangeInterval: vehicles.oilChangeInterval,
    })
    .from(vehicles);
  const oilDue = oilCandidates.filter(
    vehicle =>
      calculateOilMaintenance({
        currentMileage: vehicle.mileage,
        lastOilChangeMileage: vehicle.lastOilChangeMileage,
        oilChangeInterval: vehicle.oilChangeInterval,
        lastOilChangeDate: vehicle.lastOilChangeDate,
      }).due
  );
  const openVehicleNotes = await listOpenVehicleNotes();
  const documentedVehicles = await db
    .select({
      plateNumber: vehicles.plateNumber,
      insuranceExpiryDate: vehicles.insuranceExpiryDate,
      inspectionExpiryDate: vehicles.inspectionExpiryDate,
      registrationExpiryDate: vehicles.registrationExpiryDate,
    })
    .from(vehicles);
  const horizon = Date.now() + 30 * 86400000;
  const documents: Array<{ plateNumber: string; label: string; value: Date }> =
    [];
  documentedVehicles.forEach(vehicle => {
    (
      [
        ["التأمين", vehicle.insuranceExpiryDate],
        ["الفحص الدوري", vehicle.inspectionExpiryDate],
        ["الاستمارة", vehicle.registrationExpiryDate],
      ] as const
    ).forEach(([label, value]) => {
      if (value) {
        const expiry = new Date(value);
        if (expiry.getTime() <= horizon)
          documents.push({
            plateNumber: vehicle.plateNumber,
            label,
            value: expiry,
          });
      }
    });
  });
  monthlyExpiring.slice(0, 10).forEach(contract =>
    alerts.push({
      type: "monthly_expiry",
      title: `العقد الشهري ${contract.contractNumber} يقترب من الانتهاء`,
      description: `ينتهي في ${contract.expectedReturnDate}؛ تواصل مع العميل الآن لتأكيد تمديد شهر جديد أو موعد التسليم.`,
      severity: "warning",
    })
  );
  overdue.slice(0, 10).forEach(contract =>
    alerts.push({
      type: "overdue",
      title: `العقد ${contract.contractNumber} متأخر`,
      description: `تاريخ التسليم المتوقع ${contract.expectedReturnDate}`,
      severity: "danger",
    })
  );
  maintenance.slice(0, 10).forEach(vehicle =>
    alerts.push({
      type: "maintenance",
      title: `السيارة ${vehicle.plateNumber} تحتاج صيانة`,
      description: `${vehicle.make} ${vehicle.model} غير متاحة للتأجير`,
      severity: "warning",
    })
  );
  oilDue.slice(0, 10).forEach(vehicle => {
    const oilStatus = calculateOilMaintenance({
      currentMileage: vehicle.mileage,
      lastOilChangeMileage: vehicle.lastOilChangeMileage,
      oilChangeInterval: vehicle.oilChangeInterval,
      lastOilChangeDate: vehicle.lastOilChangeDate,
    });
    alerts.push({
      type: "maintenance",
      title: `موعد تغيير زيت السيارة ${vehicle.plateNumber}`,
      description: `${mileageWarningMessage(oilStatus)}؛ العداد الحالي ${vehicle.mileage.toLocaleString()} كم`,
      severity: "warning",
    });
  });
  openVehicleNotes.slice(0, 10).forEach(({ note, vehicle, contract }) => {
    alerts.push({
      type: "vehicle_note",
      title: `ملاحظة غير مغلقة على السيارة ${vehicle?.plateNumber ?? note.vehicleId}`,
      description: `${note.note}${contract?.contractNumber ? `؛ العقد السابق ${contract.contractNumber}` : ""}؛ تتطلب متابعة المدير`,
      severity: "warning",
    });
  });
  documents
    .sort((a, b) => a.value.getTime() - b.value.getTime())
    .slice(0, 10)
    .forEach(document =>
      alerts.push({
        type: "document",
        title: `وثيقة ${document.label} للسيارة ${document.plateNumber}`,
        description: `تاريخ الانتهاء ${document.value}`,
        severity: document.value.getTime() < Date.now() ? "danger" : "warning",
      })
    );
  return alerts;
}

export async function listOfficeLiabilities() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(officeLiabilities)
    .orderBy(desc(officeLiabilities.createdAt));
}

export async function listExpenseTypes() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(expenseTypes)
    .where(eq(expenseTypes.isActive, true))
    .orderBy(expenseTypes.name);
}
export async function createExpenseType(input: {
  name: string;
  recurrence: "one_time" | "monthly" | "quarterly" | "semiannual" | "annual";
  defaultAmount?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (!input.name.trim()) throw new Error("اسم نوع المصروف مطلوب");
  return db.insert(expenseTypes).values({
    name: input.name.trim(),
    recurrence: input.recurrence,
    defaultAmount: input.defaultAmount || "0",
  });
}
export async function listEmployees() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(employees)
    .where(eq(employees.isActive, true))
    .orderBy(employees.fullName);
}
export async function createEmployee(input: {
  fullName: string;
  salary: string;
  hireDate: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (!input.fullName.trim() || Number(input.salary) < 0 || !input.hireDate)
    throw new Error("بيانات الموظف غير صحيحة");
  return db.insert(employees).values({
    fullName: input.fullName.trim(),
    salary: input.salary,
    hireDate: new Date(input.hireDate),
  });
}

export async function createOfficeLiability(input: {
  category: string;
  description: string;
  amount: string;
  dueDate?: string;
  expenseDate?: string;
  expenseTypeId?: number;
  employeeId?: number;
  notes?: string;
  expenseReason?: string;
  contractNumber?: string;
  paymentMethod?: "cash" | "network" | "transfer";
  createdBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (
    !input.description.trim() ||
    !input.amount.trim() ||
    Number(input.amount) <= 0
  )
    throw new Error("بيانات المصروف غير صحيحة");
  if (input.contractNumber && !input.expenseReason?.trim())
    throw new Error("سبب تحويل الدائن مطلوب عند ربط المصروف بعقد");
  const result = await db.insert(officeLiabilities).values({
    ...input,
    dueDate: input.dueDate ? new Date(input.dueDate) : null,
    expenseDate: input.expenseDate ? new Date(input.expenseDate) : null,
    expenseTypeId: input.expenseTypeId || null,
    employeeId: input.employeeId || null,
    expenseReason: input.expenseReason?.trim() || null,
    contractNumber: input.contractNumber?.trim() || null,
    createdBy: input.createdBy,
  });
  const liabilityId = Number(result[0]?.insertId);
  await createFinancialTransaction({
    transactionType: "expense",
    amount: input.amount,
    liabilityId,
    description: input.description.trim(),
    createdBy: input.createdBy ?? 0,
  });
  return result;
}

export async function updateOfficeLiability(input: {
  id: number;
  category?: string;
  description?: string;
  amount?: string;
  dueDate?: string | null;
  expenseDate?: string | null;
  notes?: string | null;
  reason: string;
  updatedBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (!input.reason.trim()) throw new Error("سبب تعديل الالتزام مطلوب");
  const existing = await db
    .select()
    .from(officeLiabilities)
    .where(eq(officeLiabilities.id, input.id))
    .limit(1);
  const item = existing[0];
  if (!item) throw new Error("الالتزام غير موجود");
  const values: Record<string, unknown> = {};
  for (const key of ["category", "description", "amount", "notes"] as const)
    if (input[key] !== undefined) values[key] = input[key];
  if (input.dueDate !== undefined)
    values.dueDate = input.dueDate ? new Date(input.dueDate) : null;
  if (input.expenseDate !== undefined)
    values.expenseDate = input.expenseDate ? new Date(input.expenseDate) : null;
  await db
    .update(officeLiabilities)
    .set(values)
    .where(eq(officeLiabilities.id, input.id));
  await db.insert(deletionAudits).values({
    entityType: "liability_edit",
    entityId: input.id,
    snapshot: JSON.stringify({ before: item, after: values }),
    reason: input.reason.trim(),
    deletedBy: input.updatedBy,
  });
  return { success: true as const };
}

export async function deleteOfficeLiabilitySafely(input: {
  id: number;
  reason: string;
  deletedBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (!input.reason.trim()) throw new Error("سبب حذف الالتزام مطلوب");
  const existing = await db
    .select()
    .from(officeLiabilities)
    .where(eq(officeLiabilities.id, input.id))
    .limit(1);
  const item = existing[0];
  if (!item) throw new Error("الالتزام غير موجود");
  await db.insert(deletionAudits).values({
    entityType: "liability",
    entityId: input.id,
    snapshot: JSON.stringify(item),
    reason: input.reason.trim(),
    deletedBy: input.deletedBy,
  });
  await db.delete(officeLiabilities).where(eq(officeLiabilities.id, input.id));
  return { success: true as const };
}

export async function approveOfficeLiability(input: {
  id: number;
  status: "approved" | "rejected";
  approvedBy: number;
  reason?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const rows = await db
    .select()
    .from(officeLiabilities)
    .where(eq(officeLiabilities.id, input.id))
    .limit(1);
  if (!rows[0]) throw new Error("الالتزام غير موجود");
  if (input.status === "rejected" && !input.reason?.trim())
    throw new Error("سبب رفض المصروف مطلوب");
  const decisionAt = new Date();
  await db
    .update(officeLiabilities)
    .set({
      approvalStatus: input.status,
      approvedBy: input.approvedBy,
      approvedAt: decisionAt,
      rejectionReason:
        input.status === "rejected" ? input.reason!.trim() : null,
      notes: input.reason?.trim()
        ? `${rows[0].notes ?? ""}${rows[0].notes ? "؛ " : ""}سبب القرار: ${input.reason.trim()}`
        : rows[0].notes,
    })
    .where(eq(officeLiabilities.id, input.id));
  const linkedTransaction = (
    await db
      .select({ id: financialTransactions.id })
      .from(financialTransactions)
      .where(
        and(
          eq(financialTransactions.sourceTable, "officeLiabilities"),
          eq(financialTransactions.sourceId, input.id),
          eq(financialTransactions.approvalStatus, "pending")
        )
      )
      .limit(1)
  )[0];
  if (linkedTransaction)
    await db
      .update(financialTransactions)
      .set({
        approvalStatus: input.status,
        approvedBy: input.approvedBy,
        approvedAt: decisionAt,
        rejectionReason:
          input.status === "rejected" ? input.reason!.trim() : null,
      })
      .where(eq(financialTransactions.id, linkedTransaction.id));
  return { success: true as const, status: input.status };
}

export async function recordOfficeLiabilityPayment(
  id: number,
  amount: string,
  paymentMethod: "cash" | "network" | "transfer",
  paidBy?: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const rows = await db
    .select()
    .from(officeLiabilities)
    .where(eq(officeLiabilities.id, id))
    .limit(1);
  const liability = rows[0];
  if (!liability) throw new Error("الالتزام غير موجود");
  if (
    liability.approvalStatus === "pending" ||
    liability.approvalStatus === "rejected"
  )
    throw new Error(
      `لا يمكن سداد التزام غير معتمد. الحالة الحالية: ${liability.approvalStatus}`
    );
  const nextPaid = Math.min(
    Number(liability.amount),
    Number(liability.paidAmount) + Number(amount)
  );
  const status =
    nextPaid >= Number(liability.amount)
      ? "paid"
      : nextPaid > 0
        ? "partially_paid"
        : "open";
  await db
    .update(officeLiabilities)
    .set({ paidAmount: nextPaid.toFixed(2), status, paymentMethod })
    .where(eq(officeLiabilities.id, id));
  await db.insert(deletionAudits).values({
    entityType: "liability_payment",
    entityId: id,
    snapshot: JSON.stringify({
      before: liability,
      after: { paidAmount: nextPaid.toFixed(2), status, paymentMethod },
    }),
    reason: "تسجيل سداد مصروف",
    deletedBy: paidBy,
  });
  return { success: true as const, paidAmount: nextPaid.toFixed(2), status };
}

export async function getOfficeLiabilitySummary() {
  const rows = await listOfficeLiabilities();
  const approvedRows = rows.filter(row => row.approvalStatus === "approved");
  const total = approvedRows.reduce((sum, row) => sum + Number(row.amount), 0);
  const paid = approvedRows.reduce(
    (sum, row) => sum + Number(row.paidAmount),
    0
  );
  return {
    total: total.toFixed(2),
    paid: paid.toFixed(2),
    outstanding: Math.max(0, total - paid).toFixed(2),
    count: rows.length,
    pendingCount: rows.filter(row => row.approvalStatus === "pending").length,
  };
}

export async function getVehicleRevenueReport(
  filters: { from?: string; to?: string } = {}
) {
  const db = await getDb();
  if (!db)
    return {
      vehicles: [],
      totals: {
        baseContractValue: "0.00",
        contractValue: "0.00",
        delayTotal: "0.00",
        grandTotal: "0.00",
        collected: "0.00",
        otherRevenue: "0.00",
        cash: "0.00",
        network: "0.00",
        outstanding: "0.00",
        excludedOutstanding: "0.00",
        expenses: "0.00",
        pendingCustomerCredits: "0.00",
        settledCustomerCredits: "0.00",
        netRevenue: "0.00",
      },
    };
  const contractDateFilter =
    filters.from || filters.to
      ? and(
          filters.from
            ? or(
                gte(contracts.startDate, new Date(filters.from)),
                gte(contracts.updatedAt, new Date(filters.from))
              )
            : undefined,
          filters.to
            ? or(
                lte(contracts.startDate, new Date(`${filters.to}T23:59:59`)),
                lte(contracts.updatedAt, new Date(`${filters.to}T23:59:59`))
              )
            : undefined
        )
      : undefined;
  const paymentDateFilter =
    filters.from || filters.to
      ? (row: { transactionDate: Date }) =>
          (!filters.from || row.transactionDate >= new Date(filters.from)) &&
          (!filters.to ||
            row.transactionDate <= new Date(`${filters.to}T23:59:59`))
      : () => true;
  const contractsRows = await db
    .select({ contract: contracts, vehicle: vehicles })
    .from(contracts)
    .leftJoin(vehicles, eq(contracts.vehicleId, vehicles.id))
    .where(contractDateFilter);
  const expenseDateFilter =
    filters.from || filters.to
      ? and(
          filters.from
            ? sql`COALESCE(${officeLiabilities.expenseDate}, ${officeLiabilities.createdAt}) >= ${new Date(filters.from)}`
            : undefined,
          filters.to
            ? sql`COALESCE(${officeLiabilities.expenseDate}, ${officeLiabilities.createdAt}) <= ${new Date(`${filters.to}T23:59:59`)}`
            : undefined
        )
      : undefined;
  const expenseRows = await db
    .select({
      amount: officeLiabilities.amount,
      category: officeLiabilities.category,
    })
    .from(officeLiabilities)
    .where(
      and(expenseDateFilter, eq(officeLiabilities.approvalStatus, "approved"))
    );
  const customerCreditRows = await db
    .select({
      amount: officeLiabilities.amount,
      paidAmount: officeLiabilities.paidAmount,
      category: officeLiabilities.category,
    })
    .from(officeLiabilities)
    .where(
      and(
        expenseDateFilter,
        eq(officeLiabilities.category, "customer_credit_transfer")
      )
    );
  const financialReport = await getFinancialReportingReadModel();
  const reportablePayments = financialReport.transactions.filter(
    row => row.transactionType === "payment" && paymentDateFilter(row)
  );
  const excludedOutstanding = contractsRows
    .filter(
      ({ contract }) =>
        contract.status === "overdue" || contract.status === "suspended"
    )
    .reduce((sum, { contract }) => {
      const totals = calculateContractTotals({
        baseTotal: contract.totalAmount,
        expectedReturnDate: contract.expectedReturnDate,
        rentalAmount: contract.rentalAmount,
        previousDueAmount: Number(contract.totalAmount) - Number(contract.paidAmount),
        type: contract.type,
        contractScope: contract.contractScope ?? undefined,
        days: contract.days,
        actualReturnDate: contract.actualReturnDate,
      });
      const balances = calculateContractBalances({
        baseTotal: totals.baseTotal,
        delayTotal: totals.delayTotal,
        paidAmount: contract.paidAmount,
        excessMileageBalance: contract.excessMileageAmount,
      });
      return sum + Number(balances.grandOutstanding);
    }, 0);
  const byVehicle = new Map<
    number,
    {
      vehicleId: number;
      vehicleName: string;
      plateNumber: string;
      baseContractValue: number;
      delayTotal: number;
      grandTotal: number;
      collected: number;
      otherRevenue: number;
      cash: number;
      network: number;
      outstanding: number;
      months: Array<{
        month: string;
        collected: string;
        otherRevenue: string;
        cash: string;
        network: string;
      }>;
    }
  >();
  for (const row of contractsRows) {
    if (!row.vehicle) continue;
    const current = byVehicle.get(row.vehicle.id) ?? {
      vehicleId: row.vehicle.id,
      vehicleName: `${row.vehicle.make} ${row.vehicle.model}`,
      plateNumber: row.vehicle.plateNumber,
      baseContractValue: 0,
      delayTotal: 0,
      grandTotal: 0,
      collected: 0,
      otherRevenue: 0,
      cash: 0,
      network: 0,
      outstanding: 0,
      months: [],
    };
    const totals = calculateContractTotals({
      baseTotal: row.contract.totalAmount,
      expectedReturnDate: row.contract.expectedReturnDate,
      rentalAmount: row.contract.rentalAmount,
      previousDueAmount: Number(row.contract.totalAmount) - Number(row.contract.paidAmount),
      type: row.contract.type,
      contractScope: ("contractScope" in row.contract
        ? row.contract.contractScope
        : undefined) as
        | "domestic_limited"
        | "domestic_open"
        | "international"
        | undefined,
      days: ("days" in row.contract ? row.contract.days : undefined) as
        | number
        | undefined,
      actualReturnDate: row.contract.actualReturnDate,
    });
    if (
      row.contract.status !== "overdue" &&
      row.contract.status !== "suspended"
    ) {
      current.baseContractValue += Number(totals.baseTotal);
      current.delayTotal += Number(totals.delayTotal);
      current.grandTotal += Number(totals.grandTotal);
      const balances = calculateContractBalances({
        baseTotal: totals.baseTotal,
        delayTotal: totals.delayTotal,
        paidAmount: row.contract.paidAmount,
        excessMileageBalance: row.contract.excessMileageAmount,
      });
      current.outstanding += Number(balances.grandOutstanding);
    }
    byVehicle.set(row.vehicle.id, current);
  }
  const vehiclesById = new Map(
    contractsRows
      .filter(row => row.vehicle)
      .map(row => [row.vehicle!.id, row.vehicle!])
  );
  for (const payment of reportablePayments) {
    const vehicle =
      payment.vehicleId !== null
        ? vehiclesById.get(payment.vehicleId)
        : undefined;
    if (!vehicle) continue;
    const current = byVehicle.get(vehicle.id) ?? {
      vehicleId: vehicle.id,
      vehicleName: `${vehicle.make} ${vehicle.model}`,
      plateNumber: vehicle.plateNumber,
      baseContractValue: 0,
      delayTotal: 0,
      grandTotal: 0,
      collected: 0,
      otherRevenue: 0,
      cash: 0,
      network: 0,
      outstanding: 0,
      months: [],
    };
    const month = new Date(payment.transactionDate).toISOString().slice(0, 7);
    const amount = Number(payment.amount);
    const method = payment.paymentMethod;
    const otherRevenue = isOtherRevenueReason(payment.description);
    if (otherRevenue) current.otherRevenue += amount;
    else {
      current.collected += amount;
      if (method === "cash") current.cash += amount;
      if (method === "network") current.network += amount;
    }
    const monthRow = current.months.find(entry => entry.month === month);
    if (monthRow) {
      if (otherRevenue)
        monthRow.otherRevenue = (
          Number(monthRow.otherRevenue) + amount
        ).toFixed(2);
      else {
        monthRow.collected = (Number(monthRow.collected) + amount).toFixed(2);
        if (method === "cash")
          monthRow.cash = (Number(monthRow.cash) + amount).toFixed(2);
        if (method === "network")
          monthRow.network = (Number(monthRow.network) + amount).toFixed(2);
      }
    } else
      current.months.push({
        month,
        collected: otherRevenue ? "0.00" : amount.toFixed(2),
        otherRevenue: otherRevenue ? amount.toFixed(2) : "0.00",
        cash: !otherRevenue && method === "cash" ? amount.toFixed(2) : "0.00",
        network:
          !otherRevenue && method === "network" ? amount.toFixed(2) : "0.00",
      });
    byVehicle.set(vehicle.id, current);
  }
  const report = Array.from(byVehicle.values()).map(row => ({
    ...row,
    baseContractValue: row.baseContractValue.toFixed(2),
    contractValue: row.baseContractValue.toFixed(2),
    delayTotal: row.delayTotal.toFixed(2),
    grandTotal: row.grandTotal.toFixed(2),
    collected: row.collected.toFixed(2),
    otherRevenue: row.otherRevenue.toFixed(2),
    cash: row.cash.toFixed(2),
    network: row.network.toFixed(2),
    outstanding: row.outstanding.toFixed(2),
    months: row.months.sort((a, b) => b.month.localeCompare(a.month)),
  }));
  const expenses = expenseRows
    .filter(row => row.category !== "customer_credit_transfer")
    .reduce((sum, row) => sum + Number(row.amount), 0);
  const pendingCustomerCredits = customerCreditRows.reduce(
    (sum, row) =>
      sum + Math.max(0, Number(row.amount) - Number(row.paidAmount ?? 0)),
    0
  );
  const settledCustomerCredits = customerCreditRows.reduce(
    (sum, row) =>
      sum + Math.min(Number(row.amount), Number(row.paidAmount ?? 0)),
    0
  );
  const totals = {
    baseContractValue: report.reduce(
      (sum, row) => sum + Number(row.baseContractValue),
      0
    ),
    contractValue: report.reduce(
      (sum, row) => sum + Number(row.baseContractValue),
      0
    ),
    delayTotal: report.reduce((sum, row) => sum + Number(row.delayTotal), 0),
    grandTotal: report.reduce((sum, row) => sum + Number(row.grandTotal), 0),
    collected: report.reduce((sum, row) => sum + Number(row.collected), 0),
    otherRevenue: report.reduce(
      (sum, row) => sum + Number(row.otherRevenue),
      0
    ),
    cash: report.reduce((sum, row) => sum + Number(row.cash), 0),
    network: report.reduce((sum, row) => sum + Number(row.network), 0),
    outstanding: report.reduce((sum, row) => sum + Number(row.outstanding), 0),
    excludedOutstanding,
    expenses,
    pendingCustomerCredits,
    settledCustomerCredits,
  };
  return {
    vehicles: report,
    totals: {
      ...Object.fromEntries(
        Object.entries(totals).map(([key, value]) => [
          key,
          Number(value).toFixed(2),
        ])
      ),
      netRevenue: Math.max(
        0,
        totals.collected + totals.otherRevenue - totals.expenses
      ).toFixed(2),
    },
  };
}

export async function getAccountingSummary() {
  const db = await getDb();
  if (!db) return { revenue: "0.00", outstanding: "0.00", paymentsCount: 0 };
  const [financialReport, contractRows] = await Promise.all([
    getFinancialReportingReadModel(),
    db
      .select({
        totalAmount: contracts.totalAmount,
        paidAmount: contracts.paidAmount,
        expectedReturnDate: contracts.expectedReturnDate,
        actualReturnDate: contracts.actualReturnDate,
        rentalAmount: contracts.rentalAmount,
        type: contracts.type,
        contractScope: contracts.contractScope,
        days: contracts.days,
        status: contracts.status,
      })
      .from(contracts),
  ]);
  const paymentTotals = summarizeEffectivePayments(
    financialReport.transactions
  );
  const outstanding = contractRows
    .filter(contract => belongsToGeneralOutstanding(contract.status))
    .reduce((sum, contract) => {
      const totals = calculateContractTotals({
        baseTotal: contract.totalAmount,
        expectedReturnDate: contract.expectedReturnDate,
        rentalAmount: contract.rentalAmount,
        previousDueAmount: Number(contract.totalAmount) - Number(contract.paidAmount),
        type: contract.type,
        contractScope: contract.contractScope ?? undefined,
        days: contract.days,
        actualReturnDate: contract.actualReturnDate,
      });
      const balances = calculateContractBalances({
        baseTotal: totals.baseTotal,
        delayTotal: totals.delayTotal,
        paidAmount: contract.paidAmount,
      });
      return sum + Number(balances.grandOutstanding);
    }, 0);
  return {
    revenue: paymentTotals.amount.toFixed(2),
    outstanding: outstanding.toFixed(2),
    paymentsCount: paymentTotals.count,
  };
}

export async function getOperationalAccountingSummary() {
  const db = await getDb();
  if (!db)
    return {
      revenue: "0.00",
      outstanding: "0.00",
      paymentsCount: 0,
      revenueToday: "0.00",
    };
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const financialReport = await getFinancialReportingReadModel();
  const paymentTotals = summarizeEffectivePayments(
    financialReport.transactions,
    start
  );
  const amount = paymentTotals.amount.toFixed(2);
  return {
    revenue: amount,
    outstanding: "0.00",
    paymentsCount: paymentTotals.count,
    revenueToday: amount,
  };
}

export async function getFleetReport() {
  const db = await getDb();
  if (!db)
    return {
      total: 0,
      available: 0,
      rented: 0,
      maintenance: 0,
      unavailable: 0,
    };
  const rows = await db
    .select({ status: vehicles.status, count: sql<number>`count(*)` })
    .from(vehicles)
    .groupBy(vehicles.status);
  const result = {
    total: 0,
    available: 0,
    rented: 0,
    maintenance: 0,
    unavailable: 0,
  };
  rows.forEach(row => {
    const count = Number(row.count);
    result.total += count;
    if (row.status === "available") result.available = count;
    if (row.status === "rented" || row.status === "reserved")
      result.rented += count;
    if (row.status === "maintenance") result.maintenance = count;
    if (row.status === "unavailable") result.unavailable = count;
  });
  return result;
}

export async function updateContractRetroactively(input: {
  id: number;
  contractNumber?: string;
  customerId?: number;
  vehicleId?: number;
  type?: "daily" | "monthly";
  contractScope?: "domestic_limited" | "domestic_open" | "international";
  status?: "active" | "overdue" | "suspended" | "closed" | "returned";
  startDate?: string;
  expectedReturnDate?: string;
  actualReturnDate?: string | null;
  rentalAmount?: string;
  days?: number;
  totalAmount?: string;
  vehicleMileage?: number;
  odometerCorrectionReason?: string;
  notes?: string | null;
  reason: string;
  createdBy?: number;
}): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (!transactionContext.getStore())
    return runInTransaction(db, () => updateContractRetroactively(input));
  if (!input.reason.trim()) throw new Error("سبب التعديل مطلوب");
  const existing = await db
    .select()
    .from(contracts)
    .where(eq(contracts.id, input.id))
    .limit(1);
  const contract = existing[0];
  if (!contract) throw new Error("العقد غير موجود");
  await lockVehicleRows([contract.vehicleId, ...(input.vehicleId ? [input.vehicleId] : [])]);
  const values: Record<string, unknown> = {};
  if (input.vehicleId !== undefined && input.vehicleMileage === undefined)
    throw new Error(
      "يجب إدخال العداد الحالي عند تعديل السيارة المرتبطة بالعقد"
    );
  if (input.vehicleMileage !== undefined) {
    const vehicle = (
      await db
        .select()
        .from(vehicles)
        .where(eq(vehicles.id, input.vehicleId ?? contract.vehicleId))
        .limit(1)
    )[0];
    if (!vehicle) throw new Error("السيارة غير موجودة");
    const [maintenanceReadings, contractReadings] = await Promise.all([
      db
        .select({
          mileage: maintenanceRecords.mileage,
          serviceType: maintenanceRecords.serviceType,
        })
        .from(maintenanceRecords)
        .where(eq(maintenanceRecords.vehicleId, vehicle.id)),
      db
        .select({ startMileage: contracts.startMileage })
        .from(contracts)
        .where(eq(contracts.vehicleId, vehicle.id)),
    ]);
    const odometer = validateOdometerReading({
      reading: input.vehicleMileage,
      documentedReadings: [
        { source: "vehicle", reading: vehicle.mileage },
        ...maintenanceReadings.map(row => ({
          source:
            row.serviceType === "oil_change"
              ? ("oil_change" as const)
              : ("maintenance" as const),
          reading: row.mileage,
        })),
        ...contractReadings.map(row => ({
          source: "contract" as const,
          reading: row.startMileage,
        })),
      ],
      correctionReason: input.odometerCorrectionReason,
    });
    values.startMileage = input.vehicleMileage;
    if (input.vehicleId !== undefined) values.vehicleId = input.vehicleId;
    if (odometer.corrected)
      values.notes = `${input.notes ?? contract.notes ?? ""}${input.notes || contract.notes ? "؛ " : ""}تصحيح عداد موثق: ${input.odometerCorrectionReason!.trim()}`;
  }
  if (input.contractNumber !== undefined)
    values.contractNumber = input.contractNumber.trim();
  if (input.customerId !== undefined) values.customerId = input.customerId;
  if (input.vehicleId !== undefined) values.vehicleId = input.vehicleId;
  if (input.type !== undefined) values.type = input.type;
  if (input.contractScope !== undefined)
    values.contractScope = input.contractScope;
  if (input.status !== undefined) values.status = input.status;
  if (input.startDate !== undefined)
    values.startDate = new Date(input.startDate);
  if (input.expectedReturnDate !== undefined)
    values.expectedReturnDate = new Date(input.expectedReturnDate);
  if (input.actualReturnDate !== undefined)
    values.actualReturnDate = input.actualReturnDate
      ? new Date(input.actualReturnDate)
      : null;
  if (input.rentalAmount !== undefined)
    values.rentalAmount = input.rentalAmount;
  if (input.days !== undefined) values.days = input.days;
  if (input.totalAmount !== undefined) values.totalAmount = input.totalAmount;
  if (input.notes !== undefined) values.notes = input.notes;
  if (
    input.startDate !== undefined ||
    input.expectedReturnDate !== undefined ||
    input.vehicleId !== undefined
  ) {
    const requestedStart = input.startDate
      ? new Date(input.startDate)
      : new Date(contract.startDate);
    const requestedEnd = input.expectedReturnDate
      ? new Date(input.expectedReturnDate)
      : new Date(contract.expectedReturnDate);
    if (Number.isNaN(requestedStart.getTime()) || Number.isNaN(requestedEnd.getTime()))
      throw new Error("تاريخ بداية ونهاية العقد غير صالح");
    const availability = await checkVehicleAvailability({
      vehicleId: input.vehicleId ?? contract.vehicleId,
      requestedStart,
      requestedEnd,
      excludeContractId: input.id,
    });
    if (!availability.available)
      throw new Error(
        availability.reason === "contract_overlap"
          ? "السيارة غير متاحة خلال الفترة الجديدة بسبب تداخل عقد آخر"
          : availability.reason === "maintenance_overlap"
            ? "السيارة غير متاحة خلال الفترة الجديدة بسبب تداخل صيانة"
            : "السيارة غير متاحة خلال الفترة الجديدة بسبب حالتها الحالية"
      );
  }
  if (!Object.keys(values).length) throw new Error("لم يتم إدخال أي تعديل");
  await db.update(contracts).set(values).where(eq(contracts.id, input.id));
  const changed = Object.keys(values)
    .map(
      key =>
        `${key}: ${String((contract as Record<string, unknown>)[key])} ← ${String(values[key])}`
    )
    .join("؛ ");
  const odometerAudit =
    input.vehicleMileage !== undefined
      ? `؛ قراءة العداد عند التعديل: ${input.vehicleMileage.toLocaleString()} كم${input.odometerCorrectionReason ? `؛ تصحيح موثق: ${input.odometerCorrectionReason.trim()}` : ""}`
      : "";
  await db.insert(contractOperations).values({
    contractId: input.id,
    operation: "rate_update",
    amount: input.totalAmount ?? contract.totalAmount,
    details: `تعديل عقد بأثر رجعي؛ ${changed}؛ السبب: ${input.reason.trim()}${odometerAudit}`,
    createdBy: input.createdBy,
  });
  return { success: true as const, id: input.id };
}

export async function updatePaymentRetroactively(input: {
  id: number;
  amount?: string;
  method?: "cash" | "network" | "transfer" | "mixed";
  notes?: string | null;
  reason: string;
  createdBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (!input.reason.trim()) throw new Error("سبب تعديل الدفعة مطلوب");
  const existing = await db
    .select()
    .from(payments)
    .where(eq(payments.id, input.id))
    .limit(1);
  const payment = existing[0];
  if (!payment) throw new Error("الدفعة غير موجودة");
  const values: Record<string, unknown> = {};
  if (input.amount !== undefined) {
    if (!Number.isFinite(Number(input.amount)) || Number(input.amount) <= 0)
      throw new Error("قيمة الدفعة يجب أن تكون أكبر من صفر");
    values.amount = input.amount;
  }
  if (input.method !== undefined) values.method = input.method;
  if (input.notes !== undefined) values.notes = input.notes;
  if (!Object.keys(values).length) throw new Error("لم يتم إدخال أي تعديل");
  await db.update(payments).set(values).where(eq(payments.id, input.id));
  await reconcilePaymentFinancialTransaction({
    paymentId: payment.id,
    contractId: payment.contractId,
    customerId: payment.customerId,
    amount: String(values.amount ?? payment.amount),
    method: (values.method ?? payment.method) as
      | "cash"
      | "network"
      | "transfer"
      | "mixed",
    action: "update",
    reason: `تعديل الدفعة #${payment.id}: ${input.reason.trim()}`,
    createdBy: input.createdBy,
  });
  const allPayments = await db
    .select({ amount: payments.amount })
    .from(payments)
    .where(eq(payments.contractId, payment.contractId));
  const paidAmount = allPayments.reduce(
    (sum, row) => sum + Number(row.amount),
    0
  );
  await db
    .update(contracts)
    .set({ paidAmount: paidAmount.toFixed(2) })
    .where(eq(contracts.id, payment.contractId));
  const changed = Object.keys(values)
    .map(
      key =>
        `${key}: ${String((payment as Record<string, unknown>)[key])} ← ${String(values[key])}`
    )
    .join("؛ ");
  await db.insert(contractOperations).values({
    contractId: payment.contractId,
    operation: "payment",
    amount: String(values.amount ?? payment.amount),
    paymentMethod: (values.method ?? payment.method) as
      | "cash"
      | "network"
      | "transfer",
    details: `تعديل دفعة بأثر رجعي #${payment.id}؛ ${changed}؛ السبب: ${input.reason.trim()}`,
    createdBy: input.createdBy,
  });
  return {
    success: true as const,
    contractId: payment.contractId,
    paidAmount: paidAmount.toFixed(2),
  };
}

export async function deletePaymentSafely(input: {
  id: number;
  reason: string;
  deletedBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (!input.reason.trim()) throw new Error("سبب حذف الدفعة مطلوب");
  const rows = await db
    .select()
    .from(payments)
    .where(eq(payments.id, input.id))
    .limit(1);
  const payment = rows[0];
  if (!payment) throw new Error("الدفعة غير موجودة أو حذفت مسبقاً");
  await db.insert(deletionAudits).values({
    entityType: "payment",
    entityId: payment.id,
    contractId: payment.contractId,
    snapshot: JSON.stringify(payment),
    reason: input.reason.trim(),
    deletedBy: input.deletedBy,
  });
  await reconcilePaymentFinancialTransaction({
    paymentId: payment.id,
    contractId: payment.contractId,
    customerId: payment.customerId,
    amount: payment.amount,
    method: payment.method,
    action: "delete",
    reason: `حذف الدفعة #${payment.id}: ${input.reason.trim()}`,
    createdBy: input.deletedBy,
  });
  await db.delete(payments).where(eq(payments.id, payment.id));
  const remainingPayments = await db
    .select({ amount: payments.amount })
    .from(payments)
    .where(eq(payments.contractId, payment.contractId));
  const paidAmount = remainingPayments
    .reduce((sum, row) => sum + Number(row.amount), 0)
    .toFixed(2);
  await db
    .update(contracts)
    .set({ paidAmount })
    .where(eq(contracts.id, payment.contractId));
  await db.insert(contractOperations).values({
    contractId: payment.contractId,
    operation: "payment",
    amount: "0",
    details: `حذف دفعة آمن #${payment.id} بقيمة ${payment.amount} ر.س؛ السبب: ${input.reason.trim()}`,
    createdBy: input.deletedBy,
  });
  return { success: true as const, contractId: payment.contractId, paidAmount };
}

export async function deleteOperationSafely(input: {
  id: number;
  reason: string;
  deletedBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (!input.reason.trim()) throw new Error("سبب حذف العملية مطلوب");
  const rows = await db
    .select()
    .from(contractOperations)
    .where(eq(contractOperations.id, input.id))
    .limit(1);
  const operation = rows[0];
  if (!operation) throw new Error("العملية غير موجودة أو حذفت مسبقاً");
  await db.insert(deletionAudits).values({
    entityType: "operation",
    entityId: operation.id,
    contractId: operation.contractId,
    snapshot: JSON.stringify(operation),
    reason: input.reason.trim(),
    deletedBy: input.deletedBy,
  });
  await db
    .delete(contractOperations)
    .where(eq(contractOperations.id, operation.id));
  return { success: true as const, contractId: operation.contractId };
}

export async function listSiteContent() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(siteContent).orderBy(siteContent.contentKey);
}

export async function upsertSiteContent(input: {
  contentKey: string;
  contentType: "text" | "link";
  value: string;
  originalValue: string;
  updatedBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const existing = await db
    .select()
    .from(siteContent)
    .where(eq(siteContent.contentKey, input.contentKey))
    .limit(1);
  if (existing[0]) {
    await db
      .update(siteContent)
      .set({
        value: input.value,
        contentType: input.contentType,
        updatedBy: input.updatedBy,
      })
      .where(eq(siteContent.contentKey, input.contentKey));
  } else {
    await db.insert(siteContent).values(input);
  }
  return { success: true as const };
}

export async function resetSiteContent(contentKey: string, updatedBy?: number) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const existing = await db
    .select()
    .from(siteContent)
    .where(eq(siteContent.contentKey, contentKey))
    .limit(1);
  if (existing[0]) {
    await db
      .update(siteContent)
      .set({ value: existing[0].originalValue, updatedBy })
      .where(eq(siteContent.contentKey, contentKey));
    await db.insert(deletionAudits).values({
      entityType: "site_content_reset",
      entityId: existing[0].id,
      snapshot: JSON.stringify({
        before: existing[0],
        after: { value: existing[0].originalValue },
      }),
      reason: "استعادة القيمة الأصلية لمحتوى الواجهة",
      deletedBy: updatedBy,
    });
  }
  return { success: true as const };
}

export async function listBlockedCustomers() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(blockedCustomers)
    .where(eq(blockedCustomers.isActive, true))
    .orderBy(blockedCustomers.fullName);
}

export async function createBlockedCustomer(input: {
  fullName: string;
  identityNumber?: string;
  phone?: string;
  nationality?: string;
  reason: string;
  source?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (!input.fullName.trim() || !input.reason.trim())
    throw new Error("اسم العميل وسبب الحظر مطلوبان");
  const result = await db.insert(blockedCustomers).values({
    ...input,
    fullName: input.fullName.trim(),
    identityNumber: input.identityNumber?.trim() || null,
    phone: input.phone?.trim() || null,
    nationality: input.nationality?.trim() || null,
    reason: input.reason.trim(),
    source: input.source?.trim() || "إضافة من صفحة العملاء",
  });
  return { id: result[0]?.insertId, success: true as const };
}

export async function findBlockedCustomer(identityNumber: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(blockedCustomers)
    .where(
      and(
        eq(blockedCustomers.isActive, true),
        eq(blockedCustomers.identityNumber, identityNumber)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteContractSafely(input: {
  id: number;
  reason: string;
  deletedBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (!input.reason.trim()) throw new Error("سبب حذف العقد مطلوب");
  const rows = await db
    .select()
    .from(contracts)
    .where(eq(contracts.id, input.id))
    .limit(1);
  const contract = rows[0];
  if (!contract) throw new Error("العقد غير موجود أو حذف مسبقاً");
  const [paymentRows, operationRows] = await Promise.all([
    db.select().from(payments).where(eq(payments.contractId, contract.id)),
    db
      .select()
      .from(contractOperations)
      .where(eq(contractOperations.contractId, contract.id)),
  ]);
  await db.insert(deletionAudits).values([
    {
      entityType: "contract",
      entityId: contract.id,
      contractId: contract.id,
      snapshot: JSON.stringify(contract),
      reason: input.reason.trim(),
      deletedBy: input.deletedBy,
    },
    ...paymentRows.map(payment => ({
      entityType: "payment",
      entityId: payment.id,
      contractId: contract.id,
      snapshot: JSON.stringify(payment),
      reason: `حذف مع العقد #${contract.contractNumber}: ${input.reason.trim()}`,
      deletedBy: input.deletedBy,
    })),
    ...operationRows.map(operation => ({
      entityType: "operation",
      entityId: operation.id,
      contractId: contract.id,
      snapshot: JSON.stringify(operation),
      reason: `حذف مع العقد #${contract.contractNumber}: ${input.reason.trim()}`,
      deletedBy: input.deletedBy,
    })),
  ]);
  await db.delete(payments).where(eq(payments.contractId, contract.id));
  await db
    .delete(contractOperations)
    .where(eq(contractOperations.contractId, contract.id));
  await db.delete(contracts).where(eq(contracts.id, contract.id));
  await db
    .update(vehicles)
    .set({ status: "available" })
    .where(eq(vehicles.id, contract.vehicleId));
  return { success: true as const, vehicleId: contract.vehicleId };
}
