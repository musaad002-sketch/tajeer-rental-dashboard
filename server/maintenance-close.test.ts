import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ updateMaintenanceStatus: vi.fn(async (id: number, status: string, vehicleId: number) => ({ id, status, vehicleId })) }));
vi.mock("./db", async () => ({ ...(await vi.importActual<typeof import("./db")>("./db")), updateMaintenanceStatus: mocks.updateMaintenanceStatus }));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const adminContext = { user: { id: 1, openId: "admin", name: "مدير", email: null, loginMethod: "local", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "http", headers: {} }, res: {} } as TrpcContext;
const operatorContext = { ...adminContext, user: { ...adminContext.user!, id: 2, openId: "operator", name: "تشغيل", role: "user" as const } } as TrpcContext;

describe("maintenance close permissions", () => {
  it("يرفض المشغّل تعديل حالة الصيانة", async () => {
    await expect(appRouter.createCaller(operatorContext).maintenance.updateStatus({ id: 21, vehicleId: 14, status: "completed" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.updateMaintenanceStatus).not.toHaveBeenCalled();
  });

  it("يسمح للمدير بإغلاق سجل الصيانة قيد التنفيذ", async () => {
    await expect(appRouter.createCaller(adminContext).maintenance.updateStatus({ id: 21, vehicleId: 14, status: "completed" })).resolves.toEqual({ id: 21, status: "completed", vehicleId: 14 });
    expect(mocks.updateMaintenanceStatus).toHaveBeenCalledWith(21, "completed", 14);
  });
});

