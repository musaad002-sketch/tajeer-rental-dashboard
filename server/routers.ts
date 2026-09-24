import { z } from "zod";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import {
  adminProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from "./_core/trpc";
import { isValidVehicleModelYear } from "../shared/vehicleRules";
import {
  allPermissionKeys,
  canPerform,
  isOperatorVisibleContractStatus,
  type GranularPermissionKey,
} from "../shared/permissions";
import {
  approveFinancialTransaction,
  correctFinancialTransaction,
  createFinancialTransaction,
  getFinancialTransaction,
  listFinancialTransactions,
  rejectFinancialTransaction,
  reverseFinancialTransaction,
} from "./financialTransactions";
import { allocateApprovedPayment } from "./paymentAllocation";
import {
  correctFinancialExpense,
  createFinancialExpense,
  decideFinancialExpense,
  getFinancialExpenseSummary,
  listFinancialExpenses,
  reverseFinancialExpense,
} from "./financialExpenses";
import {
  approveFinancialRevenue,
  correctFinancialRevenue,
  createFinancialRevenue,
  getFinancialRevenueSummary,
  listFinancialRevenues,
  rejectFinancialRevenue,
  reverseFinancialRevenue,
} from "./financialRevenues";
import {
  aggregateByMonthlyCycle,
  getAllFinancialTransactionsForRange,
  getFinancialReportingReadModel,
  listApprovedFinancialAllocations,
  listFinancialReportingTransactions,
} from "./financialReporting";
import { toCsv } from "./exporting";
const permissionProcedure = (permission: GranularPermissionKey) =>
  protectedProcedure.use(({ ctx, next }) => {
    if (!canPerform(ctx.user.role, ctx.user.permissions, permission))
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `لا تملك صلاحية: ${permission}`,
      });
    return next();
  });
const managerPermissionProcedure = (permission: GranularPermissionKey) =>
  adminProcedure.use(({ ctx, next }) => {
    if (!canPerform(ctx.user.role, ctx.user.permissions, permission))
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `لا تملك صلاحية: ${permission}`,
      });
    return next();
  });

import {
  createCustomer,
  updateCustomer,
  deleteCustomerSafely,
  createMaintenance,
  updateMaintenance,
  deleteMaintenanceSafely,
  createOfficeLiability,
  updateOfficeLiability,
  deleteOfficeLiabilitySafely,
  createContract,
  deleteContractSafely,
  deleteOperationSafely,
  deletePaymentSafely,
  deleteVehicle,
  getAccountingSummary,
  getOperationalAccountingSummary,
  listPayments,
  listReturns,
  getDashboardAlerts,
  getDashboardSummary,
  getFleetReport,
  getOfficeLiabilitySummary,
  getOfficeInsights,
  listExpenseTypes,
  createExpenseType,
  listEmployees,
  createEmployee,
  getContractDetails,
  getCustomerDetails,
  getVehicleDetails,
  getVehicleRevenueReport,
  listAvailableVehicles,
  getVehicleReadiness,
  setVehicleReadiness,
  getVehicleReadinessHistory,
  getFleetReadiness,
  listVehicles,
  listContracts,
  listContractOperations,
  listAllContractOperations,
  listCustomers,
  listMaintenance,
  listOpenVehicleNotes,
  getMonthlyInstallments,
  backfillMonthlyInstallments,
  createVehicleNote,
  resolveVehicleNote,
  listOfficeLiabilities,
  recordContractOperation,
  recordOfficeLiabilityPayment,
  approveOfficeLiability,
  searchCustomerLedger,
  updateMaintenanceStatus,
  createVehicle,
  updateVehicle,
  updateContractRetroactively,
  updatePaymentRetroactively,
  upsertUser,
  getUserByUsername,
  listManagedUsers,
  createManagedUser,
  updateManagedUser,
  deleteManagedUser,
  hashLocalPassword,
  createEmailVerificationToken,
  verifyManagedUserEmail,
  changeManagedUserPassword,
  createPasswordResetToken,
  clearPasswordResetToken,
  getVerifiedUserByEmail,
  resetManagedUserPassword,
  listBlockedCustomers,
  createBlockedCustomer,
  listSiteContent,
  upsertSiteContent,
  resetSiteContent,
} from "./db";
import {
  PASSWORD_RESET_MESSAGE,
  buildPasswordResetUrl,
  consumePasswordResetRateLimit,
  hashPasswordResetRateLimitEmail,
  sendPasswordResetEmail,
} from "./passwordReset";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    localLogin: publicProcedure
      .input(
        z.object({ username: z.string().min(1), password: z.string().min(1) })
      )
      .mutation(async ({ input, ctx }) => {
        if (process.env.LOCAL_AUTH_ENABLED === "false")
          throw new Error("Local login is disabled");
        const managedUser = await getUserByUsername(input.username);
        const expectedUsername = process.env.LOCAL_ADMIN_USERNAME || "admin";
        const expectedPassword = process.env.LOCAL_ADMIN_PASSWORD;
        const validManaged =
          managedUser?.isActive &&
          managedUser.passwordHash === hashLocalPassword(input.password);
        const validOwner =
          !managedUser &&
          Boolean(expectedPassword) &&
          input.username === expectedUsername &&
          input.password === expectedPassword;
        if (!validManaged && !validOwner)
          throw new Error("اسم المستخدم أو كلمة المرور غير صحيحة");
        const host = String(ctx.req.headers.host ?? "")
          .split(":")[0]
          .toLowerCase();
        const isLocalHost =
          host === "localhost" || host === "127.0.0.1" || host === "[::1]";
        if (managedUser && !isLocalHost && !managedUser.emailVerifiedAt)
          throw new Error(
            "يجب توثيق البريد الإلكتروني قبل الدخول من خارج الموقع المحلي"
          );
        const openId = managedUser?.openId ?? `local_${expectedUsername}`;
        if (!managedUser)
          await upsertUser({
            openId,
            name: "مدير النظام",
            email: null,
            loginMethod: "local",
            role: "admin",
            lastSignedIn: new Date(),
          });
        const sessionToken = await sdk.createSessionToken(openId, {
          name: managedUser?.name ?? "مدير النظام",
          expiresInMs: ONE_YEAR_MS,
        });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, {
          ...cookieOptions,
          maxAge: ONE_YEAR_MS,
        });
        return { success: true } as const;
      }),
    requestPasswordReset: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ input, ctx }) => {
        const forwardedFor = String(ctx.req.headers["x-forwarded-for"] ?? "");
        const ip =
          forwardedFor.split(",")[0]?.trim() ||
          ctx.req.socket.remoteAddress ||
          "unknown";
        const emailKey = hashPasswordResetRateLimitEmail(input.email);
        if (!consumePasswordResetRateLimit([`ip:${ip}`, `email:${emailKey}`]))
          return { success: true, message: PASSWORD_RESET_MESSAGE } as const;
        const user = await getVerifiedUserByEmail(input.email);
        if (user?.email) {
          const result = await createPasswordResetToken(user.id);
          try {
            if (!process.env.PUBLIC_APP_URL)
              throw new Error("Password reset public URL is not configured");
            await sendPasswordResetEmail({
              to: user.email,
              resetUrl: buildPasswordResetUrl(
                process.env.PUBLIC_APP_URL ?? "",
                result.token
              ),
            });
          } catch {
            await clearPasswordResetToken(user.id);
          }
        }
        return { success: true, message: PASSWORD_RESET_MESSAGE } as const;
      }),
    verifyEmail: publicProcedure
      .input(z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }))
      .mutation(async ({ input }) => {
        const user = await verifyManagedUserEmail(input.token);
        if (!user)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "رابط التحقق غير صالح أو منتهي",
          });
        return { success: true, user } as const;
      }),
    changePassword: protectedProcedure
      .input(
        z.object({
          currentPassword: z.string().min(1),
          newPassword: z.string().min(8),
        })
      )
      .mutation(({ input, ctx }) =>
        changeManagedUserPassword(
          ctx.user.id,
          input.currentPassword,
          input.newPassword
        )
      ),
    resetPassword: publicProcedure
      .input(
        z.object({
          token: z.string().regex(/^[a-f0-9]{64}$/),
          newPassword: z.string().min(8),
        })
      )
      .mutation(async ({ input }) => {
        const success = await resetManagedUserPassword(
          input.token,
          input.newPassword
        );
        if (!success)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "رابط الاستعادة غير صالح أو منتهي",
          });
        return { success: true } as const;
      }),
  }),
  users: router({
    list: managerPermissionProcedure("user_management.view").query(() =>
      listManagedUsers()
    ),
    create: managerPermissionProcedure("user_management.create")
      .input(
        z.object({
          username: z.string().trim().min(3).max(64),
          password: z.string().min(6),
          name: z.string().trim().min(2),
          email: z.string().email().optional(),
          role: z.enum(["user", "admin"]),
          permissions: z.array(z.enum(allPermissionKeys)).default([]),
        })
      )
      .mutation(({ input }) => createManagedUser(input)),
    update: managerPermissionProcedure("user_management.edit")
      .input(
        z.object({
          id: z.number().int().positive(),
          username: z.string().trim().min(3).max(64).optional(),
          name: z.string().trim().min(2).optional(),
          email: z.string().email().optional(),
          password: z.string().min(6).optional(),
          role: z.enum(["user", "admin"]).optional(),
          isActive: z.boolean().optional(),
          permissions: z.array(z.enum(allPermissionKeys)).optional(),
        })
      )
      .mutation(({ input, ctx }) => {
        if (input.id === ctx.user.id && input.isActive === false)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "لا يمكن تعطيل حسابك الحالي",
          });
        return updateManagedUser(input);
      }),
    delete: managerPermissionProcedure("user_management.delete")
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ input, ctx }) => {
        if (input.id === ctx.user.id)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "لا يمكن حذف الحساب المستخدم حالياً",
          });
        return deleteManagedUser(input.id);
      }),
    createVerificationLink: managerPermissionProcedure(
      "user_management.reset_password"
    )
      .input(
        z.object({ id: z.number().int().positive(), origin: z.string().url() })
      )
      .mutation(async ({ input }) => {
        const result = await createEmailVerificationToken(input.id);
        return {
          ...result,
          verificationUrl: `${input.origin.replace(/\/$/, "")}/verify-email?token=${result.token}`,
        };
      }),
    createPasswordResetLink: managerPermissionProcedure(
      "user_management.reset_password"
    )
      .input(
        z.object({ id: z.number().int().positive(), origin: z.string().url() })
      )
      .mutation(async ({ input }) => {
        const result = await createPasswordResetToken(input.id);
        return {
          ...result,
          resetUrl: `${input.origin.replace(/\/$/, "")}/reset-password?token=${result.token}`,
        };
      }),
  }),
  dashboard: permissionProcedure("dashboard.view").query(() =>
    getDashboardSummary()
  ),
  alerts: permissionProcedure("dashboard.view").query(async ({ ctx }) => {
    const alerts = await getDashboardAlerts();
    return ctx.user.role === "admin"
      ? alerts
      : alerts.filter(alert => alert.type !== "vehicle_note");
  }),
  officeEye: managerPermissionProcedure("dashboard.insights").query(() =>
    getOfficeInsights()
  ),
  accounting: permissionProcedure("accounting.view").query(({ ctx }) =>
    ctx.user.role === "admin"
      ? getAccountingSummary()
      : getOperationalAccountingSummary()
  ),
  siteContent: router({
    list: permissionProcedure("site_content.view").query(() =>
      listSiteContent()
    ),
    save: managerPermissionProcedure("site_content.edit")
      .input(
        z.object({
          contentKey: z.string().min(1).max(160),
          contentType: z.enum(["text", "link"]),
          value: z.string().max(4000),
          originalValue: z.string().max(4000),
        })
      )
      .mutation(({ input, ctx }) =>
        upsertSiteContent({ ...input, updatedBy: ctx.user.id })
      ),
    reset: managerPermissionProcedure("site_content.edit")
      .input(z.object({ contentKey: z.string().min(1).max(160) }))
      .mutation(({ input, ctx }) =>
        resetSiteContent(input.contentKey, ctx.user.id)
      ),
  }),
  blockedCustomers: router({
    list: managerPermissionProcedure("blocked_customers.view").query(() =>
      listBlockedCustomers()
    ),
    create: managerPermissionProcedure("blocked_customers.create")
      .input(
        z.object({
          fullName: z.string().trim().min(2),
          identityNumber: z.string().trim().max(64).optional(),
          phone: z.string().trim().max(32).optional(),
          nationality: z.string().trim().max(64).optional(),
          reason: z.string().trim().min(2),
          source: z.string().trim().max(160).optional(),
        })
      )
      .mutation(({ input }) => createBlockedCustomer(input)),
  }),
  expenseTypes: router({
    list: permissionProcedure("accounting.view").query(() =>
      listExpenseTypes()
    ),
    create: managerPermissionProcedure("accounting.edit")
      .input(
        z.object({
          name: z.string().min(2),
          recurrence: z.enum([
            "one_time",
            "monthly",
            "quarterly",
            "semiannual",
            "annual",
          ]),
          defaultAmount: z.string().optional(),
        })
      )
      .mutation(({ input }) => createExpenseType(input)),
  }),
  employees: router({
    list: permissionProcedure("accounting.view").query(() => listEmployees()),
    create: managerPermissionProcedure("accounting.edit")
      .input(
        z.object({
          fullName: z.string().min(2),
          salary: z.string().min(1),
          hireDate: z.string().min(1),
        })
      )
      .mutation(({ input }) => createEmployee(input)),
  }),
  liabilities: router({
    list: permissionProcedure("accounting.view").query(() =>
      listOfficeLiabilities()
    ),
    summary: permissionProcedure("accounting.view").query(() =>
      getOfficeLiabilitySummary()
    ),
    create: permissionProcedure("accounting.create")
      .input(
        z.object({
          category: z.string().min(1),
          description: z.string().min(2),
          amount: z.string().min(1),
          dueDate: z.string().optional(),
          expenseDate: z.string().optional(),
          expenseTypeId: z.number().int().positive().optional(),
          employeeId: z.number().int().positive().optional(),
          notes: z.string().optional(),
          expenseReason: z.string().optional(),
          contractNumber: z.string().optional(),
          paymentMethod: z.enum(["cash", "network", "transfer"]).optional(),
        })
      )
      .mutation(({ input, ctx }) => {
        if (
          !canPerform(ctx.user.role, ctx.user.permissions, "accounting.create")
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "لا تملك صلاحية تسجيل المصروفات",
          });
        return createOfficeLiability({ ...input, createdBy: ctx.user.id });
      }),
    update: managerPermissionProcedure("accounting.edit")
      .input(
        z.object({
          id: z.number().int().positive(),
          category: z.string().min(1).optional(),
          description: z.string().min(2).optional(),
          amount: z.string().optional(),
          dueDate: z.string().nullable().optional(),
          expenseDate: z.string().nullable().optional(),
          notes: z.string().nullable().optional(),
          reason: z.string().trim().min(2),
        })
      )
      .mutation(({ input, ctx }) =>
        updateOfficeLiability({ ...input, updatedBy: ctx.user.id })
      ),
    deleteSafely: managerPermissionProcedure("accounting.delete")
      .input(
        z.object({
          id: z.number().int().positive(),
          reason: z.string().trim().min(2),
        })
      )
      .mutation(({ input, ctx }) =>
        deleteOfficeLiabilitySafely({ ...input, deletedBy: ctx.user.id })
      ),
    pay: managerPermissionProcedure("accounting.pay")
      .input(
        z.object({
          id: z.number().int().positive(),
          amount: z.string().min(1),
          paymentMethod: z.enum(["cash", "network", "transfer"]),
        })
      )
      .mutation(({ input, ctx }) =>
        recordOfficeLiabilityPayment(
          input.id,
          input.amount,
          input.paymentMethod,
          ctx.user.id
        )
      ),
    approve: managerPermissionProcedure("accounting.approve")
      .input(
        z.object({
          id: z.number().int().positive(),
          status: z.enum(["approved", "rejected"]),
          reason: z.string().optional(),
        })
      )
      .mutation(({ input, ctx }) =>
        approveOfficeLiability({ ...input, approvedBy: ctx.user.id })
      ),
  }),
  financialExpenses: router({
    list: permissionProcedure("accounting.view").query(() =>
      listFinancialExpenses()
    ),
    summary: permissionProcedure("accounting.view").query(() =>
      getFinancialExpenseSummary()
    ),
    create: permissionProcedure("accounting.create")
      .input(
        z.object({
          expenseType: z.enum([
            "parts",
            "labor",
            "external_workshop",
            "freon",
            "glass",
            "warranty",
            "other",
          ]),
          amount: z.string().trim().min(1),
          vehicleId: z.number().int().positive().optional(),
          partType: z.string().trim().max(160).optional(),
          paymentMethod: z.enum(["cash", "network", "transfer"]).optional(),
          description: z.string().trim().min(2).max(240),
        })
      )
      .mutation(({ input, ctx }) =>
        createFinancialExpense({ ...input, createdBy: ctx.user.id })
      ),
    approve: managerPermissionProcedure("accounting.approve")
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ input, ctx }) =>
        decideFinancialExpense(input.id, ctx.user.id, "approved")
      ),
    reject: managerPermissionProcedure("accounting.approve")
      .input(
        z.object({
          id: z.number().int().positive(),
          rejectionReason: z.string().trim().min(1),
        })
      )
      .mutation(({ input, ctx }) =>
        decideFinancialExpense(
          input.id,
          ctx.user.id,
          "rejected",
          input.rejectionReason
        )
      ),
    correct: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          expenseType: z.enum([
            "parts",
            "labor",
            "external_workshop",
            "freon",
            "glass",
            "warranty",
            "other",
          ]),
          amount: z.string().trim().min(1),
          vehicleId: z.number().int().positive().optional(),
          partType: z.string().trim().max(160).optional(),
          paymentMethod: z.enum(["cash", "network", "transfer"]).optional(),
          description: z.string().trim().min(2).max(240),
        })
      )
      .mutation(({ input, ctx }) =>
        correctFinancialExpense(input.id, { ...input, createdBy: ctx.user.id })
      ),
    reverse: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          expenseType: z.enum([
            "parts",
            "labor",
            "external_workshop",
            "freon",
            "glass",
            "warranty",
            "other",
          ]),
          amount: z.string().trim().min(1),
          vehicleId: z.number().int().positive().optional(),
          partType: z.string().trim().max(160).optional(),
          paymentMethod: z.enum(["cash", "network", "transfer"]).optional(),
          description: z.string().trim().min(2).max(240),
        })
      )
      .mutation(({ input, ctx }) =>
        reverseFinancialExpense(input.id, { ...input, createdBy: ctx.user.id })
      ),
  }),
  financialRevenues: router({
    list: permissionProcedure("accounting.view").query(() =>
      listFinancialRevenues()
    ),
    summary: permissionProcedure("accounting.view").query(() =>
      getFinancialRevenueSummary()
    ),
    create: permissionProcedure("accounting.create")
      .input(
        z.object({
          revenueType: z.enum([
            "rental",
            "insurance_deductible",
            "accident_compensation",
            "other",
          ]),
          amount: z.string().trim().min(1),
          description: z.string().trim().min(2).max(240),
          evidenceReference: z.string().trim().max(240).optional(),
          contractId: z.number().int().positive().optional(),
          customerId: z.number().int().positive().optional(),
          vehicleId: z.number().int().positive().optional(),
          paymentMethod: z
            .enum(["cash", "network", "transfer", "mixed"])
            .optional(),
          sourceTable: z
            .enum([
              "payments",
              "officeLiabilities",
              "legacy",
              "financialTransactions",
            ])
            .optional(),
          sourceId: z.number().int().positive().optional(),
          metadata: z.string().optional(),
        })
      )
      .mutation(({ input, ctx }) =>
        createFinancialRevenue({ ...input, createdBy: ctx.user.id })
      ),
    approve: managerPermissionProcedure("accounting.approve")
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ input, ctx }) =>
        approveFinancialRevenue(input.id, ctx.user.id)
      ),
    reject: managerPermissionProcedure("accounting.approve")
      .input(
        z.object({
          id: z.number().int().positive(),
          rejectionReason: z.string().trim().min(1),
        })
      )
      .mutation(({ input, ctx }) =>
        rejectFinancialRevenue(input.id, ctx.user.id, input.rejectionReason)
      ),
    correct: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          revenueType: z.enum([
            "rental",
            "insurance_deductible",
            "accident_compensation",
            "other",
          ]),
          amount: z.string().trim().min(1),
          description: z.string().trim().min(2).max(240),
          evidenceReference: z.string().trim().max(240).optional(),
          contractId: z.number().int().positive().optional(),
          customerId: z.number().int().positive().optional(),
          vehicleId: z.number().int().positive().optional(),
          paymentMethod: z
            .enum(["cash", "network", "transfer", "mixed"])
            .optional(),
          metadata: z.string().optional(),
        })
      )
      .mutation(({ input, ctx }) =>
        correctFinancialRevenue(input.id, { ...input, createdBy: ctx.user.id })
      ),
    reverse: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          revenueType: z.enum([
            "rental",
            "insurance_deductible",
            "accident_compensation",
            "other",
          ]),
          amount: z.string().trim().min(1),
          description: z.string().trim().min(2).max(240),
          evidenceReference: z.string().trim().max(240).optional(),
          contractId: z.number().int().positive().optional(),
          customerId: z.number().int().positive().optional(),
          vehicleId: z.number().int().positive().optional(),
          paymentMethod: z
            .enum(["cash", "network", "transfer", "mixed"])
            .optional(),
          metadata: z.string().optional(),
        })
      )
      .mutation(({ input, ctx }) =>
        reverseFinancialRevenue(input.id, { ...input, createdBy: ctx.user.id })
      ),
  }),
  financialReporting: router({
    readModel: permissionProcedure("accounting.view")
      .input(z.object({ cycleDate: z.string().optional() }).optional())
      .query(({ input }) => getFinancialReportingReadModel(input)),
    transactions: permissionProcedure("accounting.view").query(() =>
      listFinancialReportingTransactions()
    ),
    allocations: permissionProcedure("accounting.view").query(() =>
      listApprovedFinancialAllocations()
    ),
    annual: permissionProcedure("accounting.view")
      .input(z.object({ year: z.number().int().min(2020).max(2100) }))
      .query(async ({ input }) => {
        const start = new Date(input.year, 0, 1);
        const end = new Date(input.year, 11, 31, 23, 59, 59);
        await getFinancialReportingReadModel({
          cycleDate: new Date(input.year, 6, 15).toISOString(),
        });
        const allTransactions = await getAllFinancialTransactionsForRange(start, end);
        const monthly = aggregateByMonthlyCycle(allTransactions, input.year);
        const totalRevenues = monthly.reduce((sum, month) => sum + month.revenues, 0);
        const totalExpenses = monthly.reduce((sum, month) => sum + month.expenses, 0);
        const totalPayments = monthly.reduce((sum, month) => sum + month.payments, 0);
        return {
          year: input.year,
          monthly,
          totals: {
            revenues: totalRevenues,
            expenses: totalExpenses,
            payments: totalPayments,
            net: totalRevenues - totalExpenses,
          },
        };
      }),
  }),
  exports: router({
    financialCsv: permissionProcedure("accounting.view")
      .input(z.object({ cycleDate: z.string().optional() }).optional())
      .query(async ({ input }) => {
        const model = await getFinancialReportingReadModel(input);
        const rows = model.transactions.map(tx => ({
          date: tx.transactionDate
            ? new Date(tx.transactionDate).toISOString().slice(0, 10)
            : "",
          type: tx.transactionType,
          status: tx.approvalStatus,
          amount: tx.amount,
          method: tx.paymentMethod ?? "",
          contract: tx.contractId ?? "",
          customer: "",
          vehicle: tx.vehicleId ?? "",
          description: tx.description ?? "",
        }));
        const csv = toCsv(rows, [
          { key: "date", header: "التاريخ" },
          { key: "type", header: "النوع" },
          { key: "status", header: "الحالة" },
          { key: "amount", header: "المبلغ" },
          { key: "method", header: "طريقة الدفع" },
          { key: "contract", header: "العقد" },
          { key: "customer", header: "العميل" },
          { key: "vehicle", header: "السيارة" },
          { key: "description", header: "الوصف" },
        ]);
        return {
          csv,
          filename: `financial-${new Date().toISOString().slice(0, 10)}.csv`,
        };
      }),
    paymentsCsv: permissionProcedure("accounting.view")
      .input(z.object({ cycleDate: z.string().optional() }).optional())
      .query(async ({ input }) => {
        const model = await getFinancialReportingReadModel(input);
        const rows = model.transactions
          .filter(transaction => transaction.transactionType === "payment")
          .map(tx => ({
            date: tx.transactionDate
              ? new Date(tx.transactionDate).toISOString().slice(0, 10)
              : "",
            amount: tx.amount,
            method: tx.paymentMethod ?? "",
            status: tx.approvalStatus,
            contract: tx.contractId ?? "",
          }));
        const csv = toCsv(rows, [
          { key: "date", header: "التاريخ" },
          { key: "amount", header: "المبلغ" },
          { key: "method", header: "طريقة الدفع" },
          { key: "status", header: "الحالة" },
          { key: "contract", header: "العقد" },
        ]);
        return {
          csv,
          filename: `payments-${new Date().toISOString().slice(0, 10)}.csv`,
        };
      }),
    expensesCsv: permissionProcedure("accounting.view")
      .input(z.object({ cycleDate: z.string().optional() }).optional())
      .query(async ({ input }) => {
        const model = await getFinancialReportingReadModel(input);
        const rows = model.transactions
          .filter(transaction => transaction.transactionType === "expense")
          .map(tx => ({
            date: tx.transactionDate
              ? new Date(tx.transactionDate).toISOString().slice(0, 10)
              : "",
            amount: tx.amount,
            method: tx.paymentMethod ?? "",
            status: tx.approvalStatus,
            vehicle: tx.vehicleId ?? "",
            description: tx.description ?? "",
          }));
        const csv = toCsv(rows, [
          { key: "date", header: "التاريخ" },
          { key: "amount", header: "المبلغ" },
          { key: "method", header: "طريقة الدفع" },
          { key: "status", header: "الحالة" },
          { key: "vehicle", header: "السيارة" },
          { key: "description", header: "الوصف" },
        ]);
        return {
          csv,
          filename: `expenses-${new Date().toISOString().slice(0, 10)}.csv`,
        };
      }),
  }),
  reports: router({
    fleet: permissionProcedure("reports.view").query(() => getFleetReport()),
    vehicleRevenue: permissionProcedure("reports.view")
      .input(
        z
          .object({
            from: z.string().date().optional(),
            to: z.string().date().optional(),
          })
          .optional()
      )
      .query(({ input }) => getVehicleRevenueReport(input ?? {})),
  }),
  payments: router({
    list: permissionProcedure("payments.view").query(async ({ ctx }) => {
      const rows = await listPayments();
      return ctx.user.role === "admin"
        ? rows
        : rows.filter(
            row =>
              !row.contract?.status ||
              isOperatorVisibleContractStatus(row.contract.status)
          );
    }),
    updateRetroactive: managerPermissionProcedure("payments.edit")
      .input(
        z.object({
          id: z.number().int().positive(),
          amount: z.string().optional(),
          method: z.enum(["cash", "network", "transfer", "mixed"]).optional(),
          notes: z.string().nullable().optional(),
          reason: z.string().trim().min(2),
        })
      )
      .mutation(({ input, ctx }) =>
        updatePaymentRetroactively({ ...input, createdBy: ctx.user.id })
      ),
    deleteSafely: managerPermissionProcedure("payments.delete")
      .input(
        z.object({
          id: z.number().int().positive(),
          reason: z.string().trim().min(2),
        })
      )
      .mutation(({ input, ctx }) =>
        deletePaymentSafely({ ...input, deletedBy: ctx.user.id })
      ),
  }),
  returns: router({
    list: managerPermissionProcedure("returns.view").query(() => listReturns()),
  }),
  contracts: router({
    create: permissionProcedure("contracts.create")
      .input(
        z.object({
          contractNumber: z.string().trim().min(2).optional(),
          customerId: z.number().int().positive(),
          vehicleId: z.number().int().positive(),
          vehicleMileage: z.number().int().min(0),
          odometerCorrectionReason: z.string().trim().min(2).optional(),
          oilOverrideAcknowledged: z.boolean().optional(),
          vehicleNoteResolution: z
            .enum(["repaired", "not_repaired", "not_needed"])
            .optional(),
          type: z.enum(["daily", "monthly"]),
          contractScope: z
            .enum(["domestic_limited", "domestic_open", "international"])
            .optional(),
          startDate: z.string(),
          expectedReturnDate: z.string(),
          rentalAmount: z.string().min(1),
          days: z.number().int().positive(),
          totalAmount: z.string().min(1),
          paidAmount: z.string().optional(),
          initialCashAmount: z.string().optional(),
          initialNetworkAmount: z.string().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(({ input, ctx }) =>
        createContract({ ...input, createdBy: ctx.user.id })
      ),
    list: permissionProcedure("contracts.view")
      .input(
        z
          .object({
            status: z
              .enum(["active", "overdue", "suspended", "closed", "returned"])
              .optional(),
          })
          .optional()
      )
      .query(async ({ input, ctx }) => {
        if (ctx.user.role === "admin") return listContracts(input?.status);
        if (input?.status && !isOperatorVisibleContractStatus(input.status))
          return [];
        const statuses = input?.status
          ? [input.status]
          : (["active", "overdue", "suspended"] as const);
        const groups = await Promise.all(
          statuses.map(status => listContracts(status))
        );
        return groups.flat();
      }),
    details: permissionProcedure("contracts.view")
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ input, ctx }) => {
        const result = await getContractDetails(input.id);
        if (
          ctx.user.role !== "admin" &&
          !isOperatorVisibleContractStatus(result?.contract?.status)
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "لا يملك المستخدم صلاحية عرض هذا العقد",
          });
        return result;
      }),
    updateRetroactive: managerPermissionProcedure("contracts.edit")
      .input(
        z.object({
          id: z.number().int().positive(),
          contractNumber: z.string().trim().min(2).optional(),
          customerId: z.number().int().positive().optional(),
          vehicleId: z.number().int().positive().optional(),
          vehicleMileage: z.number().int().min(0).optional(),
          odometerCorrectionReason: z.string().trim().min(2).optional(),
          type: z.enum(["daily", "monthly"]).optional(),
          contractScope: z
            .enum(["domestic_limited", "domestic_open", "international"])
            .optional(),
          status: z
            .enum(["active", "overdue", "suspended", "closed", "returned"])
            .optional(),
          startDate: z.string().optional(),
          expectedReturnDate: z.string().optional(),
          actualReturnDate: z.string().nullable().optional(),
          rentalAmount: z.string().optional(),
          days: z.number().int().positive().optional(),
          totalAmount: z.string().optional(),
          notes: z.string().nullable().optional(),
          reason: z.string().trim().min(2),
        })
      )
      .mutation(({ input, ctx }) =>
        updateContractRetroactively({ ...input, createdBy: ctx.user.id })
      ),
    deleteSafely: managerPermissionProcedure("contracts.delete")
      .input(
        z.object({
          id: z.number().int().positive(),
          reason: z.string().trim().min(2),
        })
      )
      .mutation(({ input, ctx }) =>
        deleteContractSafely({ ...input, deletedBy: ctx.user.id })
      ),
  }),
  readiness: router({
    get: permissionProcedure("vehicles.view")
      .input(z.object({ vehicleId: z.number().int().positive() }))
      .query(({ input }) => getVehicleReadiness(input.vehicleId)),
    set: permissionProcedure("vehicles.maintenance")
      .input(z.object({
        vehicleId: z.number().int().positive(),
        state: z.enum(["returned", "cleaning", "qc", "ready", "blocked"]),
        blockedReason: z.string().min(2).optional(),
        notes: z.string().optional(),
      }))
      .mutation(({ input, ctx }) => setVehicleReadiness({ ...input, changedBy: ctx.user.id })),
    history: permissionProcedure("vehicles.view")
      .input(z.object({ vehicleId: z.number().int().positive() }))
      .query(({ input }) => getVehicleReadinessHistory(input.vehicleId)),
    fleet: permissionProcedure("vehicles.view").query(() => getFleetReadiness()),
  }),
  monthlyInstallments: router({
    list: permissionProcedure("contracts.view")
      .input(z.object({ contractId: z.number().int().positive() }))
      .query(({ input }) => getMonthlyInstallments(input.contractId)),
    backfill: permissionProcedure("contracts.operate")
      .input(z.object({ contractId: z.number().int().positive() }))
      .mutation(({ input }) => backfillMonthlyInstallments(input.contractId)),
  }),
  vehicles: router({
    list: permissionProcedure("vehicles.view").query(() => listVehicles()),
    details: permissionProcedure("vehicles.view")
      .input(z.object({ id: z.number().int().positive() }))
      .query(({ input }) => getVehicleDetails(input.id)),
    available: permissionProcedure("vehicles.view").query(() =>
      listAvailableVehicles()
    ),
    create: managerPermissionProcedure("vehicles.create")
      .input(
        z.object({
          plateNumber: z.string().min(2),
          make: z.string().min(2),
          model: z.string().min(1),
          modelYear: z
            .number()
            .int()
            .refine(isValidVehicleModelYear, {
              message: "سنة السيارة يجب أن تكون بين 1 و2100",
            }),
          dailyRate: z.string().min(1),
          monthlyRate: z.string().min(1),
          mileage: z.number().int().min(0).optional(),
          lastOilChangeMileage: z.number().int().min(0).optional(),
          lastOilChangeDate: z.string().optional(),
          oilChangeInterval: z.number().int().positive().optional(),
          insuranceExpiryDate: z.string().optional(),
          inspectionExpiryDate: z.string().optional(),
          registrationExpiryDate: z.string().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(({ input }) => createVehicle(input)),
    update: permissionProcedure("vehicles.maintenance")
      .input(
        z.object({
          id: z.number().int().positive(),
          mileage: z.number().int().min(0).optional(),
          lastOilChangeMileage: z.number().int().min(0).optional(),
          lastOilChangeDate: z.string().optional(),
          oilChangeInterval: z.number().int().positive().optional(),
          insuranceExpiryDate: z.string().optional(),
          inspectionExpiryDate: z.string().optional(),
          registrationExpiryDate: z.string().optional(),
        })
      )
      .mutation(({ input, ctx }) => {
        const { id, ...values } = input;
        if (ctx.user.role !== "admin") {
          if (
            !canPerform(
              ctx.user.role,
              ctx.user.permissions,
              "vehicles.maintenance"
            )
          )
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "لا تملك صلاحية تحديث السيارة",
            });
          const {
            mileage,
            lastOilChangeMileage,
            lastOilChangeDate,
            oilChangeInterval,
          } = values;
          if (
            values.insuranceExpiryDate !== undefined ||
            values.inspectionExpiryDate !== undefined ||
            values.registrationExpiryDate !== undefined
          )
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "تحديث وثائق السيارة للمدير فقط",
            });
          if (
            [
              mileage,
              lastOilChangeMileage,
              lastOilChangeDate,
              oilChangeInterval,
            ].every(value => value === undefined)
          )
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "اختر بيانات الزيت أو الصيانة لتحديثها",
            });
          return updateVehicle(id, {
            mileage,
            lastOilChangeMileage,
            lastOilChangeDate,
            oilChangeInterval,
          });
        }
        return updateVehicle(id, values);
      }),
    delete: managerPermissionProcedure("vehicles.delete")
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ input, ctx }) => deleteVehicle(input.id, ctx.user.id)),
  }),
  customers: router({
    list: permissionProcedure("customers.view").query(() => listCustomers()),
    details: permissionProcedure("customers.view")
      .input(z.object({ id: z.number().int().positive() }))
      .query(({ input }) => getCustomerDetails(input.id)),
    ledger: permissionProcedure("customers.view")
      .input(z.object({ query: z.string().min(1) }))
      .query(({ input }) => searchCustomerLedger(input.query)),
    create: permissionProcedure("customers.create")
      .input(
        z.object({
          identityNumber: z.string().min(1),
          fullName: z.string().min(2),
          phone: z.string().min(5),
          phoneSecondary: z.string().min(5).optional(),
          email: z.string().email().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(({ input }) => createCustomer(input)),
    update: managerPermissionProcedure("customers.edit")
      .input(
        z.object({
          id: z.number().int().positive(),
          identityNumber: z.string().min(1).optional(),
          fullName: z.string().min(2).optional(),
          phone: z.string().min(5).optional(),
          phoneSecondary: z.string().min(5).nullable().optional(),
          email: z.string().email().nullable().optional(),
          notes: z.string().nullable().optional(),
          reason: z.string().trim().min(2),
        })
      )
      .mutation(({ input, ctx }) =>
        updateCustomer({ ...input, updatedBy: ctx.user.id })
      ),
    deleteSafely: managerPermissionProcedure("customers.delete")
      .input(
        z.object({
          id: z.number().int().positive(),
          reason: z.string().trim().min(2),
        })
      )
      .mutation(({ input, ctx }) =>
        deleteCustomerSafely({ ...input, deletedBy: ctx.user.id })
      ),
  }),
  operations: router({
    list: permissionProcedure("operations.view")
      .input(
        z
          .object({
            from: z.string().date().optional(),
            to: z.string().date().optional(),
          })
          .optional()
      )
      .query(async ({ input, ctx }) => {
        const rows = await listAllContractOperations(input);
        return ctx.user.role === "admin"
          ? rows
          : rows.filter(row =>
              isOperatorVisibleContractStatus(row.contract?.status)
            );
      }),
    history: permissionProcedure("operations.view")
      .input(z.object({ contractId: z.number().int().positive() }))
      .query(async ({ input, ctx }) => {
        const contract = await getContractDetails(input.contractId);
        if (
          ctx.user.role !== "admin" &&
          !isOperatorVisibleContractStatus(contract?.contract?.status)
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "لا تملك صلاحية عرض عمليات هذا العقد",
          });
        return listContractOperations(input.contractId);
      }),
    deleteSafely: managerPermissionProcedure("operations.delete")
      .input(
        z.object({
          id: z.number().int().positive(),
          reason: z.string().trim().min(2),
        })
      )
      .mutation(({ input, ctx }) =>
        deleteOperationSafely({ ...input, deletedBy: ctx.user.id })
      ),
    record: protectedProcedure
      .input(
        z
          .object({
            contractId: z.number().int().positive().optional(),
            contractNumber: z.string().trim().min(1).optional(),
            operation: z.enum([
              "new_contract",
              "extension",
              "payment",
              "additional_fee",
              "rate_update",
              "vehicle_swap",
              "suspend",
              "close",
              "return",
            ]),
            vehicleId: z.number().int().positive().optional(),
            vehicleMileage: z.number().int().min(0).optional(),
            odometerCorrectionReason: z.string().trim().min(2).optional(),
            vehicleNote: z.string().trim().min(2).optional(),
            requestId: z.string().trim().min(1).max(120).optional(),
            paymentException: z
              .enum([
                "suspended_contract",
                "previous_contract",
                "legacy_unlinked",
                "justified_non_suspended",
              ])
              .optional(),
            exceptionReason: z.string().trim().min(2).optional(),
            amount: z.string().optional(),
            paymentMethod: z
              .enum(["cash", "network", "transfer", "mixed"])
              .optional(),
            paymentCashAmount: z.string().optional(),
            paymentNetworkAmount: z.string().optional(),
            paymentFirstMethod: z
              .enum(["cash", "network", "transfer"])
              .optional(),
            paymentSecondMethod: z
              .enum(["cash", "network", "transfer"])
              .optional(),
            paymentFirstAmount: z.string().optional(),
            paymentSecondAmount: z.string().optional(),
            extensionPaymentAmount: z.string().optional(),
            extensionPaymentMethod: z
              .enum(["cash", "network", "transfer", "mixed"])
              .optional(),
            extensionPaymentCashAmount: z.string().optional(),
            extensionPaymentNetworkAmount: z.string().optional(),
            paymentReason: z
              .enum([
                "extra_km",
                "international_authorization_fee",
                "insurance_deductible",
                "vehicle_damage_compensation",
                "vehicle_cleaning_fee",
              ])
              .optional(),
            extensionDays: z.number().int().positive().optional(),
            followUpDate: z.string().date().optional(),
            details: z.string().optional(),
          })
          .refine(input => Boolean(input.contractId || input.contractNumber), {
            message: "أدخل رقم العقد أولاً",
            path: ["contractNumber"],
          })
          .refine(
            input =>
              true,
            { message: "أدخل عدد أيام التمديد", path: ["extensionDays"] }
          )
          .refine(
            input =>
              input.operation !== "vehicle_swap" || Boolean(input.vehicleId),
            { message: "اختر سيارة بديلة", path: ["vehicleId"] }
          )
          .refine(
            input =>
              !["payment", "additional_fee"].includes(input.operation) ||
              Boolean(input.amount && Number(input.amount) > 0),
            { message: "أدخل مبلغاً صحيحاً", path: ["amount"] }
          )
          .refine(
            input => input.operation !== "payment" || Boolean(input.paymentMethod),
            { message: "حدد طريقة الدفع", path: ["paymentMethod"] }
          )
          .refine(
            input =>
              input.operation !== "rate_update" ||
              Boolean(input.amount && Number(input.amount) > 0),
            { message: "أدخل سعر التأجير الجديد", path: ["amount"] }
          )
          .refine(
            input =>
              input.operation !== "suspend" || Boolean(input.followUpDate),
            {
              message: "حدد التاريخ المتوقع للسداد أو إعادة التواصل",
              path: ["followUpDate"],
            }
          )
          .refine(
            input =>
              !["vehicle_swap", "close", "return", "suspend"].includes(
                input.operation
              ) || input.vehicleMileage !== undefined,
            {
              message: "أدخل العداد الحالي قبل تنفيذ العملية",
              path: ["vehicleMileage"],
            }
          )
      )
      .mutation(({ input, ctx }) => {
        if (input.operation === "rate_update")
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "تعديل سعر التأجير غير مسموح",
          });
        if (input.paymentException === "previous_contract")
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "سداد عقد سابق غير مسموح",
          });
        const requiredPermission: GranularPermissionKey =
          input.operation === "new_contract"
            ? "contracts.create"
              : input.operation === "payment" ||
                  input.operation === "additional_fee"
                ? "payments.create"
                : input.operation === "extension"
                  ? "contracts.extend"
                  : input.operation === "vehicle_swap"
                    ? "contracts.swap"
                    : input.operation === "suspend"
                      ? "contracts.suspend"
                      : input.operation === "close"
                        ? "contracts.close"
                        : input.operation === "return"
                          ? "contracts.return"
                          : "contracts.operate";
        if (
          !canPerform(ctx.user.role, ctx.user.permissions, requiredPermission)
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `لا تملك صلاحية: ${requiredPermission}`,
          });
        return recordContractOperation({ ...input, createdBy: ctx.user.id });
      }),
  }),
  vehicleNotes: router({
    listOpen: permissionProcedure("vehicles.view")
      .input(
        z
          .object({ vehicleId: z.number().int().positive().optional() })
          .optional()
      )
      .query(({ input }) => listOpenVehicleNotes(input?.vehicleId)),
    create: permissionProcedure("vehicles.maintenance")
      .input(
        z.object({
          vehicleId: z.number().int().positive(),
          sourceContractId: z.number().int().positive().optional(),
          sourceCustomerId: z.number().int().positive().optional(),
          note: z.string().trim().min(2),
          managerFollowUpRequired: z.boolean().optional(),
        })
      )
      .mutation(({ input, ctx }) =>
        createVehicleNote({ ...input, createdBy: ctx.user.id })
      ),
    resolve: managerPermissionProcedure("vehicles.maintenance")
      .input(
        z.object({
          id: z.number().int().positive(),
          resolution: z.enum(["repaired", "not_repaired", "not_needed"]),
          resolutionReason: z.string().trim().min(2),
        })
      )
      .mutation(({ input, ctx }) =>
        resolveVehicleNote({ ...input, resolvedBy: ctx.user.id })
      ),
  }),
  financialTransactions: router({
    list: permissionProcedure("accounting.view").query(() =>
      listFinancialTransactions()
    ),
    get: permissionProcedure("accounting.view")
      .input(z.object({ id: z.number().int().positive() }))
      .query(({ input }) => getFinancialTransaction(input.id)),
    create: protectedProcedure
      .input(
        z
          .object({
            transactionType: z.enum(["payment", "revenue", "expense"]),
            amount: z.string().trim().min(1),
            paymentMethod: z
              .enum(["cash", "network", "transfer", "mixed"])
              .optional(),
            settlementType: z
              .enum([
                "suspended_contract",
                "previous_contract",
                "non_suspended_contract",
                "unlinked",
              ])
              .optional(),
            revenueType: z
              .enum([
                "rental",
                "insurance_deductible",
                "accident_compensation",
                "other",
              ])
              .optional(),
            contractId: z.number().int().positive().optional(),
            customerId: z.number().int().positive().optional(),
            vehicleId: z.number().int().positive().optional(),
            paymentId: z.number().int().positive().optional(),
            liabilityId: z.number().int().positive().optional(),
            sourceTable: z
              .enum([
                "payments",
                "officeLiabilities",
                "legacy",
                "financialTransactions",
              ])
              .optional(),
            sourceId: z.number().int().positive().optional(),
            description: z.string().max(240).optional(),
            metadata: z.string().optional(),
          })
          .refine(
            input =>
              Number.isFinite(Number(input.amount)) && Number(input.amount) > 0,
            { message: "يجب أن يكون مبلغ الحركة أكبر من صفر", path: ["amount"] }
          )
          .refine(
            input => input.transactionType !== "payment" || Boolean(input.paymentMethod),
            { message: "طريقة الدفع مطلوبة للدفعات", path: ["paymentMethod"] }
          )
      )
      .mutation(({ input, ctx }) => {
        const permission: GranularPermissionKey =
          input.transactionType === "payment"
            ? "payments.create"
            : "accounting.create";
        if (!canPerform(ctx.user.role, ctx.user.permissions, permission))
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `لا تملك صلاحية: ${permission}`,
          });
        return createFinancialTransaction({ ...input, createdBy: ctx.user.id });
      }),
    approve: managerPermissionProcedure("accounting.approve")
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ input, ctx }) =>
        approveFinancialTransaction(input.id, ctx.user.id)
      ),
    reject: managerPermissionProcedure("accounting.approve")
      .input(
        z.object({
          id: z.number().int().positive(),
          rejectionReason: z.string().trim().min(1),
        })
      )
      .mutation(({ input, ctx }) =>
        rejectFinancialTransaction(input.id, ctx.user.id, input.rejectionReason)
      ),
    correct: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          transactionType: z.enum(["payment", "revenue", "expense"]),
          amount: z.string().trim().min(1),
          reason: z.string().trim().min(1),
          paymentMethod: z
            .enum(["cash", "network", "transfer", "mixed"])
            .optional(),
          contractId: z.number().int().positive().optional(),
          customerId: z.number().int().positive().optional(),
          vehicleId: z.number().int().positive().optional(),
          description: z.string().max(240).optional(),
          metadata: z.string().optional(),
        })
      )
      .mutation(({ input, ctx }) =>
        correctFinancialTransaction(input.id, {
          ...input,
          createdBy: ctx.user.id,
        })
      ),
    reverse: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          transactionType: z.enum(["payment", "revenue", "expense"]),
          amount: z.string().trim().min(1),
          reason: z.string().trim().min(1),
          paymentMethod: z
            .enum(["cash", "network", "transfer", "mixed"])
            .optional(),
          contractId: z.number().int().positive().optional(),
          customerId: z.number().int().positive().optional(),
          vehicleId: z.number().int().positive().optional(),
          description: z.string().max(240).optional(),
          metadata: z.string().optional(),
        })
      )
      .mutation(({ input, ctx }) =>
        reverseFinancialTransaction(input.id, {
          ...input,
          createdBy: ctx.user.id,
        })
      ),
  }),
  paymentAllocation: router({
    allocate: managerPermissionProcedure("accounting.approve")
      .input(
        z.object({
          transactionId: z.number().int().positive(),
          asOf: z.string().datetime().optional(),
        })
      )
      .mutation(({ input }) =>
        allocateApprovedPayment(
          input.transactionId,
          input.asOf ? new Date(input.asOf) : new Date()
        )
      ),
  }),
  maintenance: router({
    list: permissionProcedure("maintenance.view").query(() =>
      listMaintenance()
    ),
    create: permissionProcedure("maintenance.create")
      .input(
        z.object({
          vehicleId: z.number().int().positive(),
          issueType: z.string().min(2),
          serviceType: z.enum(["maintenance", "oil_change"]).optional(),
          mileage: z.number().int().min(0).optional(),
          startDate: z.string(),
          status: z.enum(["pending", "in_progress"]).optional(),
          cost: z.string().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(({ input }) => createMaintenance(input)),
    updateStatus: managerPermissionProcedure("maintenance.update")
      .input(
        z.object({
          id: z.number().int().positive(),
          vehicleId: z.number().int().positive(),
          status: z.enum([
            "pending",
            "in_progress",
            "completed",
            "written_off",
          ]),
        })
      )
      .mutation(({ input, ctx }) =>
        updateMaintenanceStatus(
          input.id,
          input.status,
          input.vehicleId,
          ctx.user.id
        )
      ),
    update: managerPermissionProcedure("maintenance.update")
      .input(
        z.object({
          id: z.number().int().positive(),
          issueType: z.string().min(2).optional(),
          mileage: z.number().int().min(0).optional(),
          startDate: z.string().optional(),
          cost: z.string().optional(),
          notes: z.string().nullable().optional(),
          reason: z.string().trim().min(2),
        })
      )
      .mutation(({ input, ctx }) =>
        updateMaintenance({ ...input, updatedBy: ctx.user.id })
      ),
    deleteSafely: managerPermissionProcedure("maintenance.delete")
      .input(
        z.object({
          id: z.number().int().positive(),
          reason: z.string().trim().min(2),
        })
      )
      .mutation(({ input, ctx }) =>
        deleteMaintenanceSafely({ ...input, deletedBy: ctx.user.id })
      ),
  }),
});

export type AppRouter = typeof appRouter;
