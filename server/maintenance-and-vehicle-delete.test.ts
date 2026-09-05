import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createMaintenance: vi.fn(async (input: unknown) => ({ id: 71, input })),
  deleteVehicle: vi.fn(async (id: number) => ({ success: true, id })),
}));

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return { ...actual, createMaintenance: mocks.createMaintenance, deleteVehicle: mocks.deleteVehicle };
});

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const adminContext = { user: { id: 1, openId: "admin", name: "مدير", email: null, loginMethod: "local", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "http", headers: {} }, res: {} } as TrpcContext;
const operationalContext = { ...adminContext, user: { ...adminContext.user!, id: 2, openId: "operator", name: "مستخدم تشغيلي", role: "user" as const } } as TrpcContext;

describe("maintenance and safe vehicle deletion", () => {
  it("records an oil change with the vehicle, mileage, cost, date and notes for an operational user", async () => {
    await expect(appRouter.createCaller(operationalContext).maintenance.create({ vehicleId: 14, serviceType: "oil_change", issueType: "تغيير زيت وفلتر", mileage: 88_500, startDate: "2026-08-28", cost: "285.50", notes: "ورشة معتمدة" })).resolves.toBeDefined();
    expect(mocks.createMaintenance).toHaveBeenCalledWith({ vehicleId: 14, serviceType: "oil_change", issueType: "تغيير زيت وفلتر", mileage: 88_500, startDate: "2026-08-28", cost: "285.50", notes: "ورشة معتمدة" });
  });

  it("allows only the administrator to request a vehicle deletion", async () => {
    await expect(appRouter.createCaller(adminContext).vehicles.delete({ id: 99 })).resolves.toEqual({ success: true, id: 99 });
    expect(mocks.deleteVehicle).toHaveBeenCalledWith(99, 1);
    await expect(appRouter.createCaller(operationalContext).vehicles.delete({ id: 99 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
