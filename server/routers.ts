import { z } from "zod";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { isValidVehicleModelYear } from "../shared/vehicleRules";
import { canAccess, isOperatorVisibleContractStatus, permissionKeys } from "../shared/permissions";
import { createCustomer, updateCustomer, deleteCustomerSafely, createMaintenance, updateMaintenance, deleteMaintenanceSafely, createOfficeLiability, updateOfficeLiability, deleteOfficeLiabilitySafely, createContract, deleteContractSafely, deleteOperationSafely, deletePaymentSafely, deleteVehicle, getAccountingSummary, getOperationalAccountingSummary, listPayments, listReturns, getDashboardAlerts, getDashboardSummary, getFleetReport,   getOfficeLiabilitySummary, getOfficeInsights,
  listExpenseTypes, createExpenseType, listEmployees, createEmployee, getContractDetails, getCustomerDetails, getVehicleDetails, getVehicleRevenueReport, listAvailableVehicles, listVehicles, listContracts, listContractOperations, listAllContractOperations, listCustomers, listMaintenance, listOfficeLiabilities, recordContractOperation, recordOfficeLiabilityPayment, approveOfficeLiability, searchCustomerLedger, updateMaintenanceStatus, createVehicle, updateVehicle, updateContractRetroactively, updatePaymentRetroactively, upsertUser, getUserByUsername, listManagedUsers, createManagedUser, updateManagedUser, hashLocalPassword } from "./db";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => { const cookieOptions = getSessionCookieOptions(ctx.req); ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 }); return { success: true } as const; }),
    localLogin: publicProcedure.input(z.object({ username: z.string().min(1), password: z.string().min(1) })).mutation(async ({ input, ctx }) => {
      if (process.env.LOCAL_AUTH_ENABLED !== "true") throw new Error("Local login is disabled");
      const managedUser = await getUserByUsername(input.username);
      const expectedUsername = process.env.LOCAL_ADMIN_USERNAME || "admin";
      const expectedPassword = process.env.LOCAL_ADMIN_PASSWORD;
      const validManaged = managedUser?.isActive && managedUser.passwordHash === hashLocalPassword(input.password);
      const validOwner = !managedUser && Boolean(expectedPassword) && input.username === expectedUsername && input.password === expectedPassword;
      if (!validManaged && !validOwner) throw new Error("اسم المستخدم أو كلمة المرور غير صحيحة");
      const openId = managedUser?.openId ?? `local_${expectedUsername}`;
      if (!managedUser) await upsertUser({ openId, name: "مدير النظام", email: null, loginMethod: "local", role: "admin", lastSignedIn: new Date() });
      const sessionToken = await sdk.createSessionToken(openId, { name: managedUser?.name ?? "مدير النظام", expiresInMs: ONE_YEAR_MS });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      return { success: true } as const;
    }),
  }),
  users: router({
    list: adminProcedure.query(() => listManagedUsers()),
    create: adminProcedure.input(z.object({ username: z.string().trim().min(3).max(64), password: z.string().min(6), name: z.string().trim().min(2), email: z.string().email().optional(), role: z.enum(["user", "admin"]), permissions: z.array(z.enum(permissionKeys)).default([]) })).mutation(({ input }) => createManagedUser(input)),
    update: adminProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().trim().min(2).optional(), email: z.string().email().optional(), password: z.string().min(6).optional(), role: z.enum(["user", "admin"]).optional(), isActive: z.boolean().optional(), permissions: z.array(z.enum(permissionKeys)).optional() })).mutation(({ input }) => updateManagedUser(input)),
  }),
  dashboard: protectedProcedure.query(() => getDashboardSummary()),
  alerts: protectedProcedure.query(() => getDashboardAlerts()),
  officeEye: adminProcedure.query(() => getOfficeInsights()),
  accounting: protectedProcedure.query(({ ctx }) => canAccess(ctx.user.role, ctx.user.permissions, "accounting") ? (ctx.user.role === "admin" ? getAccountingSummary() : getOperationalAccountingSummary()) : Promise.reject(new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية الحسابات" }))),
  expenseTypes: router({
    list: protectedProcedure.query(() => listExpenseTypes()),
    create: adminProcedure.input(z.object({ name: z.string().min(2), recurrence: z.enum(["one_time", "monthly", "quarterly", "semiannual", "annual"]), defaultAmount: z.string().optional() })).mutation(({ input }) => createExpenseType(input)),
  }),
  employees: router({
    list: protectedProcedure.query(() => listEmployees()),
    create: adminProcedure.input(z.object({ fullName: z.string().min(2), salary: z.string().min(1), hireDate: z.string().min(1) })).mutation(({ input }) => createEmployee(input)),
  }),
  liabilities: router({
    list: protectedProcedure.query(() => listOfficeLiabilities()),
    summary: protectedProcedure.query(() => getOfficeLiabilitySummary()),
    create: protectedProcedure.input(z.object({ category: z.string().min(1), description: z.string().min(2), amount: z.string().min(1), dueDate: z.string().optional(), expenseDate: z.string().optional(), expenseTypeId: z.number().int().positive().optional(), employeeId: z.number().int().positive().optional(), notes: z.string().optional(), expenseReason: z.string().optional(), contractNumber: z.string().optional() })).mutation(({ input, ctx }) => { if (!canAccess(ctx.user.role, ctx.user.permissions, "accounting")) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية تسجيل المصروفات" }); return createOfficeLiability({ ...input, createdBy: ctx.user.id }); }),
    update: adminProcedure.input(z.object({ id: z.number().int().positive(), category: z.string().min(1).optional(), description: z.string().min(2).optional(), amount: z.string().optional(), dueDate: z.string().nullable().optional(), expenseDate: z.string().nullable().optional(), notes: z.string().nullable().optional(), reason: z.string().trim().min(2) })).mutation(({ input, ctx }) => updateOfficeLiability({ ...input, updatedBy: ctx.user.id })),
    deleteSafely: adminProcedure.input(z.object({ id: z.number().int().positive(), reason: z.string().trim().min(2) })).mutation(({ input, ctx }) => deleteOfficeLiabilitySafely({ ...input, deletedBy: ctx.user.id })),
    pay: adminProcedure.input(z.object({ id: z.number().int().positive(), amount: z.string().min(1), paymentMethod: z.enum(["cash", "network", "transfer"]) })).mutation(({ input }) => recordOfficeLiabilityPayment(input.id, input.amount, input.paymentMethod)),
    approve: adminProcedure.input(z.object({ id: z.number().int().positive(), status: z.enum(["approved", "rejected"]), reason: z.string().optional() })).mutation(({ input, ctx }) => approveOfficeLiability({ ...input, approvedBy: ctx.user.id })),
  }),
  reports: router({
    fleet: adminProcedure.query(() => getFleetReport()),
    vehicleRevenue: adminProcedure.input(z.object({ from: z.string().date().optional(), to: z.string().date().optional() }).optional()).query(({ input }) => getVehicleRevenueReport(input ?? {})),
  }),
  payments: router({
    list: protectedProcedure.query(async ({ ctx }) => { const rows = await listPayments(); return ctx.user.role === "admin" ? rows : rows.filter((row) => !row.contract?.status || isOperatorVisibleContractStatus(row.contract.status)); }),
    updateRetroactive: adminProcedure.input(z.object({ id: z.number().int().positive(), amount: z.string().optional(), method: z.enum(["cash", "network", "transfer", "mixed"]).optional(), notes: z.string().nullable().optional(), reason: z.string().trim().min(2) })).mutation(({ input, ctx }) => updatePaymentRetroactively({ ...input, createdBy: ctx.user.id })),
    deleteSafely: adminProcedure.input(z.object({ id: z.number().int().positive(), reason: z.string().trim().min(2) })).mutation(({ input, ctx }) => deletePaymentSafely({ ...input, deletedBy: ctx.user.id })),
  }),
  returns: router({
    list: protectedProcedure.query(() => listReturns()),
  }),
  contracts: router({
    create: protectedProcedure.input(z.object({ contractNumber: z.string().trim().min(2).optional(), customerId: z.number().int().positive(), vehicleId: z.number().int().positive(), vehicleMileage: z.number().int().min(0).optional(), type: z.enum(["daily", "monthly"]), contractScope: z.enum(["domestic_limited", "domestic_open", "international"]).optional(), startDate: z.string(), expectedReturnDate: z.string(), rentalAmount: z.string().min(1), days: z.number().int().positive(), totalAmount: z.string().min(1), paidAmount: z.string().optional(), notes: z.string().optional() })).mutation(({ input, ctx }) => createContract({ ...input, createdBy: ctx.user.id })),
    list: protectedProcedure.input(z.object({ status: z.enum(["active", "overdue", "suspended", "closed", "returned"]).optional() }).optional()).query(async ({ input, ctx }) => { if (ctx.user.role === "admin") return listContracts(input?.status); if (input?.status && !isOperatorVisibleContractStatus(input.status)) return []; const statuses = input?.status ? [input.status] : ["active", "overdue", "suspended"] as const; const groups = await Promise.all(statuses.map((status) => listContracts(status))); return groups.flat(); }),
    details: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input, ctx }) => { const result = await getContractDetails(input.id); if (ctx.user.role !== "admin" && !isOperatorVisibleContractStatus(result?.contract?.status)) throw new TRPCError({ code: "FORBIDDEN", message: "لا يملك المستخدم صلاحية عرض هذا العقد" }); return result; }),
    updateRetroactive: adminProcedure.input(z.object({ id: z.number().int().positive(), contractNumber: z.string().trim().min(2).optional(), customerId: z.number().int().positive().optional(), vehicleId: z.number().int().positive().optional(), type: z.enum(["daily", "monthly"]).optional(), contractScope: z.enum(["domestic_limited", "domestic_open", "international"]).optional(), status: z.enum(["active", "overdue", "suspended", "closed", "returned"]).optional(), startDate: z.string().optional(), expectedReturnDate: z.string().optional(), actualReturnDate: z.string().nullable().optional(), rentalAmount: z.string().optional(), days: z.number().int().positive().optional(), totalAmount: z.string().optional(), notes: z.string().nullable().optional(), reason: z.string().trim().min(2) })).mutation(({ input, ctx }) => updateContractRetroactively({ ...input, createdBy: ctx.user.id })),
    deleteSafely: adminProcedure.input(z.object({ id: z.number().int().positive(), reason: z.string().trim().min(2) })).mutation(({ input, ctx }) => deleteContractSafely({ ...input, deletedBy: ctx.user.id })),
  }),
  vehicles: router({
    list: protectedProcedure.query(() => listVehicles()),
    details: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(({ input }) => getVehicleDetails(input.id)),
    available: protectedProcedure.query(() => listAvailableVehicles()),
    create: protectedProcedure.input(z.object({ plateNumber: z.string().min(2), make: z.string().min(2), model: z.string().min(1), modelYear: z.number().int().refine(isValidVehicleModelYear, { message: "سنة السيارة يجب أن تكون بين 1 و2100" }), dailyRate: z.string().min(1), monthlyRate: z.string().min(1), mileage: z.number().int().min(0).optional(), lastOilChangeMileage: z.number().int().min(0).optional(), lastOilChangeDate: z.string().optional(), oilChangeInterval: z.number().int().positive().optional(), insuranceExpiryDate: z.string().optional(), inspectionExpiryDate: z.string().optional(), registrationExpiryDate: z.string().optional(), notes: z.string().optional() })).mutation(({ input }) => createVehicle(input)),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), mileage: z.number().int().min(0).optional(), lastOilChangeMileage: z.number().int().min(0).optional(), lastOilChangeDate: z.string().optional(), oilChangeInterval: z.number().int().positive().optional(), insuranceExpiryDate: z.string().optional(), inspectionExpiryDate: z.string().optional(), registrationExpiryDate: z.string().optional() })).mutation(({ input, ctx }) => { const { id, ...values } = input; if (ctx.user.role !== "admin") { if (!canAccess(ctx.user.role, ctx.user.permissions, "maintenance")) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية تحديث السيارة" }); const { mileage, lastOilChangeMileage, lastOilChangeDate, oilChangeInterval } = values; if (values.insuranceExpiryDate !== undefined || values.inspectionExpiryDate !== undefined || values.registrationExpiryDate !== undefined) throw new TRPCError({ code: "FORBIDDEN", message: "تحديث وثائق السيارة للمدير فقط" }); if ([mileage, lastOilChangeMileage, lastOilChangeDate, oilChangeInterval].every((value) => value === undefined)) throw new TRPCError({ code: "BAD_REQUEST", message: "اختر بيانات الزيت أو الصيانة لتحديثها" }); return updateVehicle(id, { mileage, lastOilChangeMileage, lastOilChangeDate, oilChangeInterval }); } return updateVehicle(id, values); }),
    delete: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ input }) => deleteVehicle(input.id)),
  }),
  customers: router({
    list: protectedProcedure.query(() => listCustomers()),
    details: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(({ input }) => getCustomerDetails(input.id)),
    ledger: protectedProcedure.input(z.object({ query: z.string().min(1) })).query(({ input }) => searchCustomerLedger(input.query)),
    create: protectedProcedure.input(z.object({ identityNumber: z.string().min(1), fullName: z.string().min(2), phone: z.string().min(5), email: z.string().email().optional(), notes: z.string().optional() })).mutation(({ input }) => createCustomer(input)),
    update: adminProcedure.input(z.object({ id: z.number().int().positive(), identityNumber: z.string().min(1).optional(), fullName: z.string().min(2).optional(), phone: z.string().min(5).optional(), email: z.string().email().nullable().optional(), notes: z.string().nullable().optional(), reason: z.string().trim().min(2) })).mutation(({ input, ctx }) => updateCustomer({ ...input, updatedBy: ctx.user.id })),
    deleteSafely: adminProcedure.input(z.object({ id: z.number().int().positive(), reason: z.string().trim().min(2) })).mutation(({ input, ctx }) => deleteCustomerSafely({ ...input, deletedBy: ctx.user.id })),
  }),
  operations: router({
    list: protectedProcedure.input(z.object({ from: z.string().date().optional(), to: z.string().date().optional() }).optional()).query(async ({ input, ctx }) => { const rows = await listAllContractOperations(input); return ctx.user.role === "admin" ? rows : rows.filter((row) => isOperatorVisibleContractStatus(row.contract?.status)); }),
    history: protectedProcedure.input(z.object({ contractId: z.number().int().positive() })).query(async ({ input, ctx }) => { const contract = await getContractDetails(input.contractId); if (ctx.user.role !== "admin" && !isOperatorVisibleContractStatus(contract?.contract?.status)) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية عرض عمليات هذا العقد" }); return listContractOperations(input.contractId); }),
    deleteSafely: adminProcedure.input(z.object({ id: z.number().int().positive(), reason: z.string().trim().min(2) })).mutation(({ input, ctx }) => deleteOperationSafely({ ...input, deletedBy: ctx.user.id })),
    record: protectedProcedure.input(z.object({ contractId: z.number().int().positive().optional(), contractNumber: z.string().trim().min(1).optional(), operation: z.enum(["new_contract", "extension", "payment", "additional_fee", "rate_update", "vehicle_swap", "suspend", "close", "return"]), vehicleId: z.number().int().positive().optional(), vehicleMileage: z.number().int().min(0).optional(), amount: z.string().optional(), paymentMethod: z.enum(["cash", "network", "transfer", "mixed"]).optional(), paymentCashAmount: z.string().optional(), paymentNetworkAmount: z.string().optional(), paymentReason: z.enum(["extra_km", "international_authorization_fee", "insurance_deductible", "vehicle_damage_compensation", "vehicle_cleaning_fee"]).optional(), extensionDays: z.number().int().positive().optional(), details: z.string().optional() }).refine((input) => Boolean(input.contractId || input.contractNumber), { message: "أدخل رقم العقد أولاً", path: ["contractNumber"] }).refine((input) => input.operation !== "extension" || Boolean(input.extensionDays), { message: "أدخل عدد أيام التمديد", path: ["extensionDays"] }).refine((input) => input.operation !== "vehicle_swap" || Boolean(input.vehicleId), { message: "اختر سيارة بديلة", path: ["vehicleId"] }).refine((input) => !["payment", "additional_fee"].includes(input.operation) || Boolean(input.amount && Number(input.amount) > 0), { message: "أدخل مبلغاً صحيحاً", path: ["amount"] }).refine((input) => input.operation !== "rate_update" || Boolean(input.amount && Number(input.amount) > 0), { message: "أدخل سعر التأجير الجديد", path: ["amount"] })).mutation(({ input, ctx }) => recordContractOperation({ ...input, createdBy: ctx.user.id })),
  }),
  maintenance: router({
    list: protectedProcedure.query(() => listMaintenance()),
    create: protectedProcedure.input(z.object({ vehicleId: z.number().int().positive(), issueType: z.string().min(2), serviceType: z.enum(["maintenance", "oil_change"]).optional(), mileage: z.number().int().min(0).optional(), startDate: z.string(), status: z.enum(["pending", "in_progress"]).optional(), cost: z.string().optional(), notes: z.string().optional() })).mutation(({ input }) => createMaintenance(input)),
    updateStatus: protectedProcedure.input(z.object({ id: z.number().int().positive(), vehicleId: z.number().int().positive(), status: z.enum(["pending", "in_progress", "completed", "written_off"]) })).mutation(({ input }) => updateMaintenanceStatus(input.id, input.status, input.vehicleId)),
    update: adminProcedure.input(z.object({ id: z.number().int().positive(), issueType: z.string().min(2).optional(), mileage: z.number().int().min(0).optional(), startDate: z.string().optional(), cost: z.string().optional(), notes: z.string().nullable().optional(), reason: z.string().trim().min(2) })).mutation(({ input, ctx }) => updateMaintenance({ ...input, updatedBy: ctx.user.id })),
    deleteSafely: adminProcedure.input(z.object({ id: z.number().int().positive(), reason: z.string().trim().min(2) })).mutation(({ input, ctx }) => deleteMaintenanceSafely({ ...input, deletedBy: ctx.user.id })),
  }),
});

export type AppRouter = typeof appRouter;
