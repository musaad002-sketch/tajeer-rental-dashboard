import { createHash } from "node:crypto";
import { and, desc, eq, gte, inArray, like, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, contractOperations, contracts, customers, deletionAudits, employees, expenseTypes, maintenanceRecords, officeLiabilities, payments, users, vehicles } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { buildOperationEffects, getContractReference, validateVehicleSwap } from "../shared/contractOperations";
import { nextContractNumber as computeNextContractNumber } from "../shared/contractNumbers";
import { extendReturnDate, isFinanciallyDistressed } from "../shared/contractCalculation";
import { calculateContractTotals } from "../shared/contractTotals";
import { isExpenseIncludedInNetRevenue } from "../shared/expenseApproval";
import { calculateContractBalances } from "../shared/contractBalances";
import { addAdditionalFee, calculateRateAdjustedTotal } from "../shared/contractFinance";
import { isMileageAdvanceValid } from "../shared/vehicleMaintenance";
import { allocatePayment } from "../shared/paymentAllocation";
import { calculateReturnSettlement } from "../shared/returnSettlement";
import { belongsToGeneralOutstanding } from "../shared/outstandingStatus";
import { calculateCloseSettlement } from "../shared/closeSettlement";
import { calculateSuspensionSettlement, statusAfterSuspendedSettlement } from "../shared/suspensionSettlement";
import { canChargeMonthlyAuthorizationFee } from "../shared/contractScope";
import { isOtherRevenueReason, paymentReasonLabels } from "../shared/paymentReasons";
import { buildOfficeInsights } from "../shared/officeInsights";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try { _db = drizzle(process.env.DATABASE_URL); } catch (error) { console.warn("[Database] Failed to connect:", error); _db = null; }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) { values[field] = user[field] ?? null; updateSet[field] = user[field] ?? null; }
  }
  values.lastSignedIn = user.lastSignedIn ?? new Date(); updateSet.lastSignedIn = values.lastSignedIn;
  if (user.role !== undefined || user.openId === ENV.ownerOpenId) { values.role = user.role ?? "admin"; updateSet.role = values.role; }
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export function hashLocalPassword(password: string) { return createHash("sha256").update(password).digest("hex"); }

export async function listManagedUsers() {
  const db = await getDb(); if (!db) return [];
  return db.select({ id: users.id, openId: users.openId, name: users.name, email: users.email, username: users.username, role: users.role, isActive: users.isActive, permissions: users.permissions, createdAt: users.createdAt, lastSignedIn: users.lastSignedIn }).from(users).orderBy(desc(users.createdAt));
}

export async function getUserByUsername(username: string) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return result[0];
}

export async function createManagedUser(input: { username: string; password: string; name: string; email?: string; role: "user" | "admin"; permissions: string[] }) {
  const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const existing = await getUserByUsername(input.username);
  if (existing) throw new Error("اسم المستخدم مستخدم مسبقاً");
  await db.insert(users).values({ openId: `local_user_${input.username}_${Date.now()}`, username: input.username, passwordHash: hashLocalPassword(input.password), name: input.name, email: input.email || null, loginMethod: "local", role: input.role, isActive: true, permissions: JSON.stringify(input.permissions), lastSignedIn: new Date() });
  return getUserByUsername(input.username);
}

export async function updateManagedUser(input: { id: number; name?: string; email?: string; password?: string; role?: "user" | "admin"; isActive?: boolean; permissions?: string[] }) {
  const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const values: Record<string, unknown> = {};
  if (input.name !== undefined) values.name = input.name;
  if (input.email !== undefined) values.email = input.email || null;
  if (input.password) values.passwordHash = hashLocalPassword(input.password);
  if (input.role !== undefined) values.role = input.role;
  if (input.isActive !== undefined) values.isActive = input.isActive;
  if (input.permissions !== undefined) values.permissions = JSON.stringify(input.permissions);
  if (Object.keys(values).length) await db.update(users).set(values).where(eq(users.id, input.id));
  const result = await db.select({ id: users.id, openId: users.openId, name: users.name, email: users.email, username: users.username, role: users.role, isActive: users.isActive, permissions: users.permissions, createdAt: users.createdAt, lastSignedIn: users.lastSignedIn }).from(users).where(eq(users.id, input.id)).limit(1);
  return result[0];
}

export async function listContracts(status?: "active" | "overdue" | "suspended" | "closed" | "returned") {
  const db = await getDb(); if (!db) return [];
  await db.update(contracts).set({ status: "overdue" }).where(and(eq(contracts.status, "active"), sql`${contracts.expectedReturnDate} < curdate()`));
  const rows = await db.select({ contract: contracts, customer: customers, vehicle: vehicles }).from(contracts).leftJoin(customers, eq(contracts.customerId, customers.id)).leftJoin(vehicles, eq(contracts.vehicleId, vehicles.id)).where(status ? eq(contracts.status, status) : undefined).orderBy(desc(contracts.createdAt));
  const ids = rows.map((row) => row.contract.id);
  const paymentRows = ids.length ? await db.select().from(payments).where(inArray(payments.contractId, ids)).orderBy(desc(payments.createdAt)) : [];
  return rows.map((row) => {
    const totals = calculateContractTotals({ baseTotal: row.contract.totalAmount, expectedReturnDate: row.contract.expectedReturnDate, rentalAmount: row.contract.rentalAmount, type: row.contract.type, actualReturnDate: row.contract.actualReturnDate });
    const balances = calculateContractBalances({ baseTotal: totals.baseTotal, delayTotal: totals.delayTotal, paidAmount: row.contract.paidAmount });
    return { ...row, totals, ...balances };
  });
}

export async function listAvailableVehicles() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(vehicles).where(and(eq(vehicles.status, "available"), sql`not exists (select 1 from contracts c where c.vehicleId = ${vehicles.id} and c.contractStatus in ('active','overdue'))`, sql`not exists (select 1 from maintenanceRecords m where m.vehicleId = ${vehicles.id} and m.maintenanceStatus in ('pending','in_progress'))`)).orderBy(vehicles.make, vehicles.model);
}

export async function getContractDetails(contractId: number) {
  const db = await getDb(); if (!db) return null;
  const [contractRow, paymentRows, operationRows] = await Promise.all([
    db.select({ contract: contracts, customer: customers, vehicle: vehicles }).from(contracts).leftJoin(customers, eq(contracts.customerId, customers.id)).leftJoin(vehicles, eq(contracts.vehicleId, vehicles.id)).where(eq(contracts.id, contractId)).limit(1),
    db.select().from(payments).where(eq(payments.contractId, contractId)).orderBy(desc(payments.createdAt)),
    db.select().from(contractOperations).where(eq(contractOperations.contractId, contractId)).orderBy(desc(contractOperations.createdAt)),
  ]);
  if (!contractRow[0]) return null;
  const vehicleIds = Array.from(new Set(operationRows.flatMap((operation) => [operation.vehicleId, operation.previousVehicleId]).filter((id): id is number => typeof id === "number")));
  const creatorIds = Array.from(new Set(operationRows.map((operation) => operation.createdBy).filter((id): id is number => typeof id === "number")));
  const [operationVehicles, creators] = await Promise.all([
    vehicleIds.length ? db.select().from(vehicles).where(inArray(vehicles.id, vehicleIds)) : Promise.resolve([]),
    creatorIds.length ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, creatorIds)) : Promise.resolve([]),
  ]);
  const vehicleById = new Map(operationVehicles.map((vehicle) => [vehicle.id, vehicle]));
  const creatorById = new Map(creators.map((creator) => [creator.id, creator.name]));
  const operations = operationRows.map((operation) => ({
    ...operation,
    createdByName: operation.createdBy ? creatorById.get(operation.createdBy) ?? "مستخدم النظام" : "—",
    previousVehicle: operation.previousVehicleId ? vehicleById.get(operation.previousVehicleId) ?? null : null,
    currentVehicle: operation.vehicleId ? vehicleById.get(operation.vehicleId) ?? null : null,
  }));
  return { ...contractRow[0], payments: paymentRows, operations };
}

export async function searchCustomerLedger(query: string) {
  const db = await getDb(); if (!db || !query.trim()) return [];
  const match = `%${query.trim()}%`;
  const contractRows = await db.select({ customer: customers, contract: contracts }).from(customers).leftJoin(contracts, eq(contracts.customerId, customers.id)).where(or(like(customers.fullName, match), like(customers.identityNumber, match), like(contracts.contractNumber, match))).orderBy(desc(customers.createdAt));
  const contractIds = Array.from(new Set(contractRows.map((row) => row.contract?.id).filter((id): id is number => typeof id === "number")));
  if (!contractIds.length) return contractRows.map((row) => ({ ...row, payment: null, operation: null }));
  const [paymentRows, operationRows] = await Promise.all([
    db.select().from(payments).where(inArray(payments.contractId, contractIds)).orderBy(desc(payments.createdAt)),
    db.select().from(contractOperations).where(inArray(contractOperations.contractId, contractIds)).orderBy(desc(contractOperations.createdAt)),
  ]);
  const customerByContract = new Map(contractRows.filter((row) => row.contract).map((row) => [row.contract!.id, row.customer]));
  const contractById = new Map(contractRows.filter((row) => row.contract).map((row) => [row.contract!.id, row.contract]));
  const ledgerRows: Array<{ customer: typeof customers.$inferSelect | null; contract: typeof contracts.$inferSelect | null; payment: typeof payments.$inferSelect | null; operation: typeof contractOperations.$inferSelect | null }> = [];
  for (const contractId of contractIds) {
    const customer = customerByContract.get(contractId) ?? null;
    const contract = contractById.get(contractId) ?? null;
    const contractPayments = paymentRows.filter((row) => row.contractId === contractId);
    const contractOperationsRows = operationRows.filter((row) => row.contractId === contractId);
    for (const payment of contractPayments) ledgerRows.push({ customer, contract, payment, operation: null });
    for (const operation of contractOperationsRows) ledgerRows.push({ customer, contract, payment: null, operation });
    if (!contractPayments.length && !contractOperationsRows.length) ledgerRows.push({ customer, contract, payment: null, operation: null });
  }
  return ledgerRows.sort((a, b) => {
    const aTime = a.payment?.createdAt ?? a.operation?.createdAt ?? a.contract?.createdAt ?? new Date(0);
    const bTime = b.payment?.createdAt ?? b.operation?.createdAt ?? b.contract?.createdAt ?? new Date(0);
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });
}

export async function getDashboardSummary() {
  const db = await getDb();
  if (!db) return { activeContracts: 0, overdueContracts: 0, suspendedContracts: 0, availableVehicles: 0, totalVehicles: 0, rentedVehicles: 0, outstandingAmount: "0.00", maintenanceVehicles: 0, oilDueVehicles: 0, expiringDocuments: 0, todayPayments: "0.00" };
  await db.update(contracts).set({ status: "overdue" }).where(and(eq(contracts.status, "active"), sql`${contracts.expectedReturnDate} < curdate()`));
  const [active, overdue, suspended, available, totalVehicles, rentedVehicles, outstanding, maintenance, oilDue, expiringDocuments, todayPayments] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(contracts).where(eq(contracts.status, "active")),
    db.select({ count: sql<number>`count(*)` }).from(contracts).where(eq(contracts.status, "overdue")),
    db.select({ count: sql<number>`count(*)` }).from(contracts).where(eq(contracts.status, "suspended")),
    db.select({ count: sql<number>`count(*)` }).from(vehicles).where(eq(vehicles.status, "available")),
    db.select({ count: sql<number>`count(*)` }).from(vehicles),
    db.select({ count: sql<number>`count(*)` }).from(vehicles).where(inArray(vehicles.status, ["rented", "reserved"])),
    db.select({ amount: sql<string>`coalesce(sum(${contracts.totalAmount} - ${contracts.paidAmount}), 0)` }).from(contracts).where(and(inArray(contracts.status, ["active", "overdue"]), sql`${contracts.totalAmount} > ${contracts.paidAmount}`)),
    db.select({ count: sql<number>`count(*)` }).from(vehicles).where(eq(vehicles.status, "maintenance")),
    db.select({ count: sql<number>`count(*)` }).from(vehicles).where(sql`${vehicles.lastOilChangeMileage} is not null and ${vehicles.mileage} >= ${vehicles.lastOilChangeMileage} + ${vehicles.oilChangeInterval}`),
    db.select({ count: sql<number>`count(*)` }).from(vehicles).where(or(sql`${vehicles.insuranceExpiryDate} <= date_add(curdate(), interval 30 day)`, sql`${vehicles.inspectionExpiryDate} <= date_add(curdate(), interval 30 day)`, sql`${vehicles.registrationExpiryDate} <= date_add(curdate(), interval 30 day)`)),
    db.select({ amount: sql<string>`coalesce(sum(${payments.amount}), 0)` }).from(payments).where(sql`date(${payments.createdAt}) = curdate()`),
  ]);
  return { activeContracts: Number(active[0]?.count ?? 0), overdueContracts: Number(overdue[0]?.count ?? 0), suspendedContracts: Number(suspended[0]?.count ?? 0), availableVehicles: Number(available[0]?.count ?? 0), totalVehicles: Number(totalVehicles[0]?.count ?? 0), rentedVehicles: Number(rentedVehicles[0]?.count ?? 0), outstandingAmount: String(outstanding[0]?.amount ?? "0.00"), maintenanceVehicles: Number(maintenance[0]?.count ?? 0), oilDueVehicles: Number(oilDue[0]?.count ?? 0), expiringDocuments: Number(expiringDocuments[0]?.count ?? 0), todayPayments: String(todayPayments[0]?.amount ?? "0.00") };
}

export async function createCustomer(input: { identityNumber: string; fullName: string; phone: string; email?: string; notes?: string }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const result = await db.insert(customers).values(input); return result[0]?.insertId;
}

export async function updateCustomer(input: { id: number; identityNumber?: string; fullName?: string; phone?: string; email?: string | null; notes?: string | null; reason: string; updatedBy?: number }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable"); if (!input.reason.trim()) throw new Error("سبب تعديل العميل مطلوب");
  const existing = await db.select().from(customers).where(eq(customers.id, input.id)).limit(1); const customer = existing[0]; if (!customer) throw new Error("العميل غير موجود");
  const values: Record<string, unknown> = {}; for (const key of ["identityNumber", "fullName", "phone", "email", "notes"] as const) if (input[key] !== undefined) values[key] = input[key];
  await db.update(customers).set(values).where(eq(customers.id, input.id)); await db.insert(deletionAudits).values({ entityType: "customer_edit", entityId: input.id, snapshot: JSON.stringify({ before: customer, after: values }), reason: input.reason.trim(), deletedBy: input.updatedBy }); return { success: true as const };
}

export async function deleteCustomerSafely(input: { id: number; reason: string; deletedBy?: number }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable"); if (!input.reason.trim()) throw new Error("سبب حذف العميل مطلوب");
  const existing = await db.select().from(customers).where(eq(customers.id, input.id)).limit(1); const customer = existing[0]; if (!customer) throw new Error("العميل غير موجود");
  const linked = await db.select({ id: contracts.id }).from(contracts).where(eq(contracts.customerId, input.id)).limit(1); if (linked[0]) throw new Error("لا يمكن حذف عميل مرتبط بعقود؛ عدّل بياناته أو أرشفه بدلاً من الحذف");
  await db.insert(deletionAudits).values({ entityType: "customer", entityId: input.id, snapshot: JSON.stringify(customer), reason: input.reason.trim(), deletedBy: input.deletedBy }); await db.delete(customers).where(eq(customers.id, input.id)); return { success: true as const };
}

export async function createMaintenance(input: { vehicleId: number; issueType: string; serviceType?: "maintenance" | "oil_change"; mileage?: number; startDate: string; status?: "pending" | "in_progress"; cost?: string; notes?: string }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const vehicle = await db.select({ id: vehicles.id, status: vehicles.status, mileage: vehicles.mileage }).from(vehicles).where(eq(vehicles.id, input.vehicleId)).limit(1);
  if (!vehicle[0]) throw new Error("السيارة غير موجودة");
  if (vehicle[0].status === "rented" || vehicle[0].status === "reserved") throw new Error("لا يمكن تسجيل صيانة لسيارة مرتبطة بعقد ساري؛ أغلِق العقد أو بدّل السيارة أولاً");
  if (input.mileage !== undefined && (!Number.isInteger(input.mileage) || input.mileage < 0)) throw new Error("قراءة عداد الصيانة يجب أن تكون رقماً صحيحاً غير سالب");
  if (input.mileage !== undefined && !isMileageAdvanceValid(vehicle[0].mileage, input.mileage)) throw new Error("قراءة عداد الصيانة لا يمكن أن تكون أقل من العداد الحالي");
  const recordedMileage = input.mileage ?? vehicle[0].mileage;
  const serviceType = input.serviceType ?? "maintenance";
  const status = serviceType === "oil_change" ? "completed" : input.status ?? "pending";
  const result = await db.insert(maintenanceRecords).values({ ...input, mileage: recordedMileage, serviceType, status, cost: input.cost ?? "0", startDate: new Date(input.startDate), endDate: status === "completed" ? new Date(input.startDate) : null });
  await db.update(vehicles).set(serviceType === "oil_change" ? { mileage: recordedMileage, lastOilChangeMileage: recordedMileage, lastOilChangeDate: new Date(input.startDate), status: "available" } : { mileage: recordedMileage, status: "maintenance" }).where(eq(vehicles.id, input.vehicleId));
  return result[0]?.insertId;
}

export async function updateMaintenance(input: { id: number; issueType?: string; mileage?: number; startDate?: string; cost?: string; notes?: string | null; reason: string; updatedBy?: number }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable"); if (!input.reason.trim()) throw new Error("سبب تعديل الصيانة مطلوب");
  const existing = await db.select().from(maintenanceRecords).where(eq(maintenanceRecords.id, input.id)).limit(1); const record = existing[0]; if (!record) throw new Error("سجل الصيانة غير موجود");
  const values: Record<string, unknown> = {}; if (input.issueType !== undefined) values.issueType = input.issueType; if (input.mileage !== undefined) values.mileage = input.mileage; if (input.startDate !== undefined) values.startDate = new Date(input.startDate); if (input.cost !== undefined) values.cost = input.cost; if (input.notes !== undefined) values.notes = input.notes;
  await db.update(maintenanceRecords).set(values).where(eq(maintenanceRecords.id, input.id)); await db.insert(deletionAudits).values({ entityType: "maintenance_edit", entityId: input.id, snapshot: JSON.stringify({ before: record, after: values }), reason: input.reason.trim(), deletedBy: input.updatedBy }); return { success: true as const };
}

export async function deleteMaintenanceSafely(input: { id: number; reason: string; deletedBy?: number }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable"); if (!input.reason.trim()) throw new Error("سبب حذف الصيانة مطلوب");
  const existing = await db.select().from(maintenanceRecords).where(eq(maintenanceRecords.id, input.id)).limit(1); const record = existing[0]; if (!record) throw new Error("سجل الصيانة غير موجود");
  await db.insert(deletionAudits).values({ entityType: "maintenance", entityId: input.id, snapshot: JSON.stringify(record), reason: input.reason.trim(), deletedBy: input.deletedBy }); await db.delete(maintenanceRecords).where(eq(maintenanceRecords.id, input.id));
  const remaining = await db.select({ id: maintenanceRecords.id }).from(maintenanceRecords).where(and(eq(maintenanceRecords.vehicleId, record.vehicleId), eq(maintenanceRecords.status, "in_progress"))).limit(1); if (!remaining[0]) await db.update(vehicles).set({ status: "available" }).where(eq(vehicles.id, record.vehicleId)); return { success: true as const };
}

export async function listMaintenance() {
  const db = await getDb(); if (!db) return [];
  return db.select({ maintenance: maintenanceRecords, vehicle: vehicles }).from(maintenanceRecords).leftJoin(vehicles, eq(maintenanceRecords.vehicleId, vehicles.id)).orderBy(desc(maintenanceRecords.createdAt));
}

export async function listVehicles() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(vehicles).orderBy(vehicles.id);
}

export async function getVehicleDetails(vehicleId: number) {
  const db = await getDb(); if (!db) return null;
  const [vehicleRows, contractRows, maintenanceRows, operationRows] = await Promise.all([
    db.select().from(vehicles).where(eq(vehicles.id, vehicleId)).limit(1),
    db.select({ contract: contracts, customer: customers }).from(contracts).leftJoin(customers, eq(contracts.customerId, customers.id)).where(eq(contracts.vehicleId, vehicleId)).orderBy(desc(contracts.createdAt)),
    db.select().from(maintenanceRecords).where(eq(maintenanceRecords.vehicleId, vehicleId)).orderBy(desc(maintenanceRecords.createdAt)),
    db.select().from(contractOperations).where(or(eq(contractOperations.vehicleId, vehicleId), eq(contractOperations.previousVehicleId, vehicleId))).orderBy(desc(contractOperations.createdAt)),
  ]);
  if (!vehicleRows[0]) return null;
  return { vehicle: vehicleRows[0], contracts: contractRows, maintenance: maintenanceRows, operations: operationRows };
}

export async function getCustomerDetails(customerId: number) {
  const db = await getDb(); if (!db) return null;
  const [customerRows, contractRows] = await Promise.all([
    db.select().from(customers).where(eq(customers.id, customerId)).limit(1),
    db.select({ contract: contracts, vehicle: vehicles }).from(contracts).leftJoin(vehicles, eq(contracts.vehicleId, vehicles.id)).where(eq(contracts.customerId, customerId)).orderBy(desc(contracts.createdAt)),
  ]);
  if (!customerRows[0]) return null;
  const contractIds = contractRows.map((row) => row.contract.id);
  const [paymentRows, operationRows] = contractIds.length ? await Promise.all([
    db.select().from(payments).where(inArray(payments.contractId, contractIds)).orderBy(desc(payments.createdAt)),
    db.select().from(contractOperations).where(inArray(contractOperations.contractId, contractIds)).orderBy(desc(contractOperations.createdAt)),
  ]) : [[], []];
  return { customer: customerRows[0], contracts: contractRows, payments: paymentRows, operations: operationRows };
}

export async function listCustomers() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(customers).orderBy(desc(customers.createdAt));
}

export async function recordContractOperation(input: { contractId?: number; contractNumber?: string; operation: "new_contract" | "extension" | "payment" | "additional_fee" | "rate_update" | "vehicle_swap" | "suspend" | "close" | "return"; vehicleId?: number; vehicleMileage?: number; amount?: string; paymentMethod?: "cash" | "network" | "transfer" | "mixed"; paymentCashAmount?: string; paymentNetworkAmount?: string; extensionDays?: number; paymentReason?: string; details?: string; createdBy?: number }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const reference = getContractReference(input);
  const lookup = reference?.kind === "contractNumber" ? eq(contracts.contractNumber, reference.value) : reference?.kind === "contractId" ? eq(contracts.id, reference.value) : undefined;
  if (!lookup) throw new Error("أدخل رقم العقد أولاً");
  const existing = await db.select().from(contracts).where(lookup).limit(1);
  const contract = existing[0];
  if (!contract) throw new Error("العقد غير موجود في قاعدة البيانات؛ أنشئ العقد أولاً ثم نفّذ العملية");
  const contractId = contract.id;
  const effects = buildOperationEffects(input.operation, input.amount);
  if (input.operation === "suspend" && !isFinanciallyDistressed({ startDate: contract.startDate, unitRate: contract.rentalAmount, type: contract.type, paidAmount: contract.paidAmount })) throw new Error("لا يمكن تعليق العقد: الدفعات تغطي الإيجار المستحق حتى اليوم");
  if (input.operation === "extension" && (!input.extensionDays || !Number.isInteger(input.extensionDays) || input.extensionDays <= 0)) throw new Error("أدخل عدد أيام التمديد صحيحة");
  if ((input.operation === "additional_fee" || input.operation === "rate_update") && (!input.amount || !Number.isFinite(Number(input.amount)) || Number(input.amount) <= 0)) throw new Error(input.operation === "additional_fee" ? "أدخل قيمة الرسم الإضافي" : "أدخل سعر التأجير الجديد");
  let previousVehicleId: number | undefined;
  let operationDetails = input.details;
  const operationAt = new Date();
  let statusAfterPayment: "active" | "overdue" | null = null;
  let suspensionSettlement: ReturnType<typeof calculateSuspensionSettlement> | undefined;
  if (input.operation === "suspend") {
    suspensionSettlement = calculateSuspensionSettlement({ baseTotal: contract.totalAmount, expectedReturnDate: contract.expectedReturnDate, suspendedAt: operationAt, rentalAmount: contract.rentalAmount, type: contract.type, paidAmount: contract.paidAmount });
    operationDetails = `تسوية التعليق حتى ${operationAt.toLocaleDateString("en-CA")}: خصم الأيام غير المستخدمة ${suspensionSettlement.remainingDays} يوم بقيمة ${suspensionSettlement.unusedValue} ر.س؛ المستحق حتى التعليق ${suspensionSettlement.amountDueThroughSuspension} ر.س؛ المتبقي السابق ${suspensionSettlement.balances.previousOutstanding} ر.س؛ المتبقي الحالي ${suspensionSettlement.balances.currentOutstanding} ر.س${input.details ? `؛ ${input.details}` : ""}`;
  }
  const otherRevenuePayment = input.operation === "payment" && isOtherRevenueReason(input.paymentReason);
  if (input.operation === "payment" && input.amount) {
    if (input.paymentMethod === "mixed" && (!Number(input.paymentCashAmount) || !Number(input.paymentNetworkAmount) || Number(input.paymentCashAmount) < 0 || Number(input.paymentNetworkAmount) < 0 || Number(input.paymentCashAmount) + Number(input.paymentNetworkAmount) !== Number(input.amount))) throw new Error("يجب أن يساوي مجموع الكاش والشبكة مبلغ الدفعة");
    const reasonLabel = input.paymentReason ? paymentReasonLabels[input.paymentReason as keyof typeof paymentReasonLabels] ?? input.paymentReason : undefined;
    const totals = calculateContractTotals({ baseTotal: contract.totalAmount, expectedReturnDate: contract.expectedReturnDate, rentalAmount: contract.rentalAmount, type: contract.type, actualReturnDate: contract.actualReturnDate });
    const balances = calculateContractBalances({ baseTotal: totals.baseTotal, delayTotal: totals.delayTotal, paidAmount: contract.paidAmount });
    const allocation = otherRevenuePayment ? null : allocatePayment({ paymentAmount: Number(input.amount), previousOutstanding: Number(balances.previousOutstanding), currentOutstanding: Number(balances.currentOutstanding) });
    const allocationNote = allocation ? `تخصيص الدفعة: السابق ${allocation.appliedToPrevious.toFixed(2)} ر.س؛ الحالي ${allocation.appliedToCurrent.toFixed(2)} ر.س${allocation.unapplied > 0 ? `؛ رصيد زائد ${allocation.unapplied.toFixed(2)} ر.س` : ""}` : "إيراد آخر مستقل؛ لا يخصم من المتبقي أو التأخير";
    operationDetails = [operationDetails, reasonLabel ? `سبب الدفعة: ${reasonLabel}` : undefined, allocationNote, input.paymentMethod === "mixed" ? `دفع مختلط: كاش ${Number(input.paymentCashAmount).toFixed(2)} ر.س؛ شبكة ${Number(input.paymentNetworkAmount).toFixed(2)} ر.س` : undefined].filter(Boolean).join("؛ ");
    if (!otherRevenuePayment) {
      statusAfterPayment = statusAfterSuspendedSettlement({ status: contract.status, outstanding: Math.max(0, Number(balances.grandOutstanding) - Number(input.amount)), expectedReturnDate: contract.expectedReturnDate, now: operationAt });
      if (statusAfterPayment) operationDetails = `${operationDetails}؛ تمت تسوية الرصيد وإعادة العقد إلى حالة ${statusAfterPayment === "active" ? "ساري" : "متأخر"}`;
    }
  }
  if (input.vehicleMileage !== undefined) {
    if (!Number.isInteger(input.vehicleMileage) || input.vehicleMileage < 0) throw new Error("قراءة العداد يجب أن تكون رقماً صحيحاً غير سالب");
    const targetVehicleId = contract.vehicleId;
    if (targetVehicleId) {
      const currentVehicle = await db.select({ mileage: vehicles.mileage }).from(vehicles).where(eq(vehicles.id, targetVehicleId)).limit(1);
      if (currentVehicle[0] && !isMileageAdvanceValid(currentVehicle[0].mileage, input.vehicleMileage)) throw new Error("قراءة العداد الجديدة لا يمكن أن تكون أقل من القراءة الحالية");
      await db.update(vehicles).set({ mileage: input.vehicleMileage }).where(eq(vehicles.id, targetVehicleId));
      operationDetails = `${operationDetails ? `${operationDetails}؛ ` : ""}قراءة العداد: ${input.vehicleMileage.toLocaleString()} كم`;
    }
  }
  if (input.operation === "additional_fee") {
    if (contract.contractScope !== "international") throw new Error("رسوم التفويض الدولي متاحة للعقد الخارجي الدولي فقط");
    const fee = Number(input.amount);
    const previousFees = await db.select({ createdAt: contractOperations.createdAt }).from(contractOperations).where(and(eq(contractOperations.contractId, contractId), eq(contractOperations.operation, "additional_fee")));
    const alreadyChargedThisMonth = previousFees.some((row) => { const date = new Date(row.createdAt); return date.getFullYear() === operationAt.getFullYear() && date.getMonth() === operationAt.getMonth(); });
    if (!canChargeMonthlyAuthorizationFee(contract.contractScope, contract.type, alreadyChargedThisMonth)) throw new Error("تم تسجيل رسم التفويض الدولي لهذا العقد خلال هذا الشهر أو أن نوع العقد لا يسمح به");
    operationDetails = `رسوم تفويض دولي: ${fee.toFixed(2)}${input.details ? `؛ ${input.details}` : ""}`;
    await db.update(contracts).set({ totalAmount: addAdditionalFee(contract.totalAmount, fee) }).where(eq(contracts.id, contractId));
  }
  if (input.operation === "rate_update") {
    const nextRate = Number(input.amount);
    const previousRate = Number(contract.rentalAmount);
    const nextTotal = calculateRateAdjustedTotal({ currentTotal: contract.totalAmount, currentRate: previousRate, nextRate, days: contract.days, type: contract.type });
    operationDetails = `تعديل سعر التأجير: ${previousRate.toFixed(2)} ← ${nextRate.toFixed(2)}${input.details ? `؛ ${input.details}` : ""}`;
    await db.update(contracts).set({ rentalAmount: nextRate.toFixed(2), totalAmount: nextTotal }).where(eq(contracts.id, contractId));
  }
  if (input.operation === "vehicle_swap") {
    if (contract.contractScope === "international" && (!input.amount || !Number.isFinite(Number(input.amount)) || Number(input.amount) <= 0)) throw new Error("أدخل قيمة رسم التفويض الدولي الجديد عند تبديل سيارة العقد الدولي");
    let replacementIsAvailable = false;
    if (input.vehicleId) {
      const replacement = await db.select().from(vehicles).where(and(eq(vehicles.id, input.vehicleId), eq(vehicles.status, "available"))).limit(1);
      replacementIsAvailable = Boolean(replacement[0]);
    }
    const swapValidation = validateVehicleSwap(contract.vehicleId, input.vehicleId, replacementIsAvailable);
    if (!swapValidation.ok) throw new Error(swapValidation.reason);
    previousVehicleId = contract.vehicleId;
    const totals = calculateContractTotals({ baseTotal: contract.totalAmount, expectedReturnDate: contract.expectedReturnDate, rentalAmount: contract.rentalAmount, type: contract.type, actualReturnDate: contract.actualReturnDate });
    const balances = calculateContractBalances({ baseTotal: totals.baseTotal, delayTotal: totals.delayTotal, paidAmount: contract.paidAmount });
    operationDetails = `تبديل السيارة: ${contract.vehicleId} ← ${input.vehicleId}؛ نقل الحسابات: المدفوع ${Number(contract.paidAmount).toFixed(2)} ر.س، السابق ${balances.previousOutstanding} ر.س، التأخير ${balances.currentOutstanding} ر.س، الإجمالي ${balances.grandOutstanding} ر.س${contract.contractScope === "international" ? `؛ رسم تفويض دولي جديد ${Number(input.amount).toFixed(2)} ر.س` : ""}${input.details ? `؛ ${input.details}` : ""}`;
  }
  let returnSettlement: ReturnType<typeof calculateReturnSettlement> | undefined;
  let closeSettlement: ReturnType<typeof calculateCloseSettlement> | undefined;
  if (input.operation === "close") {
    closeSettlement = calculateCloseSettlement({ baseTotal: contract.totalAmount, expectedReturnDate: contract.expectedReturnDate, closedAt: operationAt, rentalAmount: contract.rentalAmount, type: contract.type, paidAmount: contract.paidAmount });
    operationDetails = `تسوية الإغلاق حتى ${operationAt.toLocaleDateString("en-CA")}: المستحق حتى يوم الإغلاق ${closeSettlement.amountDueThroughClose} ر.س؛ الأيام غير المستخدمة ${closeSettlement.remainingDays} يوم بقيمة ${closeSettlement.unusedValue} ر.س؛ الرصيد السابق ${closeSettlement.balances.previousOutstanding} ر.س؛ الرصيد الحالي ${closeSettlement.balances.currentOutstanding} ر.س${closeSettlement.shouldRecordReturn ? `؛ رصيد دائن للعميل ${closeSettlement.customerCredit} ر.س؛ رُحّلت السيارة إلى سجل الاسترجاعات` : ""}${input.details ? `؛ ${input.details}` : ""}`;
    if (!closeSettlement.canClose) throw new Error(`لا يمكن إغلاق العقد: بقي رصيد ${closeSettlement.balances.grandOutstanding} ر.س حتى يوم الإغلاق فقط. علّق العقد أو سجّل دفعة أولاً.`);
  }
  if (input.operation === "return") {
    returnSettlement = calculateReturnSettlement({ expectedReturnDate: contract.expectedReturnDate, returnedAt: operationAt, rentalAmount: contract.rentalAmount, type: contract.type });
    operationDetails = `استرجاع مبكر: الأيام المتبقية ${returnSettlement.remainingDays} يوم × ${returnSettlement.dailyRate} ر.س = ${returnSettlement.remainingValue} ر.س${input.details ? `؛ ${input.details}` : ""}`;
  }
  const operationToPersist = input.operation === "close" && closeSettlement?.shouldRecordReturn ? "return" : input.operation;
  const operationVehicleId = input.operation === "close" || input.operation === "return" ? contract.vehicleId : input.vehicleId;
  await db.insert(contractOperations).values({ contractId, operation: operationToPersist, vehicleId: operationVehicleId, previousVehicleId, amount: input.operation === "close" && closeSettlement?.shouldRecordReturn ? closeSettlement.customerCredit : input.amount ?? "0", paymentMethod: input.paymentMethod === "mixed" ? undefined : input.paymentMethod, details: operationDetails, createdBy: input.createdBy });
  if (input.operation === "vehicle_swap" && contract.contractScope === "international") {
    const fee = Number(input.amount);
    await db.insert(contractOperations).values({ contractId, operation: "additional_fee", vehicleId: input.vehicleId, amount: fee.toFixed(2), details: `رسم تفويض دولي جديد بسبب تبديل السيارة؛ ${input.details ?? ""}`.trim(), createdBy: input.createdBy });
    await db.update(contracts).set({ totalAmount: (Number(contract.totalAmount) + fee).toFixed(2) }).where(eq(contracts.id, contractId));
  }
  if (effects.shouldCreatePayment && input.amount) {
    const paid = Number(contract.paidAmount) + Number(input.amount);
    if (!otherRevenuePayment) await db.update(contracts).set({ paidAmount: paid.toFixed(2), ...(statusAfterPayment ? { status: statusAfterPayment } : {}) }).where(eq(contracts.id, contractId));
    if (input.paymentMethod === "mixed") {
      if (Number(input.paymentCashAmount) > 0) await db.insert(payments).values({ contractId, customerId: contract.customerId, amount: Number(input.paymentCashAmount).toFixed(2), method: "cash", notes: operationDetails });
      if (Number(input.paymentNetworkAmount) > 0) await db.insert(payments).values({ contractId, customerId: contract.customerId, amount: Number(input.paymentNetworkAmount).toFixed(2), method: "network", notes: operationDetails });
    } else await db.insert(payments).values({ contractId, customerId: contract.customerId, amount: input.amount, method: input.paymentMethod ?? "cash", notes: operationDetails });
  }
  if (input.operation === "extension") {
    const nextReturn = extendReturnDate(contract.expectedReturnDate, input.extensionDays!);
    if (!nextReturn) throw new Error("مدة التمديد غير صحيحة");
    await db.update(contracts).set({ expectedReturnDate: nextReturn }).where(eq(contracts.id, contractId));
  }
  if (input.operation === "vehicle_swap") {
    if (contract.contractScope === "international" && (!input.amount || !Number.isFinite(Number(input.amount)) || Number(input.amount) <= 0)) throw new Error("أدخل قيمة رسم التفويض الدولي الجديد عند تبديل سيارة العقد الدولي");
    let replacementIsAvailable = false;
    if (input.vehicleId) {
      const replacement = await db.select().from(vehicles).where(and(eq(vehicles.id, input.vehicleId), eq(vehicles.status, "available"))).limit(1);
      replacementIsAvailable = Boolean(replacement[0]);
    }
    const swapValidation = validateVehicleSwap(contract.vehicleId, input.vehicleId, replacementIsAvailable);
    if (!swapValidation.ok) throw new Error(swapValidation.reason);
    await db.update(vehicles).set({ status: "available" }).where(eq(vehicles.id, contract.vehicleId));
    await db.update(vehicles).set({ status: "rented" }).where(eq(vehicles.id, input.vehicleId!));
    await db.update(contracts).set({ vehicleId: input.vehicleId }).where(eq(contracts.id, contractId));
  }
  if (input.operation === "suspend" && suspensionSettlement) await db.update(contracts).set({ totalAmount: suspensionSettlement.adjustedBase }).where(eq(contracts.id, contractId));
  if (input.operation === "return" && returnSettlement) {
    const adjustedTotal = Math.max(0, Number(contract.totalAmount) - Number(returnSettlement.remainingValue));
    await db.update(contracts).set({ totalAmount: adjustedTotal.toFixed(2), status: "returned", actualReturnDate: operationAt }).where(eq(contracts.id, contractId));
  }
  if (input.operation === "close" && closeSettlement) await db.update(contracts).set({ totalAmount: closeSettlement.adjustedBase, actualReturnDate: operationAt, status: closeSettlement.shouldRecordReturn ? "returned" : "closed" }).where(eq(contracts.id, contractId));
  if (effects.contractStatus && !(input.operation === "close" && closeSettlement?.shouldRecordReturn)) await db.update(contracts).set({ status: effects.contractStatus }).where(eq(contracts.id, contractId));
  if (effects.releasesVehicle) await db.update(vehicles).set({ status: "available" }).where(eq(vehicles.id, contract.vehicleId));
  if (input.operation === "return") await db.update(contracts).set({ status: "returned", actualReturnDate: new Date() }).where(eq(contracts.id, contractId));
}

export async function updateMaintenanceStatus(id: number, status: "pending" | "in_progress" | "completed" | "written_off", vehicleId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  await db.update(maintenanceRecords).set({ status, endDate: status === "completed" || status === "written_off" ? new Date() : null }).where(eq(maintenanceRecords.id, id));
  await db.update(vehicles).set({ status: status === "completed" ? "available" : status === "written_off" ? "unavailable" : "maintenance" }).where(eq(vehicles.id, vehicleId));
}

export async function createVehicle(input: { plateNumber: string; make: string; model: string; modelYear: number; dailyRate: string; monthlyRate: string; mileage?: number; lastOilChangeMileage?: number; lastOilChangeDate?: string; oilChangeInterval?: number; insuranceExpiryDate?: string; inspectionExpiryDate?: string; registrationExpiryDate?: string; notes?: string }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const result = await db.insert(vehicles).values({ ...input, lastOilChangeDate: input.lastOilChangeDate ? new Date(input.lastOilChangeDate) : null, insuranceExpiryDate: input.insuranceExpiryDate ? new Date(input.insuranceExpiryDate) : null, inspectionExpiryDate: input.inspectionExpiryDate ? new Date(input.inspectionExpiryDate) : null, registrationExpiryDate: input.registrationExpiryDate ? new Date(input.registrationExpiryDate) : null }); return result[0]?.insertId;
}

export async function updateVehicle(id: number, input: { mileage?: number; lastOilChangeMileage?: number; lastOilChangeDate?: string; oilChangeInterval?: number; insuranceExpiryDate?: string; inspectionExpiryDate?: string; registrationExpiryDate?: string }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  if (input.mileage !== undefined && (!Number.isInteger(input.mileage) || input.mileage < 0)) throw new Error("قراءة العداد يجب أن تكون رقماً صحيحاً غير سالب");
  if (input.lastOilChangeMileage !== undefined && (!Number.isInteger(input.lastOilChangeMileage) || input.lastOilChangeMileage < 0)) throw new Error("عداد تغيير الزيت غير صحيح");
  if (input.oilChangeInterval !== undefined && (!Number.isInteger(input.oilChangeInterval) || input.oilChangeInterval <= 0)) throw new Error("فترة تغيير الزيت يجب أن تكون رقماً صحيحاً أكبر من صفر");
  if (input.mileage !== undefined) {
    const current = await db.select({ mileage: vehicles.mileage }).from(vehicles).where(eq(vehicles.id, id)).limit(1);
    if (!current[0]) throw new Error("السيارة غير موجودة");
    if (!isMileageAdvanceValid(current[0].mileage, input.mileage)) throw new Error("قراءة العداد الجديدة لا يمكن أن تكون أقل من القراءة الحالية");
  }
  await db.update(vehicles).set({ ...input, lastOilChangeDate: input.lastOilChangeDate ? new Date(input.lastOilChangeDate) : input.lastOilChangeDate === "" ? null : undefined, insuranceExpiryDate: input.insuranceExpiryDate ? new Date(input.insuranceExpiryDate) : input.insuranceExpiryDate === "" ? null : undefined, inspectionExpiryDate: input.inspectionExpiryDate ? new Date(input.inspectionExpiryDate) : input.inspectionExpiryDate === "" ? null : undefined, registrationExpiryDate: input.registrationExpiryDate ? new Date(input.registrationExpiryDate) : input.registrationExpiryDate === "" ? null : undefined }).where(eq(vehicles.id, id));
}

export async function deleteVehicle(id: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const [vehicleRows, contractRows, maintenanceRows] = await Promise.all([
    db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.id, id)).limit(1),
    db.select({ id: contracts.id }).from(contracts).where(eq(contracts.vehicleId, id)).limit(1),
    db.select({ id: maintenanceRecords.id }).from(maintenanceRecords).where(eq(maintenanceRecords.vehicleId, id)).limit(1),
  ]);
  if (!vehicleRows[0]) throw new Error("السيارة غير موجودة أو تم حذفها مسبقاً");
  if (contractRows[0]) throw new Error("لا يمكن حذف السيارة لوجود عقود مرتبطة بها؛ احتفظ بها في السجل التاريخي");
  if (maintenanceRows[0]) throw new Error("لا يمكن حذف السيارة لوجود سجل صيانة مرتبط بها؛ احتفظ بها في السجل التاريخي");
  await db.delete(vehicles).where(eq(vehicles.id, id));
  return { success: true };
}

export async function listContractOperations(contractId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(contractOperations).where(eq(contractOperations.contractId, contractId)).orderBy(desc(contractOperations.createdAt));
}

export async function listAllContractOperations(filters: { from?: string; to?: string } = {}) {
  const db = await getDb(); if (!db) return [];
  const conditions = [];
  if (filters.from) conditions.push(sql`${contractOperations.createdAt} >= ${new Date(`${filters.from}T00:00:00.000`)}`);
  if (filters.to) {
    const nextDay = new Date(`${filters.to}T00:00:00.000`);
    nextDay.setDate(nextDay.getDate() + 1);
    conditions.push(sql`${contractOperations.createdAt} < ${nextDay}`);
  }
  return db.select({ operation: contractOperations, contract: contracts, customer: customers, vehicle: vehicles })
    .from(contractOperations)
    .leftJoin(contracts, eq(contractOperations.contractId, contracts.id))
    .leftJoin(customers, eq(contracts.customerId, customers.id))
    .leftJoin(vehicles, eq(contractOperations.vehicleId, vehicles.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(contractOperations.createdAt));
}

export async function listPayments() {
  const db = await getDb(); if (!db) return [];
  return db.select({ payment: payments, contract: contracts, customer: customers }).from(payments).leftJoin(contracts, eq(payments.contractId, contracts.id)).leftJoin(customers, eq(payments.customerId, customers.id)).orderBy(desc(payments.createdAt));
}

export async function listReturns() {
  const db = await getDb(); if (!db) return [];
  return db.select({ operation: contractOperations, contract: contracts, vehicle: vehicles, customer: customers }).from(contractOperations).innerJoin(contracts, eq(contractOperations.contractId, contracts.id)).leftJoin(vehicles, eq(contractOperations.vehicleId, vehicles.id)).leftJoin(customers, eq(contracts.customerId, customers.id)).where(eq(contractOperations.operation, "return")).orderBy(desc(contractOperations.createdAt));
}

export async function getPaymentForReceipt(paymentId: number) {
  const db = await getDb(); if (!db) return null;
  const rows = await db.select({ payment: payments, contract: contracts, customer: customers }).from(payments).leftJoin(contracts, eq(payments.contractId, contracts.id)).leftJoin(customers, eq(payments.customerId, customers.id)).where(eq(payments.id, paymentId)).limit(1);
  return rows[0] ?? null;
}

export async function nextContractNumber() {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const rows = await db.select({ contractNumber: contracts.contractNumber }).from(contracts);
  return computeNextContractNumber(rows.map((row) => row.contractNumber));
}

export async function createContract(input: { contractNumber?: string; customerId: number; vehicleId: number; vehicleMileage?: number; type: "daily" | "monthly"; contractScope?: "domestic_limited" | "domestic_open" | "international"; startDate: string; expectedReturnDate: string; rentalAmount: string; days: number; totalAmount: string; paidAmount?: string; notes?: string; createdBy?: number }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const available = await listAvailableVehicles();
  const selectedVehicle = available.find((vehicle) => vehicle.id === input.vehicleId);
  if (!selectedVehicle) throw new Error("السيارة غير متاحة للتأجير بسبب عقد أو صيانة مفتوحة");
  if (input.vehicleMileage !== undefined && !isMileageAdvanceValid(selectedVehicle.mileage, input.vehicleMileage)) throw new Error("قراءة العداد الجديدة لا يمكن أن تكون أقل من القراءة الحالية");
  const contractNumber = input.contractNumber?.trim() || await nextContractNumber();
  const { vehicleMileage: _vehicleMileage, ...contractInput } = input;
  const result = await db.insert(contracts).values({ ...contractInput, contractNumber, startDate: new Date(input.startDate), expectedReturnDate: new Date(input.expectedReturnDate), paidAmount: input.paidAmount ?? "0", createdBy: input.createdBy ?? null });
  const contractId = Number(result[0]?.insertId);
  await db.update(vehicles).set({ status: "rented", ...(input.vehicleMileage !== undefined ? { mileage: input.vehicleMileage } : {}) }).where(eq(vehicles.id, input.vehicleId!));
  const contractNotes = `${input.notes?.trim() ?? ""}${input.vehicleMileage !== undefined ? `${input.notes?.trim() ? "؛ " : ""}قراءة العداد عند فتح العقد: ${input.vehicleMileage.toLocaleString()} كم` : ""}`.trim();
  await db.insert(contractOperations).values({ contractId, operation: "new_contract", vehicleId: input.vehicleId, details: contractNotes ? `إنشاء عقد ${input.type}؛ ملاحظات العقد: ${contractNotes}` : `إنشاء عقد ${input.type}`, createdBy: input.createdBy });
  return { id: contractId, contractNumber };
}

export async function getOfficeInsights() {
  const [vehicleRows, contractRows, customerRows, paymentRows, maintenanceRows, operationRows] = await Promise.all([listVehicles(), listContracts(), listCustomers(), listPayments(), listMaintenance(), listAllContractOperations()]);
  const paymentsByContract = new Map<number, number>();
  paymentRows.forEach((payment: any) => paymentsByContract.set(payment.contractId, (paymentsByContract.get(payment.contractId) ?? 0) + Number(payment.amount ?? 0)));
  const maintenanceByVehicle = new Map<number, number>();
  maintenanceRows.forEach((record: any) => maintenanceByVehicle.set(record.vehicleId, (maintenanceByVehicle.get(record.vehicleId) ?? 0) + Number(record.cost ?? 0)));
  const contractsByVehicle = new Map<number, any[]>();
  const vehiclesById = new Map<number, any>(vehicleRows.map((vehicle: any) => [vehicle.id, vehicle]));
  const customersById = new Map<number, any>(customerRows.map((customer: any) => [customer.id, customer]));
  contractRows.forEach((contract: any) => { const list = contractsByVehicle.get(contract.vehicleId) ?? []; list.push(contract); contractsByVehicle.set(contract.vehicleId, list); });
  const insights = buildOfficeInsights({
    vehicles: vehicleRows.map((vehicle: any) => { const vehicleContracts = contractsByVehicle.get(vehicle.id) ?? []; return { id: vehicle.id, plateNumber: vehicle.plateNumber, rentalDays: vehicleContracts.reduce((sum, contract) => sum + Number(contract.days ?? 0), 0), rentalRevenue: vehicleContracts.reduce((sum, contract) => sum + Number(contract.totalAmount ?? 0), 0), otherRevenue: 0, maintenanceCost: maintenanceByVehicle.get(vehicle.id) ?? 0 }; }),
    customers: customerRows.map((customer: any) => { const customerContracts = contractRows.filter((contract: any) => contract.customerId === customer.id); return { id: customer.id, fullName: customer.fullName, previousContracts: customerContracts.length, latePaymentContracts: customerContracts.filter((contract: any) => contract.status === "overdue" || Number(contract.totalAmount ?? 0) > (paymentsByContract.get(contract.id) ?? Number(contract.paidAmount ?? 0))).length }; }),
    contracts: contractRows.map((contract: any) => ({ id: contract.id, contractNumber: contract.contractNumber, customerId: contract.customerId, hasAdvancePayment: Number(paymentsByContract.get(contract.id) ?? contract.paidAmount ?? 0) > 0, durationDays: Number(contract.days ?? 0), customerDataComplete: Boolean(customersById.get(contract.customerId)?.identityNumber && customersById.get(contract.customerId)?.fullName && customersById.get(contract.customerId)?.phone), vehicleInsured: Boolean(vehiclesById.get(contract.vehicleId)?.insuranceExpiryDate && new Date(vehiclesById.get(contract.vehicleId).insuranceExpiryDate).getTime() >= Date.now()), previousDelayDays: contract.status === "overdue" ? -1 : 0, status: contract.status, hasReturnOrExtension: contract.status !== "closed" && contract.status !== "returned" || operationRows.some((operation: any) => operation.contractId === contract.id && ["return", "extension"].includes(operation.operation)) })),
    operationsToday: operationRows.filter((operation: any) => new Date(operation.createdAt).toDateString() === new Date().toDateString()).map((operation: any) => ({ userId: Number(operation.createdBy ?? 0), userName: "مستخدم النظام", financial: ["payment", "additional_fee", "rate_update"].includes(operation.operation) })),
  });
  return insights;
}

export async function getDashboardAlerts() {
  const db = await getDb(); if (!db) return [];
  await db.update(contracts).set({ status: "overdue" }).where(and(eq(contracts.status, "active"), sql`${contracts.expectedReturnDate} < curdate()`));
  const alerts: Array<{ type: "overdue" | "maintenance" | "document"; title: string; description: string; severity: "warning" | "danger" }> = [];
  const overdue = await db.select({ contractNumber: contracts.contractNumber, expectedReturnDate: contracts.expectedReturnDate }).from(contracts).where(eq(contracts.status, "overdue")).orderBy(desc(contracts.expectedReturnDate));
  const maintenance = await db.select({ plateNumber: vehicles.plateNumber, make: vehicles.make, model: vehicles.model }).from(vehicles).where(eq(vehicles.status, "maintenance")).orderBy(desc(vehicles.updatedAt));
  const oilDue = await db.select({ plateNumber: vehicles.plateNumber, mileage: vehicles.mileage, lastOilChangeMileage: vehicles.lastOilChangeMileage, oilChangeInterval: vehicles.oilChangeInterval }).from(vehicles).where(sql`${vehicles.lastOilChangeMileage} is not null and ${vehicles.mileage} >= ${vehicles.lastOilChangeMileage} + ${vehicles.oilChangeInterval}`);
  const documentedVehicles = await db.select({ plateNumber: vehicles.plateNumber, insuranceExpiryDate: vehicles.insuranceExpiryDate, inspectionExpiryDate: vehicles.inspectionExpiryDate, registrationExpiryDate: vehicles.registrationExpiryDate }).from(vehicles);
  const horizon = Date.now() + 30 * 86400000;
  const documents: Array<{ plateNumber: string; label: string; value: Date }> = [];
  documentedVehicles.forEach((vehicle) => { ([['التأمين', vehicle.insuranceExpiryDate], ['الفحص الدوري', vehicle.inspectionExpiryDate], ['الاستمارة', vehicle.registrationExpiryDate] ] as const).forEach(([label, value]) => { if (value) { const expiry = new Date(value); if (expiry.getTime() <= horizon) documents.push({ plateNumber: vehicle.plateNumber, label, value: expiry }); } }); });
  overdue.slice(0, 10).forEach((contract) => alerts.push({ type: "overdue", title: `العقد ${contract.contractNumber} متأخر`, description: `تاريخ التسليم المتوقع ${contract.expectedReturnDate}`, severity: "danger" }));
  maintenance.slice(0, 10).forEach((vehicle) => alerts.push({ type: "maintenance", title: `السيارة ${vehicle.plateNumber} تحتاج صيانة`, description: `${vehicle.make} ${vehicle.model} غير متاحة للتأجير`, severity: "warning" }));
  oilDue.slice(0, 10).forEach((vehicle) => alerts.push({ type: "maintenance", title: `موعد تغيير زيت السيارة ${vehicle.plateNumber}`, description: `العداد الحالي ${vehicle.mileage.toLocaleString()} كم؛ الموعد عند ${((vehicle.lastOilChangeMileage ?? 0) + vehicle.oilChangeInterval).toLocaleString()} كم`, severity: "warning" }));
  documents.sort((a, b) => a.value.getTime() - b.value.getTime()).slice(0, 10).forEach((document) => alerts.push({ type: "document", title: `وثيقة ${document.label} للسيارة ${document.plateNumber}`, description: `تاريخ الانتهاء ${document.value.toLocaleDateString("ar-SA")}`, severity: document.value.getTime() < Date.now() ? "danger" : "warning" }));
  return alerts;
}

export async function listOfficeLiabilities() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(officeLiabilities).orderBy(desc(officeLiabilities.createdAt));
}

export async function listExpenseTypes() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(expenseTypes).where(eq(expenseTypes.isActive, true)).orderBy(expenseTypes.name);
}
export async function createExpenseType(input: { name: string; recurrence: "one_time" | "monthly" | "quarterly" | "semiannual" | "annual"; defaultAmount?: string }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  if (!input.name.trim()) throw new Error("اسم نوع المصروف مطلوب");
  return db.insert(expenseTypes).values({ name: input.name.trim(), recurrence: input.recurrence, defaultAmount: input.defaultAmount || "0" });
}
export async function listEmployees() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(employees).where(eq(employees.isActive, true)).orderBy(employees.fullName);
}
export async function createEmployee(input: { fullName: string; salary: string; hireDate: string }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  if (!input.fullName.trim() || Number(input.salary) < 0 || !input.hireDate) throw new Error("بيانات الموظف غير صحيحة");
  return db.insert(employees).values({ fullName: input.fullName.trim(), salary: input.salary, hireDate: new Date(input.hireDate) });
}

export async function createOfficeLiability(input: { category: string; description: string; amount: string; dueDate?: string; expenseDate?: string; expenseTypeId?: number; employeeId?: number; notes?: string; expenseReason?: string; contractNumber?: string; createdBy?: number }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  if (!input.description.trim() || !input.amount.trim() || Number(input.amount) <= 0) throw new Error("بيانات المصروف غير صحيحة");
  if (input.contractNumber && !input.expenseReason?.trim()) throw new Error("سبب تحويل الدائن مطلوب عند ربط المصروف بعقد");
  return db.insert(officeLiabilities).values({ ...input, dueDate: input.dueDate ? new Date(input.dueDate) : null, expenseDate: input.expenseDate ? new Date(input.expenseDate) : null, expenseTypeId: input.expenseTypeId || null, employeeId: input.employeeId || null, expenseReason: input.expenseReason?.trim() || null, contractNumber: input.contractNumber?.trim() || null, createdBy: input.createdBy });
}

export async function updateOfficeLiability(input: { id: number; category?: string; description?: string; amount?: string; dueDate?: string | null; expenseDate?: string | null; notes?: string | null; reason: string; updatedBy?: number }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable"); if (!input.reason.trim()) throw new Error("سبب تعديل الالتزام مطلوب");
  const existing = await db.select().from(officeLiabilities).where(eq(officeLiabilities.id, input.id)).limit(1); const item = existing[0]; if (!item) throw new Error("الالتزام غير موجود");
  const values: Record<string, unknown> = {}; for (const key of ["category", "description", "amount", "notes"] as const) if (input[key] !== undefined) values[key] = input[key]; if (input.dueDate !== undefined) values.dueDate = input.dueDate ? new Date(input.dueDate) : null; if (input.expenseDate !== undefined) values.expenseDate = input.expenseDate ? new Date(input.expenseDate) : null;
  await db.update(officeLiabilities).set(values).where(eq(officeLiabilities.id, input.id)); await db.insert(deletionAudits).values({ entityType: "liability_edit", entityId: input.id, snapshot: JSON.stringify({ before: item, after: values }), reason: input.reason.trim(), deletedBy: input.updatedBy }); return { success: true as const };
}

export async function deleteOfficeLiabilitySafely(input: { id: number; reason: string; deletedBy?: number }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable"); if (!input.reason.trim()) throw new Error("سبب حذف الالتزام مطلوب");
  const existing = await db.select().from(officeLiabilities).where(eq(officeLiabilities.id, input.id)).limit(1); const item = existing[0]; if (!item) throw new Error("الالتزام غير موجود");
  await db.insert(deletionAudits).values({ entityType: "liability", entityId: input.id, snapshot: JSON.stringify(item), reason: input.reason.trim(), deletedBy: input.deletedBy }); await db.delete(officeLiabilities).where(eq(officeLiabilities.id, input.id)); return { success: true as const };
}

export async function approveOfficeLiability(input: { id: number; status: "approved" | "rejected"; approvedBy: number; reason?: string }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const rows = await db.select().from(officeLiabilities).where(eq(officeLiabilities.id, input.id)).limit(1);
  if (!rows[0]) throw new Error("الالتزام غير موجود");
  if (input.status === "rejected" && !input.reason?.trim()) throw new Error("سبب رفض المصروف مطلوب");
  await db.update(officeLiabilities).set({ approvalStatus: input.status, approvedBy: input.approvedBy, approvedAt: new Date(), notes: input.reason?.trim() ? `${rows[0].notes ?? ""}${rows[0].notes ? "؛ " : ""}سبب القرار: ${input.reason.trim()}` : rows[0].notes }).where(eq(officeLiabilities.id, input.id));
  return { success: true as const, status: input.status };
}

export async function recordOfficeLiabilityPayment(id: number, amount: string, paymentMethod: "cash" | "network" | "transfer") {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const rows = await db.select().from(officeLiabilities).where(eq(officeLiabilities.id, id)).limit(1);
  const liability = rows[0];
  if (!liability) throw new Error("الالتزام غير موجود");
  const nextPaid = Math.min(Number(liability.amount), Number(liability.paidAmount) + Number(amount));
  const status = nextPaid >= Number(liability.amount) ? "paid" : nextPaid > 0 ? "partially_paid" : "open";
  await db.update(officeLiabilities).set({ paidAmount: nextPaid.toFixed(2), status, paymentMethod }).where(eq(officeLiabilities.id, id));
}

export async function getOfficeLiabilitySummary() {
  const rows = await listOfficeLiabilities();
  const approvedRows = rows.filter((row) => row.approvalStatus === "approved");
  const total = approvedRows.reduce((sum, row) => sum + Number(row.amount), 0);
  const paid = approvedRows.reduce((sum, row) => sum + Number(row.paidAmount), 0);
  return { total: total.toFixed(2), paid: paid.toFixed(2), outstanding: Math.max(0, total - paid).toFixed(2), count: rows.length, pendingCount: rows.filter((row) => row.approvalStatus === "pending").length };
}

export async function getVehicleRevenueReport(filters: { from?: string; to?: string } = {}) {
  const db = await getDb();   if (!db) return { vehicles: [], totals: { baseContractValue: "0.00", contractValue: "0.00", delayTotal: "0.00", grandTotal: "0.00", collected: "0.00", otherRevenue: "0.00", cash: "0.00", network: "0.00", outstanding: "0.00", excludedOutstanding: "0.00", expenses: "0.00", netRevenue: "0.00" } };
  const contractDateFilter = filters.from || filters.to ? and(filters.from ? or(gte(contracts.startDate, new Date(filters.from)), gte(contracts.updatedAt, new Date(filters.from))) : undefined, filters.to ? or(lte(contracts.startDate, new Date(`${filters.to}T23:59:59`)), lte(contracts.updatedAt, new Date(`${filters.to}T23:59:59`))) : undefined) : undefined;
  const paymentDateFilter = filters.from || filters.to ? and(filters.from ? gte(payments.createdAt, new Date(filters.from)) : undefined, filters.to ? lte(payments.createdAt, new Date(`${filters.to}T23:59:59`)) : undefined) : undefined;
  const contractsRows = await db.select({ contract: contracts, vehicle: vehicles }).from(contracts).leftJoin(vehicles, eq(contracts.vehicleId, vehicles.id)).where(contractDateFilter);
  const expenseDateFilter = filters.from || filters.to ? and(filters.from ? sql`COALESCE(${officeLiabilities.expenseDate}, ${officeLiabilities.createdAt}) >= ${new Date(filters.from)}` : undefined, filters.to ? sql`COALESCE(${officeLiabilities.expenseDate}, ${officeLiabilities.createdAt}) <= ${new Date(`${filters.to}T23:59:59`)}` : undefined) : undefined;
  const expenseRows = await db.select({ amount: officeLiabilities.amount }).from(officeLiabilities).where(and(expenseDateFilter, eq(officeLiabilities.approvalStatus, "approved")));
  const paymentsRows = await db.select({ payment: payments, contract: contracts, vehicle: vehicles }).from(payments).innerJoin(contracts, eq(payments.contractId, contracts.id)).leftJoin(vehicles, eq(contracts.vehicleId, vehicles.id)).where(paymentDateFilter);
  const paymentPresenceRows = await db.select({ contractId: payments.contractId }).from(payments);
  const contractsWithPayments = new Set(paymentPresenceRows.map((row) => row.contractId));
  const paymentTotalsByContract = new Map<number, number>();
  for (const row of paymentsRows) paymentTotalsByContract.set(row.payment.contractId, (paymentTotalsByContract.get(row.payment.contractId) ?? 0) + Number(row.payment.amount));
  const excludedOutstanding = contractsRows.filter(({ contract }) => contract.status === "overdue" || contract.status === "suspended").reduce((sum, { contract }) => { const totals = calculateContractTotals({ baseTotal: contract.totalAmount, expectedReturnDate: contract.expectedReturnDate, rentalAmount: contract.rentalAmount, type: contract.type, actualReturnDate: contract.actualReturnDate }); return sum + Math.max(0, Number(totals.grandTotal) - Number(contract.paidAmount)); }, 0);
  const byVehicle = new Map<number, { vehicleId: number; vehicleName: string; plateNumber: string; baseContractValue: number; delayTotal: number; grandTotal: number; collected: number; otherRevenue: number; cash: number; network: number; outstanding: number; months: Array<{ month: string; collected: string; otherRevenue: string; cash: string; network: string }> }>();
  for (const row of contractsRows) {
    if (!row.vehicle) continue;
    const current = byVehicle.get(row.vehicle.id) ?? { vehicleId: row.vehicle.id, vehicleName: `${row.vehicle.make} ${row.vehicle.model}`, plateNumber: row.vehicle.plateNumber, baseContractValue: 0, delayTotal: 0, grandTotal: 0, collected: 0, otherRevenue: 0, cash: 0, network: 0, outstanding: 0, months: [] };
    const totals = calculateContractTotals({ baseTotal: row.contract.totalAmount, expectedReturnDate: row.contract.expectedReturnDate, rentalAmount: row.contract.rentalAmount, type: row.contract.type, actualReturnDate: row.contract.actualReturnDate });
    if (row.contract.status !== "overdue" && row.contract.status !== "suspended") {
      current.baseContractValue += Number(totals.baseTotal);
      current.delayTotal += Number(totals.delayTotal);
      current.grandTotal += Number(totals.grandTotal);
      current.outstanding += Math.max(0, Number(totals.grandTotal) - Number(row.contract.paidAmount));
    }
    const recordedPayments = paymentTotalsByContract.get(row.contract.id) ?? 0;
    const legacyAmount = Math.max(0, Number(row.contract.paidAmount) - recordedPayments);
    if (legacyAmount > 0) {
      const month = new Date(row.contract.startDate).toISOString().slice(0, 7);
      current.collected += legacyAmount;
      const monthRow = current.months.find((entry) => entry.month === month);
      if (monthRow) monthRow.collected = (Number(monthRow.collected) + legacyAmount).toFixed(2);
      else current.months.push({ month, collected: legacyAmount.toFixed(2), otherRevenue: "0.00", cash: "0.00", network: "0.00" });
    }
    byVehicle.set(row.vehicle.id, current);
  }
  for (const row of paymentsRows) {
    if (!row.vehicle) continue;
    const current = byVehicle.get(row.vehicle.id) ?? { vehicleId: row.vehicle.id, vehicleName: `${row.vehicle.make} ${row.vehicle.model}`, plateNumber: row.vehicle.plateNumber, baseContractValue: 0, delayTotal: 0, grandTotal: 0, collected: 0, otherRevenue: 0, cash: 0, network: 0, outstanding: 0, months: [] };
    const month = new Date(row.payment.createdAt).toISOString().slice(0, 7);
    const amount = Number(row.payment.amount);
    const method = row.payment.method;
    const otherRevenue = isOtherRevenueReason(row.payment.notes);
    if (otherRevenue) current.otherRevenue += amount;
    else {
      current.collected += amount;
      if (method === "cash") current.cash += amount;
      if (method === "network") current.network += amount;
    }
    const monthRow = current.months.find((entry) => entry.month === month);
    if (monthRow) {
      if (otherRevenue) monthRow.otherRevenue = (Number(monthRow.otherRevenue) + amount).toFixed(2);
      else {
        monthRow.collected = (Number(monthRow.collected) + amount).toFixed(2);
        if (method === "cash") monthRow.cash = (Number(monthRow.cash) + amount).toFixed(2);
        if (method === "network") monthRow.network = (Number(monthRow.network) + amount).toFixed(2);
      }
    } else current.months.push({ month, collected: otherRevenue ? "0.00" : amount.toFixed(2), otherRevenue: otherRevenue ? amount.toFixed(2) : "0.00", cash: !otherRevenue && method === "cash" ? amount.toFixed(2) : "0.00", network: !otherRevenue && method === "network" ? amount.toFixed(2) : "0.00" });
    byVehicle.set(row.vehicle.id, current);
  }
  const report = Array.from(byVehicle.values()).map((row) => ({ ...row, baseContractValue: row.baseContractValue.toFixed(2), contractValue: row.baseContractValue.toFixed(2), delayTotal: row.delayTotal.toFixed(2), grandTotal: row.grandTotal.toFixed(2), collected: row.collected.toFixed(2), otherRevenue: row.otherRevenue.toFixed(2), cash: row.cash.toFixed(2), network: row.network.toFixed(2), outstanding: row.outstanding.toFixed(2), months: row.months.sort((a, b) => b.month.localeCompare(a.month)) }));
  const totals = { baseContractValue: report.reduce((sum, row) => sum + Number(row.baseContractValue), 0), contractValue: report.reduce((sum, row) => sum + Number(row.baseContractValue), 0), delayTotal: report.reduce((sum, row) => sum + Number(row.delayTotal), 0), grandTotal: report.reduce((sum, row) => sum + Number(row.grandTotal), 0), collected: report.reduce((sum, row) => sum + Number(row.collected), 0), otherRevenue: report.reduce((sum, row) => sum + Number(row.otherRevenue), 0), cash: report.reduce((sum, row) => sum + Number(row.cash), 0), network: report.reduce((sum, row) => sum + Number(row.network), 0), outstanding: report.reduce((sum, row) => sum + Number(row.outstanding), 0), excludedOutstanding, expenses: expenseRows.reduce((sum, row) => sum + Number(row.amount), 0) };
  return { vehicles: report, totals: { ...Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, Number(value).toFixed(2)])), netRevenue: Math.max(0, totals.collected + totals.otherRevenue - totals.expenses).toFixed(2) } };
}

export async function getAccountingSummary() {
  const db = await getDb(); if (!db) return { revenue: "0.00", outstanding: "0.00", paymentsCount: 0 };
  const [revenue, contractRows, paymentsCount] = await Promise.all([
    db.select({ amount: sql<string>`coalesce(sum(${payments.amount}), 0)` }).from(payments),
    db.select({ totalAmount: contracts.totalAmount, paidAmount: contracts.paidAmount, expectedReturnDate: contracts.expectedReturnDate, actualReturnDate: contracts.actualReturnDate, rentalAmount: contracts.rentalAmount, type: contracts.type, status: contracts.status }).from(contracts),
    db.select({ count: sql<number>`count(*)` }).from(payments),
  ]);
  const outstanding = contractRows.filter((contract) => belongsToGeneralOutstanding(contract.status)).reduce((sum, contract) => {
    const totals = calculateContractTotals({ baseTotal: contract.totalAmount, expectedReturnDate: contract.expectedReturnDate, rentalAmount: contract.rentalAmount, type: contract.type, actualReturnDate: contract.actualReturnDate });
    return sum + Math.max(0, Number(totals.grandTotal) - Number(contract.paidAmount));
  }, 0);
  return { revenue: String(revenue[0]?.amount ?? "0.00"), outstanding: outstanding.toFixed(2), paymentsCount: Number(paymentsCount[0]?.count ?? 0) };
}

export async function getOperationalAccountingSummary() {
  const db = await getDb(); if (!db) return { revenue: "0.00", outstanding: "0.00", paymentsCount: 0, revenueToday: "0.00" };
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const revenue = await db.select({ amount: sql<string>`coalesce(sum(${payments.amount}), 0)`, count: sql<number>`count(*)` }).from(payments).where(gte(payments.createdAt, start));
  const amount = Number(revenue[0]?.amount ?? 0).toFixed(2);
  return { revenue: amount, outstanding: "0.00", paymentsCount: Number(revenue[0]?.count ?? 0), revenueToday: amount };
}

export async function getFleetReport() {
  const db = await getDb(); if (!db) return { total: 0, available: 0, rented: 0, maintenance: 0, unavailable: 0 };
  const rows = await db.select({ status: vehicles.status, count: sql<number>`count(*)` }).from(vehicles).groupBy(vehicles.status);
  const result = { total: 0, available: 0, rented: 0, maintenance: 0, unavailable: 0 };
  rows.forEach((row) => { const count = Number(row.count); result.total += count; if (row.status === "available") result.available = count; if (row.status === "rented" || row.status === "reserved") result.rented += count; if (row.status === "maintenance") result.maintenance = count; if (row.status === "unavailable") result.unavailable = count; });
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
  notes?: string | null;
  reason: string;
  createdBy?: number;
}) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  if (!input.reason.trim()) throw new Error("سبب التعديل مطلوب");
  const existing = await db.select().from(contracts).where(eq(contracts.id, input.id)).limit(1);
  const contract = existing[0];
  if (!contract) throw new Error("العقد غير موجود");
  const values: Record<string, unknown> = {};
  if (input.contractNumber !== undefined) values.contractNumber = input.contractNumber.trim();
  if (input.customerId !== undefined) values.customerId = input.customerId;
  if (input.vehicleId !== undefined) values.vehicleId = input.vehicleId;
  if (input.type !== undefined) values.type = input.type;
  if (input.contractScope !== undefined) values.contractScope = input.contractScope;
  if (input.status !== undefined) values.status = input.status;
  if (input.startDate !== undefined) values.startDate = new Date(input.startDate);
  if (input.expectedReturnDate !== undefined) values.expectedReturnDate = new Date(input.expectedReturnDate);
  if (input.actualReturnDate !== undefined) values.actualReturnDate = input.actualReturnDate ? new Date(input.actualReturnDate) : null;
  if (input.rentalAmount !== undefined) values.rentalAmount = input.rentalAmount;
  if (input.days !== undefined) values.days = input.days;
  if (input.totalAmount !== undefined) values.totalAmount = input.totalAmount;
  if (input.notes !== undefined) values.notes = input.notes;
  if (!Object.keys(values).length) throw new Error("لم يتم إدخال أي تعديل");
  await db.update(contracts).set(values).where(eq(contracts.id, input.id));
  const changed = Object.keys(values).map((key) => `${key}: ${String((contract as Record<string, unknown>)[key])} ← ${String(values[key])}`).join("؛ ");
  await db.insert(contractOperations).values({ contractId: input.id, operation: "rate_update", amount: input.totalAmount ?? contract.totalAmount, details: `تعديل عقد بأثر رجعي؛ ${changed}؛ السبب: ${input.reason.trim()}`, createdBy: input.createdBy });
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
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  if (!input.reason.trim()) throw new Error("سبب تعديل الدفعة مطلوب");
  const existing = await db.select().from(payments).where(eq(payments.id, input.id)).limit(1);
  const payment = existing[0];
  if (!payment) throw new Error("الدفعة غير موجودة");
  const values: Record<string, unknown> = {};
  if (input.amount !== undefined) {
    if (!Number.isFinite(Number(input.amount)) || Number(input.amount) <= 0) throw new Error("قيمة الدفعة يجب أن تكون أكبر من صفر");
    values.amount = input.amount;
  }
  if (input.method !== undefined) values.method = input.method;
  if (input.notes !== undefined) values.notes = input.notes;
  if (!Object.keys(values).length) throw new Error("لم يتم إدخال أي تعديل");
  await db.update(payments).set(values).where(eq(payments.id, input.id));
  const allPayments = await db.select({ amount: payments.amount }).from(payments).where(eq(payments.contractId, payment.contractId));
  const paidAmount = allPayments.reduce((sum, row) => sum + Number(row.amount), 0);
  await db.update(contracts).set({ paidAmount: paidAmount.toFixed(2) }).where(eq(contracts.id, payment.contractId));
  const changed = Object.keys(values).map((key) => `${key}: ${String((payment as Record<string, unknown>)[key])} ← ${String(values[key])}`).join("؛ ");
  await db.insert(contractOperations).values({ contractId: payment.contractId, operation: "payment", amount: String(values.amount ?? payment.amount), paymentMethod: (values.method ?? payment.method) as "cash" | "network" | "transfer", details: `تعديل دفعة بأثر رجعي #${payment.id}؛ ${changed}؛ السبب: ${input.reason.trim()}`, createdBy: input.createdBy });
  return { success: true as const, contractId: payment.contractId, paidAmount: paidAmount.toFixed(2) };
}

export async function deletePaymentSafely(input: { id: number; reason: string; deletedBy?: number }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  if (!input.reason.trim()) throw new Error("سبب حذف الدفعة مطلوب");
  const rows = await db.select().from(payments).where(eq(payments.id, input.id)).limit(1);
  const payment = rows[0];
  if (!payment) throw new Error("الدفعة غير موجودة أو حذفت مسبقاً");
  await db.insert(deletionAudits).values({ entityType: "payment", entityId: payment.id, contractId: payment.contractId, snapshot: JSON.stringify(payment), reason: input.reason.trim(), deletedBy: input.deletedBy });
  await db.delete(payments).where(eq(payments.id, payment.id));
  const remainingPayments = await db.select({ amount: payments.amount }).from(payments).where(eq(payments.contractId, payment.contractId));
  const paidAmount = remainingPayments.reduce((sum, row) => sum + Number(row.amount), 0).toFixed(2);
  await db.update(contracts).set({ paidAmount }).where(eq(contracts.id, payment.contractId));
  await db.insert(contractOperations).values({ contractId: payment.contractId, operation: "payment", amount: "0", details: `حذف دفعة آمن #${payment.id} بقيمة ${payment.amount} ر.س؛ السبب: ${input.reason.trim()}`, createdBy: input.deletedBy });
  return { success: true as const, contractId: payment.contractId, paidAmount };
}

export async function deleteOperationSafely(input: { id: number; reason: string; deletedBy?: number }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  if (!input.reason.trim()) throw new Error("سبب حذف العملية مطلوب");
  const rows = await db.select().from(contractOperations).where(eq(contractOperations.id, input.id)).limit(1);
  const operation = rows[0];
  if (!operation) throw new Error("العملية غير موجودة أو حذفت مسبقاً");
  await db.insert(deletionAudits).values({ entityType: "operation", entityId: operation.id, contractId: operation.contractId, snapshot: JSON.stringify(operation), reason: input.reason.trim(), deletedBy: input.deletedBy });
  await db.delete(contractOperations).where(eq(contractOperations.id, operation.id));
  return { success: true as const, contractId: operation.contractId };
}

export async function deleteContractSafely(input: { id: number; reason: string; deletedBy?: number }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  if (!input.reason.trim()) throw new Error("سبب حذف العقد مطلوب");
  const rows = await db.select().from(contracts).where(eq(contracts.id, input.id)).limit(1);
  const contract = rows[0];
  if (!contract) throw new Error("العقد غير موجود أو حذف مسبقاً");
  const [paymentRows, operationRows] = await Promise.all([
    db.select().from(payments).where(eq(payments.contractId, contract.id)),
    db.select().from(contractOperations).where(eq(contractOperations.contractId, contract.id)),
  ]);
  await db.insert(deletionAudits).values([
    { entityType: "contract", entityId: contract.id, contractId: contract.id, snapshot: JSON.stringify(contract), reason: input.reason.trim(), deletedBy: input.deletedBy },
    ...paymentRows.map((payment) => ({ entityType: "payment", entityId: payment.id, contractId: contract.id, snapshot: JSON.stringify(payment), reason: `حذف مع العقد #${contract.contractNumber}: ${input.reason.trim()}`, deletedBy: input.deletedBy })),
    ...operationRows.map((operation) => ({ entityType: "operation", entityId: operation.id, contractId: contract.id, snapshot: JSON.stringify(operation), reason: `حذف مع العقد #${contract.contractNumber}: ${input.reason.trim()}`, deletedBy: input.deletedBy })),
  ]);
  await db.delete(payments).where(eq(payments.contractId, contract.id));
  await db.delete(contractOperations).where(eq(contractOperations.contractId, contract.id));
  await db.delete(contracts).where(eq(contracts.id, contract.id));
  await db.update(vehicles).set({ status: "available" }).where(eq(vehicles.id, contract.vehicleId));
  return { success: true as const, vehicleId: contract.vehicleId };
}
