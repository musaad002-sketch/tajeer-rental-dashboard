import {
  boolean,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  date,
  datetime,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

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
  emailVerifiedAt: timestamp("emailVerifiedAt"),
  emailVerificationTokenHash: varchar("emailVerificationTokenHash", {
    length: 128,
  }),
  emailVerificationExpiresAt: timestamp("emailVerificationExpiresAt"),
  passwordResetTokenHash: varchar("passwordResetTokenHash", { length: 128 }),
  passwordResetExpiresAt: timestamp("passwordResetExpiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const vehicleStatus = mysqlEnum("vehicleStatus", [
  "available",
  "reserved",
  "rented",
  "maintenance",
  "unavailable",
]);
export const contractType = mysqlEnum("contractType", ["daily", "monthly"]);
export const contractScope = mysqlEnum("contractScope", [
  "domestic_limited",
  "domestic_open",
  "international",
]);
export const contractStatus = mysqlEnum("contractStatus", [
  "active",
  "overdue",
  "suspended",
  "closed",
  "returned",
]);
export const operationType = mysqlEnum("operationType", [
  "new_contract",
  "extension",
  "payment",
  "additional_fee",
  "rate_update",
  "vehicle_swap",
  "suspend",
  "close",
  "return",
]);
export const paymentMethod = mysqlEnum("paymentMethod", [
  "cash",
  "network",
  "transfer",
  "mixed",
]);
export const maintenanceStatus = mysqlEnum("maintenanceStatus", [
  "pending",
  "in_progress",
  "completed",
  "written_off",
]);
export const maintenanceType = mysqlEnum("maintenanceType", [
  "maintenance",
  "oil_change",
]);
export const liabilityStatus = mysqlEnum("liabilityStatus", [
  "open",
  "partially_paid",
  "paid",
  "cancelled",
]);
export const expenseApprovalStatus = mysqlEnum("expenseApprovalStatus", [
  "pending",
  "approved",
  "rejected",
  "legacy_accepted",
]);
export const backupRunStatus = mysqlEnum("backupRunStatus", [
  "started",
  "succeeded",
  "failed",
]);
export const financialTransactionType = mysqlEnum("transactionType", [
  "payment",
  "revenue",
  "expense",
]);
export const financialApprovalStatus = mysqlEnum("approvalStatus", [
  "pending",
  "approved",
  "rejected",
  "legacy_accepted",
]);
export const settlementType = mysqlEnum("settlementType", [
  "suspended_contract",
  "previous_contract",
  "non_suspended_contract",
  "unlinked",
]);
export const revenueType = mysqlEnum("revenueType", [
  "rental",
  "insurance_deductible",
  "accident_compensation",
  "other",
]);
export const paymentAllocationType = mysqlEnum("allocationType", [
  "remaining_contract_balance",
  "current_late_charges",
  "excess_mileage",
  "other_liability",
]);
export const monthlyInstallmentStatus = mysqlEnum("monthlyInstallmentStatus", [
  "unpaid",
  "partially_paid",
  "fully_paid",
]);
export const financialExpenseType = mysqlEnum("expenseType", [
  "parts",
  "labor",
  "external_workshop",
  "freon",
  "glass",
  "warranty",
  "other",
]);
export const vehicleNoteResolution = mysqlEnum("vehicleNoteResolution", [
  "open",
  "repaired",
  "not_repaired",
  "not_needed",
]);

export const customers = mysqlTable(
  "customers",
  {
    id: int("id").autoincrement().primaryKey(),
    identityNumber: varchar("identityNumber", { length: 64 })
      .notNull()
      .unique(),
    fullName: varchar("fullName", { length: 160 }).notNull(),
    phone: varchar("phone", { length: 32 }).notNull(),
    phoneSecondary: varchar("phoneSecondary", { length: 32 }),
    email: varchar("email", { length: 320 }),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({ nameIdx: index("customers_name_idx").on(table.fullName) })
);

export const vehicles = mysqlTable(
  "vehicles",
  {
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
  },
  table => ({ statusIdx: index("vehicles_status_idx").on(table.status) })
);

export const contracts = mysqlTable(
  "contracts",
  {
    id: int("id").autoincrement().primaryKey(),
    contractNumber: varchar("contractNumber", { length: 32 })
      .notNull()
      .unique(),
    customerId: int("customerId").notNull(),
    vehicleId: int("vehicleId").notNull(),
    type: mysqlEnum("contractType", ["daily", "monthly"]).notNull(),
    contractScope: contractScope.default("domestic_open"),
    status: mysqlEnum("contractStatus", [
      "active",
      "overdue",
      "suspended",
      "closed",
      "returned",
    ])
      .default("active")
      .notNull(),
    startDate: datetime("startDate").notNull(),
    expectedReturnDate: datetime("expectedReturnDate").notNull(),
    actualReturnDate: datetime("actualReturnDate"),
    rentalAmount: decimal("rentalAmount", {
      precision: 10,
      scale: 2,
    }).notNull(),
    days: int("days").default(1).notNull(),
    startMileage: int("startMileage").default(0).notNull(),
    excessMileageAmount: decimal("excessMileageAmount", {
      precision: 10,
      scale: 2,
    })
      .default("0")
      .notNull(),
    totalAmount: decimal("totalAmount", { precision: 10, scale: 2 }).notNull(),
    paidAmount: decimal("paidAmount", { precision: 10, scale: 2 })
      .default("0")
      .notNull(),
    notes: text("notes"),
    suspensionFollowUpDate: date("suspensionFollowUpDate"),
    createdBy: int("createdBy"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    statusIdx: index("contracts_status_idx").on(table.status),
    customerIdx: index("contracts_customer_idx").on(table.customerId),
    vehicleIdx: index("contracts_vehicle_idx").on(table.vehicleId),
  })
);

export const vehicleNotes = mysqlTable(
  "vehicleNotes",
  {
    id: int("id").autoincrement().primaryKey(),
    vehicleId: int("vehicleId").notNull(),
    sourceContractId: int("sourceContractId"),
    sourceCustomerId: int("sourceCustomerId"),
    note: text("note").notNull(),
    resolution: vehicleNoteResolution.default("open").notNull(),
    resolutionReason: varchar("resolutionReason", { length: 240 }),
    createdBy: int("createdBy"),
    resolvedBy: int("resolvedBy"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    resolvedAt: timestamp("resolvedAt"),
    managerFollowUpRequired: boolean("managerFollowUpRequired")
      .default(false)
      .notNull(),
    managerFollowUpAt: timestamp("managerFollowUpAt"),
  },
  table => ({
    vehicleResolutionIdx: index("vehicle_notes_vehicle_resolution_idx").on(
      table.vehicleId,
      table.resolution
    ),
    sourceContractIdx: index("vehicle_notes_source_contract_idx").on(
      table.sourceContractId
    ),
    sourceCustomerIdx: index("vehicle_notes_source_customer_idx").on(
      table.sourceCustomerId
    ),
  })
);

export const vehicleReadinessState = mysqlEnum("vehicleReadinessState", [
  "returned",
  "cleaning",
  "qc",
  "ready",
  "blocked",
]);

export const vehicleReadiness = mysqlTable(
  "vehicleReadiness",
  {
    id: int("id").autoincrement().primaryKey(),
    vehicleId: int("vehicleId").notNull(),
    state: vehicleReadinessState.notNull().default("ready"),
    blockedReason: varchar("blockedReason", { length: 240 }),
    notes: text("notes"),
    changedBy: int("changedBy").notNull(),
    changedAt: timestamp("changedAt").defaultNow().notNull(),
  },
  table => ({
    vehicleIdx: index("vehicle_readiness_vehicle_idx").on(table.vehicleId),
    stateIdx: index("vehicle_readiness_state_idx").on(table.state),
    changedAtIdx: index("vehicle_readiness_changed_at_idx").on(table.changedAt),
  })
);

export const contractOperations = mysqlTable(
  "contractOperations",
  {
    id: int("id").autoincrement().primaryKey(),
    contractId: int("contractId").notNull(),
    operation: mysqlEnum("operationType", [
      "new_contract",
      "extension",
      "payment",
      "additional_fee",
      "rate_update",
      "vehicle_swap",
      "suspend",
      "close",
      "return",
    ]).notNull(),
    vehicleId: int("vehicleId"),
    previousVehicleId: int("previousVehicleId"),
    amount: decimal("amount", { precision: 10, scale: 2 })
      .default("0")
      .notNull(),
    paymentMethod: paymentMethod,
    details: text("details"),
    createdBy: int("createdBy"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    contractIdx: index("operations_contract_idx").on(table.contractId),
  })
);

export const payments = mysqlTable(
  "payments",
  {
    id: int("id").autoincrement().primaryKey(),
    contractId: int("contractId").notNull(),
    customerId: int("customerId").notNull(),
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    method: mysqlEnum("paymentMethod", [
      "cash",
      "network",
      "transfer",
      "mixed",
    ]).notNull(),
    notes: text("notes"),
    approvalStatus: mysqlEnum("approvalStatus", [
      "pending",
      "approved",
      "rejected",
      "legacy_accepted",
    ])
      .default("legacy_accepted")
      .notNull(),
    approvedBy: int("approvedBy"),
    approvedAt: timestamp("approvedAt"),
    rejectionReason: varchar("rejectionReason", { length: 240 }),
    originalTransactionId: int("originalTransactionId"),
    reversalOfPaymentId: int("reversalOfPaymentId"),
    correctionOfPaymentId: int("correctionOfPaymentId"),
    settlementType: mysqlEnum("settlementType", [
      "suspended_contract",
      "previous_contract",
      "non_suspended_contract",
      "unlinked",
    ])
      .default("unlinked")
      .notNull(),
    paymentReason: varchar("paymentReason", { length: 80 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    contractIdx: index("payments_contract_idx").on(table.contractId),
    customerIdx: index("payments_customer_idx").on(table.customerId),
    approvalCreatedIdx: index("payments_approval_created_idx").on(
      table.approvalStatus,
      table.createdAt
    ),
    originalTransactionIdx: index("payments_original_transaction_idx").on(
      table.originalTransactionId
    ),
    reversalOfPaymentIdx: index("payments_reversal_of_payment_idx").on(
      table.reversalOfPaymentId
    ),
    correctionOfPaymentIdx: index("payments_correction_of_payment_idx").on(
      table.correctionOfPaymentId
    ),
    settlementContractIdx: index("payments_settlement_contract_idx").on(
      table.settlementType,
      table.contractId
    ),
  })
);

export const maintenanceRecords = mysqlTable("maintenanceRecords", {
  id: int("id").autoincrement().primaryKey(),
  vehicleId: int("vehicleId").notNull(),
  issueType: varchar("issueType", { length: 160 }).notNull(),
  serviceType: maintenanceType.default("maintenance").notNull(),
  mileage: int("mileage"),
  status: maintenanceStatus.default("pending").notNull(),
  startDate: datetime("startDate").notNull(),
  endDate: datetime("endDate"),
  cost: decimal("cost", { precision: 10, scale: 2 }).default("0").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const deletionAudits = mysqlTable(
  "deletionAudits",
  {
    id: int("id").autoincrement().primaryKey(),
    entityType: varchar("entityType", { length: 32 }).notNull(),
    entityId: int("entityId").notNull(),
    contractId: int("contractId"),
    snapshot: text("snapshot").notNull(),
    reason: varchar("reason", { length: 240 }).notNull(),
    deletedBy: int("deletedBy"),
    deletedAt: timestamp("deletedAt").defaultNow().notNull(),
  },
  table => ({
    contractIdx: index("deletion_audits_contract_idx").on(table.contractId),
  })
);

export const expenseTypes = mysqlTable("expenseTypes", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull().unique(),
  recurrence: mysqlEnum("recurrence", [
    "one_time",
    "monthly",
    "quarterly",
    "semiannual",
    "annual",
  ])
    .default("one_time")
    .notNull(),
  defaultAmount: decimal("defaultAmount", { precision: 10, scale: 2 })
    .default("0")
    .notNull(),
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

export const backupRuns = mysqlTable(
  "backupRuns",
  {
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
  },
  table => ({
    taskIdx: index("backup_runs_task_idx").on(table.taskUid),
    runKeyIdx: index("backup_runs_run_key_idx").on(table.runKey),
  })
);

export const officeLiabilities = mysqlTable(
  "officeLiabilities",
  {
    id: int("id").autoincrement().primaryKey(),
    category: varchar("category", { length: 100 }).notNull(),
    description: varchar("description", { length: 240 }).notNull(),
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    paidAmount: decimal("paidAmount", { precision: 10, scale: 2 })
      .default("0")
      .notNull(),
    dueDate: date("dueDate"),
    expenseDate: date("expenseDate"),
    expenseTypeId: int("expenseTypeId"),
    vehicleId: int("vehicleId"),
    employeeId: int("employeeId"),
    status: liabilityStatus.default("open").notNull(),
    notes: text("notes"),
    expenseReason: varchar("expenseReason", { length: 240 }),
    contractNumber: varchar("contractNumber", { length: 32 }),
    paymentMethod: paymentMethod,
    approvalStatus: mysqlEnum("expenseApprovalStatus", [
      "pending",
      "approved",
      "rejected",
      "legacy_accepted",
    ])
      .default("pending")
      .notNull(),
    approvedBy: int("approvedBy"),
    approvedAt: timestamp("approvedAt"),
    rejectionReason: varchar("rejectionReason", { length: 240 }),
    originalTransactionId: int("originalTransactionId"),
    reversalOfLiabilityId: int("reversalOfLiabilityId"),
    correctionOfLiabilityId: int("correctionOfLiabilityId"),
    legacyAcceptedAt: timestamp("legacyAcceptedAt"),
    createdBy: int("createdBy"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    approvalCreatedIdx: index("liabilities_approval_created_idx").on(
      table.approvalStatus,
      table.createdAt
    ),
    originalTransactionIdx: index("liabilities_original_transaction_idx").on(
      table.originalTransactionId
    ),
    reversalOfLiabilityIdx: index("liabilities_reversal_of_idx").on(
      table.reversalOfLiabilityId
    ),
    correctionOfLiabilityIdx: index("liabilities_correction_of_idx").on(
      table.correctionOfLiabilityId
    ),
  })
);

export const blockedCustomers = mysqlTable(
  "blockedCustomers",
  {
    id: int("id").autoincrement().primaryKey(),
    fullName: varchar("fullName", { length: 160 }).notNull(),
    identityNumber: varchar("identityNumber", { length: 64 }),
    phone: varchar("phone", { length: 32 }),
    nationality: varchar("nationality", { length: 64 }),
    reason: text("reason"),
    source: varchar("source", { length: 160 }),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    identityIdx: index("blocked_customers_identity_idx").on(
      table.identityNumber
    ),
    nameIdx: index("blocked_customers_name_idx").on(table.fullName),
  })
);

export const siteContent = mysqlTable("siteContent", {
  id: int("id").autoincrement().primaryKey(),
  contentKey: varchar("contentKey", { length: 160 }).notNull().unique(),
  contentType: varchar("contentType", { length: 20 }).notNull(),
  value: text("value").notNull(),
  originalValue: text("originalValue").notNull(),
  updatedBy: int("updatedBy"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const financialTransactions = mysqlTable(
  "financialTransactions",
  {
    id: int("id").autoincrement().primaryKey(),
    transactionType: financialTransactionType.notNull(),
    approvalStatus: financialApprovalStatus.default("pending").notNull(),
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    paymentMethod: mysqlEnum("paymentMethod", [
      "cash",
      "network",
      "transfer",
      "mixed",
    ]),
    settlementType: settlementType.default("unlinked").notNull(),
    revenueType,
    contractId: int("contractId"),
    customerId: int("customerId"),
    vehicleId: int("vehicleId"),
    createdBy: int("createdBy"),
    approvedBy: int("approvedBy"),
    approvedAt: timestamp("approvedAt"),
    rejectionReason: varchar("rejectionReason", { length: 240 }),
    originalTransactionId: int("originalTransactionId"),
    reversalOfTransactionId: int("reversalOfTransactionId"),
    correctionOfTransactionId: int("correctionOfTransactionId"),
    sourceTable: varchar("sourceTable", { length: 40 }),
    sourceId: int("sourceId"),
    description: varchar("description", { length: 240 }),
    metadata: text("metadata"),
    transactionDate: timestamp("transactionDate").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    approvalTypeIdx: index("financial_transactions_approval_type_idx").on(
      table.approvalStatus,
      table.transactionType
    ),
    contractDateIdx: index("financial_transactions_contract_date_idx").on(
      table.contractId,
      table.transactionDate
    ),
    customerDateIdx: index("financial_transactions_customer_date_idx").on(
      table.customerId,
      table.transactionDate
    ),
    vehicleDateIdx: index("financial_transactions_vehicle_date_idx").on(
      table.vehicleId,
      table.transactionDate
    ),
    sourceIdx: index("financial_transactions_source_idx").on(
      table.sourceTable,
      table.sourceId
    ),
    originalIdx: index("financial_transactions_original_idx").on(
      table.originalTransactionId
    ),
    reversalIdx: index("financial_transactions_reversal_idx").on(
      table.reversalOfTransactionId
    ),
    correctionIdx: index("financial_transactions_correction_idx").on(
      table.correctionOfTransactionId
    ),
  })
);

export const financialPaymentAllocations = mysqlTable(
  "financialPaymentAllocations",
  {
    id: int("id").autoincrement().primaryKey(),
    transactionId: int("transactionId").notNull(),
    paymentId: int("paymentId"),
    contractId: int("contractId"),
    allocationType: paymentAllocationType.notNull(),
    priority: int("priority").notNull(),
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    transactionPriorityIdx: index(
      "financial_allocations_transaction_priority_idx"
    ).on(table.transactionId, table.priority),
    contractTypeIdx: index("financial_allocations_contract_type_idx").on(
      table.contractId,
      table.allocationType
    ),
    paymentIdx: index("financial_allocations_payment_idx").on(table.paymentId),
    transactionTypeUnique: uniqueIndex(
      "financial_allocations_transaction_type_uq"
    ).on(table.transactionId, table.allocationType),
  })
);

export const financialExpenseDetails = mysqlTable(
  "financialExpenseDetails",
  {
    id: int("id").autoincrement().primaryKey(),
    liabilityId: int("liabilityId").notNull(),
    expenseType: financialExpenseType.notNull(),
    partType: varchar("partType", { length: 160 }),
    vehicleId: int("vehicleId"),
    paymentMethod: mysqlEnum("paymentMethod", [
      "cash",
      "network",
      "transfer",
      "mixed",
    ]),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    liabilityIdx: index("financial_expense_details_liability_idx").on(
      table.liabilityId
    ),
    vehicleTypeIdx: index("financial_expense_details_vehicle_type_idx").on(
      table.vehicleId,
      table.expenseType
    ),
  })
);

export const monthlyInstallments = mysqlTable(
  "monthlyInstallments",
  {
    id: int("id").autoincrement().primaryKey(),
    contractId: int("contractId").notNull(),
    monthNumber: int("monthNumber").notNull(),
    cycleStart: datetime("cycleStart").notNull(),
    cycleEnd: datetime("cycleEnd").notNull(),
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    paidAmount: decimal("paidAmount", { precision: 10, scale: 2 })
      .default("0")
      .notNull(),
    status: monthlyInstallmentStatus.default("unpaid").notNull(),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    contractMonthIdx: index("monthly_installments_contract_month_idx").on(
      table.contractId,
      table.monthNumber
    ),
    contractMonthUnique: uniqueIndex(
      "monthly_installments_contract_month_uq"
    ).on(table.contractId, table.monthNumber),
    contractStatusIdx: index("monthly_installments_contract_status_idx").on(
      table.contractId,
      table.status
    ),
  })
);

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
export type BlockedCustomer = typeof blockedCustomers.$inferSelect;
export type SiteContent = typeof siteContent.$inferSelect;
export type FinancialTransaction = typeof financialTransactions.$inferSelect;
export type FinancialPaymentAllocation =
  typeof financialPaymentAllocations.$inferSelect;
export type FinancialExpenseDetail =
  typeof financialExpenseDetails.$inferSelect;
export type MonthlyInstallment = typeof monthlyInstallments.$inferSelect;
