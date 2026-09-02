import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateManagedUser: vi.fn(async (input: unknown) => ({ id: 77, input })),
  deleteManagedUser: vi.fn(async (id: number) => ({ success: true, id })),
}));

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return { ...actual, ...mocks };
});

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const admin = { user: { id: 44, openId: "admin", name: "مدير", email: null, loginMethod: "local", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "http", headers: {} }, res: {} } as TrpcContext;
const operator = { ...admin, user: { ...admin.user!, id: 45, role: "user" as const } } as TrpcContext;

describe("managed user administration", () => {
  it("يسمح للمدير بتعديل اسم المستخدم وكلمة المرور", async () => {
    await appRouter.createCaller(admin).users.update({ id: 77, username: "new_operator", password: "secret123" });
    expect(mocks.updateManagedUser).toHaveBeenCalledWith({ id: 77, username: "new_operator", password: "secret123" });
  });

  it("يرفض المشغّل من مسارات إدارة المستخدمين", async () => {
    await expect(appRouter.createCaller(operator).users.update({ id: 77, username: "blocked" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(operator).users.delete({ id: 77 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("يحمي المدير من حذف حساب الجلسة الحالية", async () => {
    await expect(appRouter.createCaller(admin).users.delete({ id: 44 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.deleteManagedUser).not.toHaveBeenCalled();
  });
});

export { mocks };

void describe;
void expect;
void it;
