import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, contractOperations, contracts, customers, maintenanceRecords, officeLiabilities, payments, users, vehicles } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { buildOperationEffects, getContractReference, validateVehicleSwap } from "../shared/contractOperations";
import { nextContractNumber as computeNextContractNumber } from "../shared/contractNumbers";
import { extendReturnDate, isFinanciallyDistressed } from "../shared/contractCalculation";
import { addAdditionalFee, calculateRateAdjustedTotal } from "../shared/contractFinance";
import { isMileageAdvanceValid } from "../shared/vehicleMaintenance";

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

export async function listContracts(status?: "active" | "overdue" | "suspended" | "closed" | "returned") {
  const db = await getDb(); if (!db) return [];
  await db.update(contracts).set({ status: "overdue" }).where(and(eq(contracts.status, "active"), sql`${contracts.expectedReturnDate} < curdate()`));
  const rows = await db.select({ contract: contracts, customer: customers, vehicle: vehicles }).from(contracts).leftJoin(customers, eq(contracts.customerId, customers.id)).leftJoin(vehicles, eq(contracts.vehicleId, vehicles.id)).where(status ? eq(contracts.status, status) : undefined).orderBy(desc(contracts.createdAt));
  const ids = rows.map((row) => row.contract.id);
  const paymentRows = ids.length ? await db.select().from(payments).where(inArray(payments.contractId, ids)).orderBy(desc(payments.createdAt)) : [];
  const latestPaymentByContract = new Map<number, typeof payments.$inferSelect>();
  paymentRows.forEach((payment) => { if (!latestPaymentByContract.has(payment.contractId)) latestPaymentByContract.set(payment.contractId, payment); });
  return rows.map((row) => {
    const currentOutstanding = Math.max(0, Number(row.contract.totalAmount) - Number(row.contract.paidAmount));
    const latestPayment = latestPaymentByContract.get(row.contract.id);
    const previousOutstanding = latestPayment ? Math.min(Number(row.contract.totalAmount), currentOutstanding + Number(latestPayment.amount)) : currentOutstanding;
    return { ...row, previousOutstanding: previousOutstanding.toFixed(2) };
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

export async function recordContractOperation(input: { contractId?: number; contractNumber?: string; operation: "new_contract" | "extension" | "payment" | "additional_fee" | "rate_update" | "vehicle_swap" | "suspend" | "close" | "return"; vehicleId?: number; vehicleMileage?: number; amount?: string; paymentMethod?: "cash" | "network" | "transfer"; extensionDays?: number; details?: string; createdBy?: number }) {
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
    const fee = Number(input.amount);
    operationDetails = `رسوم إضافية: ${fee.toFixed(2)}${input.details ? `؛ ${input.details}` : ""}`;
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
    let replacementIsAvailable = false;
    if (input.vehicleId) {
      const replacement = await db.select().from(vehicles).where(and(eq(vehicles.id, input.vehicleId), eq(vehicles.status, "available"))).limit(1);
      replacementIsAvailable = Boolean(replacement[0]);
    }
    const swapValidation = validateVehicleSwap(contract.vehicleId, input.vehicleId, replacementIsAvailable);
    if (!swapValidation.ok) throw new Error(swapValidation.reason);
    previousVehicleId = contract.vehicleId;
    operationDetails = `تبديل السيارة: ${contract.vehicleId} ← ${input.vehicleId}${input.details ? `؛ ${input.details}` : ""}`;
  }
  await db.insert(contractOperations).values({ contractId, operation: input.operation, vehicleId: input.vehicleId, previousVehicleId, amount: input.amount ?? "0", paymentMethod: input.paymentMethod, details: operationDetails, createdBy: input.createdBy });
  if (effects.shouldCreatePayment && input.amount) {
    const paid = Number(contract.paidAmount) + Number(input.amount);
    await db.update(contracts).set({ paidAmount: paid.toFixed(2) }).where(eq(contracts.id, contractId));
    await db.insert(payments).values({ contractId, customerId: contract.customerId, amount: input.amount, method: input.paymentMethod ?? "cash", notes: input.details });
  }
  if (input.operation === "extension") {
    const nextReturn = extendReturnDate(contract.expectedReturnDate, input.extensionDays!);
    if (!nextReturn) throw new Error("مدة التمديد غير صحيحة");
    await db.update(contracts).set({ expectedReturnDate: nextReturn }).where(eq(contracts.id, contractId));
  }
  if (input.operation === "vehicle_swap") {
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
  if (effects.contractStatus) await db.update(contracts).set({ status: effects.contractStatus }).where(eq(contracts.id, contractId));
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

export async function createContract(input: { contractNumber?: string; customerId: number; vehicleId: number; vehicleMileage?: number; type: "daily" | "monthly"; startDate: string; expectedReturnDate: string; rentalAmount: string; days: number; totalAmount: string; paidAmount?: string; notes?: string; createdBy?: number }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const available = await listAvailableVehicles();
  const selectedVehicle = available.find((vehicle) => vehicle.id === input.vehicleId);
  if (!selectedVehicle) throw new Error("السيارة غير متاحة للتأجير بسبب عقد أو صيانة مفتوحة");
  if (input.vehicleMileage !== undefined && !isMileageAdvanceValid(selectedVehicle.mileage, input.vehicleMileage)) throw new Error("قراءة العداد الجديدة لا يمكن أن تكون أقل من القراءة الحالية");
  const contractNumber = input.contractNumber?.trim() || await nextContractNumber();
  const { vehicleMileage: _vehicleMileage, ...contractInput } = input;
  const result = await db.insert(contracts).values({ ...contractInput, contractNumber, startDate: new Date(input.startDate), expectedReturnDate: new Date(input.expectedReturnDate), paidAmount: input.paidAmount ?? "0" });
  const contractId = Number(result[0]?.insertId);
  await db.update(vehicles).set({ status: "rented", ...(input.vehicleMileage !== undefined ? { mileage: input.vehicleMileage } : {}) }).where(eq(vehicles.id, input.vehicleId!));
  const contractNotes = `${input.notes?.trim() ?? ""}${input.vehicleMileage !== undefined ? `${input.notes?.trim() ? "؛ " : ""}قراءة العداد عند فتح العقد: ${input.vehicleMileage.toLocaleString()} كم` : ""}`.trim();
  await db.insert(contractOperations).values({ contractId, operation: "new_contract", vehicleId: input.vehicleId, details: contractNotes ? `إنشاء عقد ${input.type}؛ ملاحظات العقد: ${contractNotes}` : `إنشاء عقد ${input.type}`, createdBy: input.createdBy });
  return { id: contractId, contractNumber };
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

export async function createOfficeLiability(input: { category: string; description: string; amount: string; dueDate?: string; notes?: string; createdBy?: number }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  return db.insert(officeLiabilities).values({ ...input, dueDate: input.dueDate ? new Date(input.dueDate) : null, createdBy: input.createdBy });
}

export async function recordOfficeLiabilityPayment(id: number, amount: string) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const rows = await db.select().from(officeLiabilities).where(eq(officeLiabilities.id, id)).limit(1);
  const liability = rows[0];
  if (!liability) throw new Error("الالتزام غير موجود");
  const nextPaid = Math.min(Number(liability.amount), Number(liability.paidAmount) + Number(amount));
  const status = nextPaid >= Number(liability.amount) ? "paid" : nextPaid > 0 ? "partially_paid" : "open";
  await db.update(officeLiabilities).set({ paidAmount: nextPaid.toFixed(2), status }).where(eq(officeLiabilities.id, id));
}

export async function getOfficeLiabilitySummary() {
  const rows = await listOfficeLiabilities();
  const total = rows.reduce((sum, row) => sum + Number(row.amount), 0);
  const paid = rows.reduce((sum, row) => sum + Number(row.paidAmount), 0);
  return { total: total.toFixed(2), paid: paid.toFixed(2), outstanding: Math.max(0, total - paid).toFixed(2), count: rows.length };
}

export async function getVehicleRevenueReport() {
  const db = await getDb(); if (!db) return { vehicles: [], totals: { contractValue: "0.00", collected: "0.00", outstanding: "0.00" } };
  const contractsRows = await db.select({ contract: contracts, vehicle: vehicles }).from(contracts).leftJoin(vehicles, eq(contracts.vehicleId, vehicles.id));
  const paymentsRows = await db.select({ payment: payments, contract: contracts, vehicle: vehicles }).from(payments).innerJoin(contracts, eq(payments.contractId, contracts.id)).leftJoin(vehicles, eq(contracts.vehicleId, vehicles.id));
  const byVehicle = new Map<number, { vehicleId: number; vehicleName: string; plateNumber: string; contractValue: number; collected: number; cash: number; network: number; outstanding: number; months: Array<{ month: string; collected: string; cash: string; network: string }> }>();
  for (const row of contractsRows) {
    if (!row.vehicle) continue;
    const current = byVehicle.get(row.vehicle.id) ?? { vehicleId: row.vehicle.id, vehicleName: `${row.vehicle.make} ${row.vehicle.model}`, plateNumber: row.vehicle.plateNumber, contractValue: 0, collected: 0, cash: 0, network: 0, outstanding: 0, months: [] };
    current.contractValue += Number(row.contract.totalAmount);
    current.outstanding += Math.max(0, Number(row.contract.totalAmount) - Number(row.contract.paidAmount));
    byVehicle.set(row.vehicle.id, current);
  }
  for (const row of paymentsRows) {
    if (!row.vehicle) continue;
    const current = byVehicle.get(row.vehicle.id) ?? { vehicleId: row.vehicle.id, vehicleName: `${row.vehicle.make} ${row.vehicle.model}`, plateNumber: row.vehicle.plateNumber, contractValue: 0, collected: 0, cash: 0, network: 0, outstanding: 0, months: [] };
    const month = new Date(row.payment.createdAt).toISOString().slice(0, 7);
    const amount = Number(row.payment.amount);
    const method = row.payment.method;
    current.collected += amount;
    if (method === "cash") current.cash += amount;
    if (method === "network") current.network += amount;
    const monthRow = current.months.find((entry) => entry.month === month);
    if (monthRow) {
      monthRow.collected = (Number(monthRow.collected) + amount).toFixed(2);
      if (method === "cash") monthRow.cash = (Number(monthRow.cash) + amount).toFixed(2);
      if (method === "network") monthRow.network = (Number(monthRow.network) + amount).toFixed(2);
    } else current.months.push({ month, collected: amount.toFixed(2), cash: method === "cash" ? amount.toFixed(2) : "0.00", network: method === "network" ? amount.toFixed(2) : "0.00" });
    byVehicle.set(row.vehicle.id, current);
  }
  const report = Array.from(byVehicle.values()).map((row) => ({ ...row, contractValue: row.contractValue.toFixed(2), collected: row.collected.toFixed(2), cash: row.cash.toFixed(2), network: row.network.toFixed(2), outstanding: row.outstanding.toFixed(2), months: row.months.sort((a, b) => b.month.localeCompare(a.month)) }));
  return { vehicles: report, totals: { contractValue: report.reduce((sum, row) => sum + Number(row.contractValue), 0).toFixed(2), collected: report.reduce((sum, row) => sum + Number(row.collected), 0).toFixed(2), cash: report.reduce((sum, row) => sum + Number(row.cash), 0).toFixed(2), network: report.reduce((sum, row) => sum + Number(row.network), 0).toFixed(2), outstanding: report.reduce((sum, row) => sum + Number(row.outstanding), 0).toFixed(2) } };
}

export async function getAccountingSummary() {
  const db = await getDb(); if (!db) return { revenue: "0.00", outstanding: "0.00", paymentsCount: 0 };
  const [revenue, outstanding, paymentsCount] = await Promise.all([
    db.select({ amount: sql<string>`coalesce(sum(${payments.amount}), 0)` }).from(payments),
    db.select({ amount: sql<string>`coalesce(sum(${contracts.totalAmount} - ${contracts.paidAmount}), 0)` }).from(contracts).where(sql`${contracts.totalAmount} > ${contracts.paidAmount}`),
    db.select({ count: sql<number>`count(*)` }).from(payments),
  ]);
  return { revenue: String(revenue[0]?.amount ?? "0.00"), outstanding: String(outstanding[0]?.amount ?? "0.00"), paymentsCount: Number(paymentsCount[0]?.count ?? 0) };
}

export async function getFleetReport() {
  const db = await getDb(); if (!db) return { total: 0, available: 0, rented: 0, maintenance: 0, unavailable: 0 };
  const rows = await db.select({ status: vehicles.status, count: sql<number>`count(*)` }).from(vehicles).groupBy(vehicles.status);
  const result = { total: 0, available: 0, rented: 0, maintenance: 0, unavailable: 0 };
  rows.forEach((row) => { const count = Number(row.count); result.total += count; if (row.status === "available") result.available = count; if (row.status === "rented" || row.status === "reserved") result.rented += count; if (row.status === "maintenance") result.maintenance = count; if (row.status === "unavailable") result.unavailable = count; });
  return result;
}
