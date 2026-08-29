import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteContractSafely: vi.fn(async (input: unknown) => ({ success: true, input })),
  deletePaymentSafely: vi.fn(async (input: unknown) => ({ success: true, input })),
  deleteOperationSafely: vi.fn(async (input: unknown) => ({ success: true, input })),
}));

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return { ...actual, ...mocks };
});

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const admin = { user: { id: 44, openId: "admin", name: "مدير", email: null, loginMethod: "local", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "http", headers: {} }, res: {} } as TrpcContext;
const operator = { ...admin, user: { ...admin.user!, id: 45, role: "user" as const } } as TrpcContext;

describe("safe deletion routes", () => {
  it("يسمح للمدير بحذف العقد والدفعة وسجل العملية مع سبب تدقيقي", async () => {
    await expect(appRouter.createCaller(admin).contracts.deleteSafely({ id: 1, reason: "سجل مكرر" })).resolves.toBeDefined();
    await expect(appRouter.createCaller(admin).payments.deleteSafely({ id: 2, reason: "دفعة مكررة" })).resolves.toBeDefined();
    await expect(appRouter.createCaller(admin).operations.deleteSafely({ id: 3, reason: "عملية مكررة" })).resolves.toBeDefined();
    expect(mocks.deleteContractSafely).toHaveBeenCalledWith({ id: 1, reason: "سجل مكرر", deletedBy: 44 });
    expect(mocks.deletePaymentSafely).toHaveBeenCalledWith({ id: 2, reason: "دفعة مكررة", deletedBy: 44 });
    expect(mocks.deleteOperationSafely).toHaveBeenCalledWith({ id: 3, reason: "عملية مكررة", deletedBy: 44 });
  });

  it("يرفض الحذف من المستخدم التشغيلي", async () => {
    await expect(appRouter.createCaller(operator).contracts.deleteSafely({ id: 1, reason: "اختبار" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
