import { boolean, int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, date, index } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  username: varchar("username", { length: 64 }).unique(),
  passwordHash: varchar("passwordHash", { length: 128 }),
  isActive: boolean("isActive").default(true).notNull(),
  permissions: text("permissions"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const vehicleStatus = mysqlEnum("vehicleStatus", ["available", "reserved", "rented", "maintenance", "unavailable"]);
export const contractType = mysqlEnum("contractType", ["daily", "monthly"]);
export const contractScope = mysqlEnum("contractScope", ["domestic_limited", "domestic_open", "international"]);
export const contractStatus = mysqlEnum("contractStatus", ["active", "overdue", "suspended", "closed", "returned"]);
export const operationType = mysqlEnum("operationType", ["new_contract", "extension", "payment", "additional_fee", "rate_update", "vehicle_swap", "suspend", "close", "return"]);
export const paymentMethod = mysqlEnum("paymentMethod", ["cash", "network", "transfer", "mixed"]);
export const maintenanceStatus = mysqlEnum("maintenanceStatus", ["pending", "in_progress", "completed", "written_off"]);
export const maintenanceType = mysqlEnum("maintenanceType", ["maintenance", "oil_change"]);
export const liabilityStatus = mysqlEnum("liabilityStatus", ["open", "partially_paid", "paid", "cancelled"]);
export const expenseApprovalStatus = mysqlEnum("expenseApprovalStatus", ["pending", "approved", "rejected"]);
export const backupRunStatus = mysqlEnum("backupRunStatus", ["started", "succeeded", "failed"]);

export const customers = mysqlTable("customers", {
  id: int("id").autoincrement().primaryKey(),
  identityNumber: varchar("identityNumber", { length: 64 }).notNull().unique(),
  fullName: varchar("fullName", { length: 160 }).notNull(),
  phone: varchar("phone", { length: 32 }).notNull(),
  email: varchar("email", { length: 320 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ nameIdx: index("customers_name_idx").on(table.fullName) }));

export const vehicles = mysqlTable("vehicles", {
  id: int("id").autoincrement().primaryKey(),
  plateNumber: varchar("plateNumber", { length: 32 }).notNull().unique(),
  make: varchar("make", { length: 80 }).notNull(),
  model: varchar("model", { length: 80 }).notNull(),
  modelYear: int("modelYear").notNull(),
  dailyRate: decimal("dailyRate", { precision: 10, scale: 2 }).notNull(),
  monthlyRate: decimal("monthlyRate", { precision: 10, scale: 2 }).notNull(),
  mileage: int("mileage").default(0).notNull(),
  lastOilChangeMileage: int("lastOilChangeMileage"),
  lastOilChangeDate: date("lastOilChangeDate"),
  oilChangeInterval: int("oilChangeInterval").default(5000).notNull(),
  insuranceExpiryDate: date("insuranceExpiryDate"),
  inspectionExpiryDate: date("inspectionExpiryDate"),
  registrationExpiryDate: date("registrationExpiryDate"),
  status: vehicleStatus.default("available").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ statusIdx: index("vehicles_status_idx").on(table.status) }));

export const contracts = mysqlTable("contracts", {
  id: int("id").autoincrement().primaryKey(),
  contractNumber: varchar("contractNumber", { length: 32 }).notNull().unique(),
  customerId: int("customerId").notNull(),
  vehicleId: int("vehicleId").notNull(),
  type: mysqlEnum("contractType", ["daily", "monthly"]).notNull(),
  contractScope: contractScope.default("domestic_open"),
  status: mysqlEnum("contractStatus", ["active", "overdue", "suspended", "closed", "returned"]).default("active").notNull(),
  startDate: date("startDate").notNull(),
  expectedReturnDate: date("expectedReturnDate").notNull(),
  actualReturnDate: date("actualReturnDate"),
  rentalAmount: decimal("rentalAmount", { precision: 10, scale: 2 }).notNull(),
  days: int("days").default(1).notNull(),
  totalAmount: decimal("totalAmount", { precision: 10, scale: 2 }).notNull(),
  paidAmount: decimal("paidAmount", { precision: 10, scale: 2 }).default("0").notNull(),
  notes: text("notes"),
  suspensionFollowUpDate: date("suspensionFollowUpDate"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ statusIdx: index("contracts_status_idx").on(table.status), customerIdx: index("contracts_customer_idx").on(table.customerId), vehicleIdx: index("contracts_vehicle_idx").on(table.vehicleId) }));

export const contractOperations = mysqlTable("contractOperations", {
  id: int("id").autoincrement().primaryKey(),
  contractId: int("contractId").notNull(),
  operation: mysqlEnum("operationType", ["new_contract", "extension", "payment", "additional_fee", "rate_update", "vehicle_swap", "suspend", "close", "return"]).notNull(),
  vehicleId: int("vehicleId"),
  previousVehicleId: int("previousVehicleId"),
  amount: decimal("amount", { precision: 10, scale: 2 }).default("0").notNull(),
  paymentMethod: paymentMethod,
  details: text("details"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ contractIdx: index("operations_contract_idx").on(table.contractId) }));

export const payments = mysqlTable("payments", {
  id: int("id").autoincrement().primaryKey(),
  contractId: int("contractId").notNull(),
  customerId: int("customerId").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  method: mysqlEnum("paymentMethod", ["cash", "network", "transfer", "mixed"]).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ contractIdx: index("payments_contract_idx").on(table.contractId), customerIdx: index("payments_customer_idx").on(table.customerId) }));

export const maintenanceRecords = mysqlTable("maintenanceRecords", {
  id: int("id").autoincrement().primaryKey(),
  vehicleId: int("vehicleId").notNull(),
  issueType: varchar("issueType", { length: 160 }).notNull(),
  serviceType: maintenanceType.default("maintenance").notNull(),
  mileage: int("mileage"),
  status: maintenanceStatus.default("pending").notNull(),
  startDate: date("startDate").notNull(),
  endDate: date("endDate"),
  cost: decimal("cost", { precision: 10, scale: 2 }).default("0").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const deletionAudits = mysqlTable("deletionAudits", {
  id: int("id").autoincrement().primaryKey(),
  entityType: varchar("entityType", { length: 32 }).notNull(),
  entityId: int("entityId").notNull(),
  contractId: int("contractId"),
  snapshot: text("snapshot").notNull(),
  reason: varchar("reason", { length: 240 }).notNull(),
  deletedBy: int("deletedBy"),
  deletedAt: timestamp("deletedAt").defaultNow().notNull(),
}, (table) => ({ contractIdx: index("deletion_audits_contract_idx").on(table.contractId) }));

export const expenseTypes = mysqlTable("expenseTypes", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull().unique(),
  recurrence: mysqlEnum("recurrence", ["one_time", "monthly", "quarterly", "semiannual", "annual"]).default("one_time").notNull(),
  defaultAmount: decimal("defaultAmount", { precision: 10, scale: 2 }).default("0").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const employees = mysqlTable("employees", {
  id: int("id").autoincrement().primaryKey(),
  fullName: varchar("fullName", { length: 160 }).notNull(),
  salary: decimal("salary", { precision: 10, scale: 2 }).notNull(),
  hireDate: date("hireDate").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const backupRuns = mysqlTable("backupRuns", {
  id: int("id").autoincrement().primaryKey(),
  taskUid: varchar("taskUid", { length: 65 }).notNull(),
  runKey: varchar("runKey", { length: 160 }).notNull().unique(),
  status: backupRunStatus.default("started").notNull(),
  generatedAt: timestamp("generatedAt").notNull(),
  sentAt: timestamp("sentAt"),
  backupKey: text("backupKey"),
  dailyReportKey: text("dailyReportKey"),
  monthlyReportKey: text("monthlyReportKey"),
  error: text("error"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ taskIdx: index("backup_runs_task_idx").on(table.taskUid), runKeyIdx: index("backup_runs_run_key_idx").on(table.runKey) }));

export const officeLiabilities = mysqlTable("officeLiabilities", {
  id: int("id").autoincrement().primaryKey(),
  category: varchar("category", { length: 100 }).notNull(),
  description: varchar("description", { length: 240 }).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  paidAmount: decimal("paidAmount", { precision: 10, scale: 2 }).default("0").notNull(),
  dueDate: date("dueDate"),
  expenseDate: date("expenseDate"),
  expenseTypeId: int("expenseTypeId"),
  employeeId: int("employeeId"),
  status: liabilityStatus.default("open").notNull(),
  notes: text("notes"),
  expenseReason: varchar("expenseReason", { length: 240 }),
  contractNumber: varchar("contractNumber", { length: 32 }),
  paymentMethod: paymentMethod,
  approvalStatus: expenseApprovalStatus.default("pending").notNull(),
  approvedBy: int("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Customer = typeof customers.$inferSelect;
export type Vehicle = typeof vehicles.$inferSelect;
export type Contract = typeof contracts.$inferSelect;
export type ContractOperation = typeof contractOperations.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type MaintenanceRecord = typeof maintenanceRecords.$inferSelect;
export type OfficeLiability = typeof officeLiabilities.$inferSelect;
export type BackupRun = typeof backupRuns.$inferSelect;
export type ExpenseType = typeof expenseTypes.$inferSelect;
export type Employee = typeof employees.$inferSelect;
