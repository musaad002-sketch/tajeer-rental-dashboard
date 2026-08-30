export const permissionKeys = ["dashboard", "contracts", "operations", "vehicles", "customers", "accounting", "reports", "maintenance", "user_management"] as const;
export type PermissionKey = (typeof permissionKeys)[number];
export const permissionLabels: Record<PermissionKey, string> = { dashboard: "الرئيسية", contracts: "العقود", operations: "تشغيل عقد قائم", vehicles: "السيارات", customers: "العملاء", accounting: "الحسابات والإيرادات", reports: "التقارير", maintenance: "الصيانة والتالف", user_management: "إدارة المستخدمين" };
export const defaultPermissions: PermissionKey[] = ["dashboard", "contracts", "operations", "accounting", "maintenance"];
export function parsePermissions(value: string | null | undefined, role: "user" | "admin") { if (role === "admin") return [...permissionKeys]; if (!value) return [...defaultPermissions]; try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((item): item is PermissionKey => permissionKeys.includes(item)) : [...defaultPermissions]; } catch { return [...defaultPermissions]; } }
export function canAccess(role: "user" | "admin", value: string | null | undefined, permission: PermissionKey) { return parsePermissions(value, role).includes(permission); }

export const operatorContractStatuses = ["active", "overdue", "suspended"] as const;
export type OperatorContractStatus = (typeof operatorContractStatuses)[number];
export function isOperatorVisibleContractStatus(status: string | null | undefined): status is OperatorContractStatus {
  return operatorContractStatuses.includes(status as OperatorContractStatus);
}
