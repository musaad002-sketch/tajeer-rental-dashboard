export const permissionKeys = ["dashboard", "contracts", "operations", "vehicles", "customers", "accounting", "reports", "maintenance", "user_management"] as const;
export type PermissionKey = (typeof permissionKeys)[number];
export const permissionLabels: Record<PermissionKey, string> = { dashboard: "الرئيسية", contracts: "العقود", operations: "تشغيل عقد قائم", vehicles: "السيارات", customers: "العملاء", accounting: "الحسابات والإيرادات", reports: "التقارير", maintenance: "الصيانة والتالف", user_management: "إدارة المستخدمين" };
export const defaultPermissions: PermissionKey[] = ["dashboard", "contracts", "operations", "vehicles", "customers", "accounting", "reports", "maintenance"];
export function parsePermissions(value: string | null | undefined, role: "user" | "admin") { if (role === "admin") return [...permissionKeys]; try { const parsed = JSON.parse(value ?? "[]"); return Array.isArray(parsed) ? parsed.filter((item): item is PermissionKey => permissionKeys.includes(item)) : []; } catch { return []; } }
export function canAccess(role: "user" | "admin", value: string | null | undefined, permission: PermissionKey) { return parsePermissions(value, role).includes(permission); }
