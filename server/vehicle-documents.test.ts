import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createVehicle: vi.fn(async (input: unknown) => ({ id: 41, input })),
  updateVehicle: vi.fn(async (id: number, input: unknown) => ({ id, input })),
  createContract: vi.fn(async (input: unknown) => ({ id: 52, input })),
  recordContractOperation: vi.fn(async (input: unknown) => ({ input })),
}));

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return { ...actual, createVehicle: mocks.createVehicle, updateVehicle: mocks.updateVehicle, createContract: mocks.createContract, recordContractOperation: mocks.recordContractOperation };
});

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const context = { user: { id: 7, openId: "local_admin", name: "مدير النظام", email: null, loginMethod: "local", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "http", headers: {} }, res: {} } as TrpcContext;
const operationalContext = { ...context, user: { ...context.user!, id: 8, openId: "operational_user", name: "مستخدم تشغيلي", role: "user" as const } } as TrpcContext;

describe("vehicle documents and mileage", () => {
  it("passes document expiry dates and oil readings when creating a vehicle", async () => {
    await appRouter.createCaller(context).vehicles.create({ plateNumber: "ABC 123", make: "تويوتا", model: "كامري", modelYear: 2024, dailyRate: "150", monthlyRate: "3500", mileage: 80000, lastOilChangeMileage: 76000, lastOilChangeDate: "2026-08-01", oilChangeInterval: 7000, insuranceExpiryDate: "2027-01-01", inspectionExpiryDate: "2027-02-01", registrationExpiryDate: "2027-03-01" });
    expect(mocks.createVehicle).toHaveBeenCalledWith(expect.objectContaining({ mileage: 80000, lastOilChangeMileage: 76000, lastOilChangeDate: "2026-08-01", oilChangeInterval: 7000, insuranceExpiryDate: "2027-01-01", inspectionExpiryDate: "2027-02-01", registrationExpiryDate: "2027-03-01" }));
  });

  it("passes a new mileage reading through contract and operation routes", async () => {
    await appRouter.createCaller(context).contracts.create({ customerId: 2, vehicleId: 41, vehicleMileage: 81000, type: "daily", startDate: "2026-08-28", expectedReturnDate: "2026-08-30", rentalAmount: "150", days: 2, totalAmount: "300", paidAmount: "0" });
    await appRouter.createCaller(context).operations.record({ contractNumber: "1013", operation: "payment", amount: "100", paymentMethod: "cash", vehicleMileage: 81200 });
    expect(mocks.createContract).toHaveBeenCalledWith(expect.objectContaining({ vehicleMileage: 81000 }));
    expect(mocks.recordContractOperation).toHaveBeenCalledWith(expect.objectContaining({ vehicleMileage: 81200, createdBy: 7 }));
  });

  it("accepts updating mileage, oil data, and document dates", async () => {
    await appRouter.createCaller(context).vehicles.update({ id: 41, mileage: 82000, lastOilChangeMileage: 82000, lastOilChangeDate: "2026-08-28", insuranceExpiryDate: "2027-01-01", inspectionExpiryDate: "2027-02-01", registrationExpiryDate: "2027-03-01" });
    expect(mocks.updateVehicle).toHaveBeenCalledWith(41, expect.objectContaining({ mileage: 82000, lastOilChangeMileage: 82000, registrationExpiryDate: "2027-03-01" }));
  });

  it("يرفض المشغّل تعديل بيانات السيارة مع إبقاء إنشاء سيارة جديدة متاحاً", async () => {
    const callsBefore = mocks.updateVehicle.mock.calls.length;
    await expect(appRouter.createCaller(operationalContext).vehicles.update({ id: 41, mileage: 82_100 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.updateVehicle.mock.calls.length).toBe(callsBefore);
    await expect(appRouter.createCaller(operationalContext).vehicles.create({ plateNumber: "OPS 1", make: "كيا", model: "K5", modelYear: 2024, dailyRate: "120", monthlyRate: "3000" })).resolves.toBeDefined();
  });
});
