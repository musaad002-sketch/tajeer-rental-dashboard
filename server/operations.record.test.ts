import { describe, expect, it, vi } from "vitest";

const { recordMock, createMock } = vi.hoisted(() => ({ recordMock: vi.fn(async () => undefined), createMock: vi.fn(async (input) => ({ id: 501, contractNumber: "1012", ...input })) }));

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return { ...actual, recordContractOperation: recordMock, createContract: createMock };
});

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const context = {
  user: { id: 7, openId: "local_admin", name: "مدير النظام", email: null, loginMethod: "local", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
  req: { protocol: "http", headers: {} },
  res: {},
} as TrpcContext;

describe("operations.record", () => {
  it("passes a valid payment operation to the persistence service", async () => {
    recordMock.mockClear();
    const caller = appRouter.createCaller(context);
    await caller.operations.record({ contractNumber: "  1011 ", operation: "payment", amount: "250", paymentMethod: "cash", details: "دفعة نقدية" });
    expect(recordMock).toHaveBeenCalledWith({ contractNumber: "1011", operation: "payment", amount: "250", paymentMethod: "cash", details: "دفعة نقدية", createdBy: 7 });
  });

  it("keeps contract creation separate from payment and lifecycle operations", async () => {
    recordMock.mockClear();
    createMock.mockClear();
    const caller = appRouter.createCaller(context);
    await caller.contracts.create({ customerId: 1, vehicleId: 1, type: "daily", startDate: "2026-08-28", expectedReturnDate: "2026-08-30", rentalAmount: "180", days: 2, totalAmount: "360", notes: "تسليم المفتاح عند الإرجاع" });
    expect(createMock).toHaveBeenCalledOnce();
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ notes: "تسليم المفتاح عند الإرجاع", createdBy: 7 }));
    expect(recordMock).not.toHaveBeenCalled();
    await caller.operations.record({ contractNumber: "1012", operation: "payment", amount: "100" });
    expect(recordMock).toHaveBeenCalledWith({ contractNumber: "1012", operation: "payment", amount: "100", createdBy: 7 });
  });

  it("keeps extension and return as separate operations while resolving the visible number", async () => {
    recordMock.mockClear();
    const caller = appRouter.createCaller(context);
    await caller.operations.record({ contractNumber: "1011", operation: "extension", extensionDays: 2, details: "تمديد يومين" });
    await caller.operations.record({ contractNumber: "1011", operation: "return", details: "استلام السيارة" });
    expect(recordMock).toHaveBeenNthCalledWith(1, { contractNumber: "1011", operation: "extension", extensionDays: 2, details: "تمديد يومين", createdBy: 7 });
    expect(recordMock).toHaveBeenNthCalledWith(2, { contractNumber: "1011", operation: "return", details: "استلام السيارة", createdBy: 7 });
  });

  it("uses the missing-contract prompt only when neither identifier is supplied", async () => {
    recordMock.mockClear();
    const caller = appRouter.createCaller(context);
    await expect(caller.operations.record({ operation: "payment" })).rejects.toThrow("أدخل رقم العقد أولاً");
    expect(recordMock).not.toHaveBeenCalled();
  });
});


  it("rejects invalid lifecycle inputs before persistence", async () => {
    recordMock.mockClear();
    const caller = appRouter.createCaller(context);
    await expect(caller.operations.record({ contractNumber: "1011", operation: "extension" })).rejects.toThrow("أدخل عدد أيام التمديد");
    await expect(caller.operations.record({ contractNumber: "1011", operation: "vehicle_swap" })).rejects.toThrow("اختر سيارة بديلة");
    await expect(caller.operations.record({ contractNumber: "   ", operation: "close" })).rejects.toThrow("أدخل رقم العقد أولاً");
    expect(recordMock).not.toHaveBeenCalled();
  });


  it("rejects close and return without a contract reference", async () => {
    recordMock.mockClear();
    const caller = appRouter.createCaller(context);
    await expect(caller.operations.record({ operation: "close" })).rejects.toThrow("أدخل رقم العقد أولاً");
    await expect(caller.operations.record({ operation: "return" })).rejects.toThrow("أدخل رقم العقد أولاً");
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("passes an invalid visible number to persistence for the database to reject", async () => {
    recordMock.mockReset();
    recordMock.mockRejectedValueOnce(new Error("العقد غير موجود في قاعدة البيانات"));
    const caller = appRouter.createCaller(context);
    await expect(caller.operations.record({ contractNumber: "__NOT_REGISTERED__", operation: "return" })).rejects.toThrow("العقد غير موجود في قاعدة البيانات");
  });


it("passes fee and rate update operations with their financial amount", async () => {
  recordMock.mockClear();
  const caller = appRouter.createCaller(context);
  await caller.operations.record({ contractNumber: "1011", operation: "additional_fee", amount: "75", details: "تنظيف إضافي" });
  await caller.operations.record({ contractNumber: "1011", operation: "rate_update", amount: "220", details: "سعر موسمي" });
  expect(recordMock).toHaveBeenNthCalledWith(1, { contractNumber: "1011", operation: "additional_fee", amount: "75", details: "تنظيف إضافي", createdBy: 7 });
  expect(recordMock).toHaveBeenNthCalledWith(2, { contractNumber: "1011", operation: "rate_update", amount: "220", details: "سعر موسمي", createdBy: 7 });
});


it("passes transfer payments with reason details and the new mileage reading", async () => {
  recordMock.mockClear();
  const caller = appRouter.createCaller(context);
  await caller.operations.record({ contractNumber: "1011", operation: "payment", amount: "175", paymentMethod: "transfer", vehicleMileage: 90500, details: "كيلوات إضافية؛ العداد الجديد: 90500" });
  expect(recordMock).toHaveBeenCalledWith({ contractNumber: "1011", operation: "payment", amount: "175", paymentMethod: "transfer", vehicleMileage: 90500, details: "كيلوات إضافية؛ العداد الجديد: 90500", createdBy: 7 });
});

it("passes international authorization fee as an additional amount", async () => {
  recordMock.mockClear();
  const caller = appRouter.createCaller(context);
  await caller.operations.record({ contractNumber: "1011", operation: "additional_fee", amount: "50", details: "مبلغ إضافي؛ رسوم تفويض دولي" });
  expect(recordMock).toHaveBeenCalledWith({ contractNumber: "1011", operation: "additional_fee", amount: "50", details: "مبلغ إضافي؛ رسوم تفويض دولي", createdBy: 7 });
});

it("passes mixed cash and network payment amounts as one operation", async () => {
  recordMock.mockClear();
  const caller = appRouter.createCaller(context);
  await caller.operations.record({ contractNumber: "1011", operation: "payment", amount: "300", paymentMethod: "mixed", paymentCashAmount: "150", paymentNetworkAmount: "150", details: "دفعة مختلطة" });
  expect(recordMock).toHaveBeenCalledWith({ contractNumber: "1011", operation: "payment", amount: "300", paymentMethod: "mixed", paymentCashAmount: "150", paymentNetworkAmount: "150", details: "دفعة مختلطة", createdBy: 7 });
});

it("passes contract scope when creating a contract", async () => {
  createMock.mockClear();
  const caller = appRouter.createCaller(context);
  await caller.contracts.create({ customerId: 1, vehicleId: 1, type: "monthly", contractScope: "international", startDate: "2026-08-29", expectedReturnDate: "2026-09-28", rentalAmount: "3000", days: 30, totalAmount: "3000" });
  expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ contractScope: "international", createdBy: 7 }));
});
