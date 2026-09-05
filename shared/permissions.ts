export const permissionKeys = ["dashboard", "contracts", "operations", "vehicles", "customers", "accounting", "reports", "maintenance", "user_management"] as const;
export type PermissionKey = (typeof permissionKeys)[number];

export const permissionLabels: Record<PermissionKey, string> = {
  dashboard: "الرئيسية",
  contracts: "العقود",
  operations: "تشغيل عقد قائم",
  vehicles: "السيارات",
  customers: "العملاء",
  accounting: "الحسابات والإيرادات",
  reports: "التقارير",
  maintenance: "الصيانة والتالف",
  user_management: "إدارة المستخدمين",
};

export const granularPermissionKeys = [
  "dashboard.view", "dashboard.insights",
  "contracts.view", "contracts.create", "contracts.edit", "contracts.delete", "contracts.operate",
  "payments.view", "payments.create", "payments.edit", "payments.delete",
  "returns.view",
  "vehicles.view", "vehicles.create", "vehicles.maintenance", "vehicles.delete",
  "customers.view", "customers.create", "customers.edit", "customers.delete",
  "operations.view", "operations.create", "operations.edit", "operations.delete",
  "accounting.view", "accounting.create", "accounting.edit", "accounting.delete", "accounting.approve", "accounting.pay",
  "reports.view", "reports.export",
  "maintenance.view", "maintenance.create", "maintenance.update", "maintenance.delete",
  "user_management.view", "user_management.create", "user_management.edit", "user_management.delete", "user_management.reset_password",
  "site_content.view", "site_content.edit",
  "blocked_customers.view",
] as const;
export type GranularPermissionKey = (typeof granularPermissionKeys)[number];
export const allPermissionKeys = granularPermissionKeys;

export const granularPermissionLabels: Record<GranularPermissionKey, string> = {
  "dashboard.view": "الرئيسية: عرض",
  "dashboard.insights": "عين المكتب: عرض",
  "contracts.view": "العقود: عرض",
  "contracts.create": "العقود: إنشاء",
  "contracts.edit": "العقود: تعديل رجعي",
  "contracts.delete": "العقود: حذف",
  "contracts.operate": "العقود: تشغيل وتمديد وتعليق واسترجاع",
  "payments.view": "الدفعات: عرض",
  "payments.create": "الدفعات: تسجيل",
  "payments.edit": "الدفعات: تعديل رجعي",
  "payments.delete": "الدفعات: حذف",
  "returns.view": "الاسترجاعات: عرض",
  "vehicles.view": "السيارات: عرض",
  "vehicles.create": "السيارات: إنشاء",
  "vehicles.maintenance": "السيارات: تحديث الزيت والعداد والصيانة",
  "vehicles.delete": "السيارات: حذف",
  "customers.view": "العملاء: عرض",
  "customers.create": "العملاء: إنشاء",
  "customers.edit": "العملاء: تعديل",
  "customers.delete": "العملاء: حذف",
  "operations.view": "سجل العمليات: عرض",
  "operations.create": "سجل العمليات: تسجيل",
  "operations.edit": "سجل العمليات: تعديل",
  "operations.delete": "سجل العمليات: حذف",
  "accounting.view": "الحسابات: عرض",
  "accounting.create": "الحسابات: تسجيل مصروف",
  "accounting.edit": "الحسابات: تعديل",
  "accounting.delete": "الحسابات: حذف",
  "accounting.approve": "الحسابات: اعتماد",
  "accounting.pay": "الحسابات: سداد مصروف",
  "reports.view": "التقارير: عرض",
  "reports.export": "التقارير: تصدير وطباعة",
  "maintenance.view": "الصيانة: عرض",
  "maintenance.create": "الصيانة: تسجيل",
  "maintenance.update": "الصيانة: تحديث وإغلاق",
  "maintenance.delete": "الصيانة: حذف",
  "user_management.view": "المستخدمون: عرض",
  "user_management.create": "المستخدمون: إنشاء",
  "user_management.edit": "المستخدمون: تعديل",
  "user_management.delete": "المستخدمون: حذف",
  "user_management.reset_password": "المستخدمون: رابط استعادة كلمة المرور",
  "site_content.view": "محتوى الواجهة: عرض",
  "site_content.edit": "محتوى الواجهة: تعديل واستعادة",
  "blocked_customers.view": "العملاء المحظورون: عرض",
};

export const defaultPermissions: PermissionKey[] = ["dashboard", "contracts", "operations", "accounting", "maintenance"];
export const defaultGranularPermissions: GranularPermissionKey[] = [
  "dashboard.view", "contracts.view", "contracts.create", "contracts.operate",
  "payments.view", "payments.create", "operations.view", "operations.create",
  "vehicles.view", "vehicles.maintenance", "customers.view", "customers.create",
  "accounting.view", "accounting.create", "maintenance.view", "maintenance.create",
];

const legacyToGranular: Record<PermissionKey, readonly GranularPermissionKey[]> = {
  dashboard: ["dashboard.view"],
  contracts: ["contracts.view", "contracts.create", "contracts.operate"],
  operations: ["operations.view", "operations.create", "contracts.operate", "payments.view", "payments.create"],
  vehicles: ["vehicles.view", "vehicles.create", "vehicles.maintenance"],
  customers: ["customers.view", "customers.create", "customers.edit"],
  accounting: ["accounting.view", "accounting.create"],
  reports: ["reports.view", "reports.export"],
  maintenance: ["maintenance.view", "maintenance.create", "maintenance.update"],
  user_management: ["user_management.view", "user_management.create", "user_management.edit", "user_management.delete", "user_management.reset_password"],
};

export function parsePermissions(value: string | null | undefined, role: "user" | "admin") {
  if (role === "admin") return [...permissionKeys];
  if (!value) return [...defaultPermissions];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is PermissionKey => permissionKeys.includes(item)) : [...defaultPermissions];
  } catch {
    return [...defaultPermissions];
  }
}

export function canAccess(role: "user" | "admin", value: string | null | undefined, permission: PermissionKey) {
  return parsePermissions(value, role).includes(permission);
}

export function parseGranularPermissions(value: string | null | undefined, role: "user" | "admin"): GranularPermissionKey[] {
  if (role === "admin") return [...granularPermissionKeys];
  if (!value) return [...defaultGranularPermissions];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [...defaultGranularPermissions];
    const result = new Set<GranularPermissionKey>();
    for (const item of parsed) {
      if (typeof item === "string" && (granularPermissionKeys as readonly string[]).includes(item)) result.add(item as GranularPermissionKey);
      else if (typeof item === "string" && (permissionKeys as readonly string[]).includes(item)) {
        for (const atomic of legacyToGranular[item as PermissionKey]) result.add(atomic);
      }
    }
    return Array.from(result);
  } catch {
    return [...defaultGranularPermissions];
  }
}

export function canPerform(role: "user" | "admin", value: string | null | undefined, permission: GranularPermissionKey) {
  return parseGranularPermissions(value, role).includes(permission);
}

export const operatorContractStatuses = ["active", "overdue", "suspended"] as const;
export type OperatorContractStatus = (typeof operatorContractStatuses)[number];
export function isOperatorVisibleContractStatus(status: string | null | undefined): status is OperatorContractStatus {
  return operatorContractStatuses.includes(status as OperatorContractStatus);
}
