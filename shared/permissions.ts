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
  "contracts.view", "contracts.create", "contracts.edit", "contracts.delete", "contracts.operate", "contracts.extend", "contracts.swap", "contracts.suspend", "contracts.close", "contracts.return", "contracts.print",
  "payments.view", "payments.create", "payments.edit", "payments.delete", "payments.print",
  "returns.view", "returns.create", "returns.edit", "returns.delete", "returns.print",
  "vehicles.view", "vehicles.create", "vehicles.edit", "vehicles.maintenance", "vehicles.documents", "vehicles.delete", "vehicles.print",
  "customers.view", "customers.create", "customers.edit", "customers.delete", "customers.print",
  "operations.view", "operations.create", "operations.edit", "operations.delete", "operations.print",
  "accounting.view", "accounting.create", "accounting.edit", "accounting.delete", "accounting.approve", "accounting.pay", "accounting.print",
  "reports.view", "reports.export", "reports.print",
  "maintenance.view", "maintenance.create", "maintenance.update", "maintenance.delete", "maintenance.approve", "maintenance.print",
  "user_management.view", "user_management.create", "user_management.edit", "user_management.delete", "user_management.reset_password",
  "site_content.view", "site_content.edit",
  "blocked_customers.view", "blocked_customers.create", "blocked_customers.edit", "blocked_customers.delete",
  "notifications.view", "notifications.delete",
] as const;
export type GranularPermissionKey = (typeof granularPermissionKeys)[number];
export const allPermissionKeys = granularPermissionKeys;

export const granularPermissionLabels: Record<GranularPermissionKey, string> = {
  "dashboard.view": "الرئيسية: عرض", "dashboard.insights": "عين المكتب: عرض",
  "contracts.view": "العقود: عرض", "contracts.create": "العقود: إنشاء", "contracts.edit": "العقود: تعديل رجعي", "contracts.delete": "العقود: حذف", "contracts.operate": "العقود: تشغيل عام", "contracts.extend": "العقود: تمديد", "contracts.swap": "العقود: تبديل سيارة", "contracts.suspend": "العقود: تعليق", "contracts.close": "العقود: إغلاق", "contracts.return": "العقود: استرجاع", "contracts.print": "العقود: طباعة",
  "payments.view": "الدفعات: عرض", "payments.create": "الدفعات: تسجيل", "payments.edit": "الدفعات: تعديل رجعي", "payments.delete": "الدفعات: حذف", "payments.print": "الدفعات: طباعة",
  "returns.view": "الاسترجاعات: عرض", "returns.create": "الاسترجاعات: تسجيل", "returns.edit": "الاسترجاعات: تعديل", "returns.delete": "الاسترجاعات: حذف", "returns.print": "الاسترجاعات: طباعة",
  "vehicles.view": "السيارات: عرض", "vehicles.create": "السيارات: إنشاء", "vehicles.edit": "السيارات: تعديل بيانات عامة", "vehicles.maintenance": "السيارات: تحديث الزيت والعداد والصيانة", "vehicles.documents": "السيارات: وثائق وتأمين وفحص واستمارة", "vehicles.delete": "السيارات: حذف", "vehicles.print": "السيارات: طباعة",
  "customers.view": "العملاء: عرض", "customers.create": "العملاء: إنشاء", "customers.edit": "العملاء: تعديل", "customers.delete": "العملاء: حذف", "customers.print": "العملاء: طباعة",
  "operations.view": "سجل العمليات: عرض", "operations.create": "سجل العمليات: تسجيل", "operations.edit": "سجل العمليات: تعديل", "operations.delete": "سجل العمليات: حذف", "operations.print": "سجل العمليات: طباعة",
  "accounting.view": "الحسابات: عرض", "accounting.create": "الحسابات: تسجيل مصروف", "accounting.edit": "الحسابات: تعديل", "accounting.delete": "الحسابات: حذف", "accounting.approve": "الحسابات: اعتماد", "accounting.pay": "الحسابات: سداد مصروف", "accounting.print": "الحسابات: طباعة",
  "reports.view": "التقارير: عرض", "reports.export": "التقارير: تصدير", "reports.print": "التقارير: طباعة",
  "maintenance.view": "الصيانة: عرض", "maintenance.create": "الصيانة: تسجيل", "maintenance.update": "الصيانة: تحديث وإغلاق", "maintenance.delete": "الصيانة: حذف", "maintenance.approve": "الصيانة: اعتماد", "maintenance.print": "الصيانة: طباعة",
  "user_management.view": "المستخدمون: عرض", "user_management.create": "المستخدمون: إنشاء", "user_management.edit": "المستخدمون: تعديل", "user_management.delete": "المستخدمون: حذف", "user_management.reset_password": "المستخدمون: رابط استعادة كلمة المرور",
  "site_content.view": "محتوى الواجهة: عرض", "site_content.edit": "محتوى الواجهة: تعديل واستعادة",
  "blocked_customers.view": "العملاء المحظورون: عرض", "blocked_customers.create": "العملاء المحظورون: إضافة", "blocked_customers.edit": "العملاء المحظورون: تعديل", "blocked_customers.delete": "العملاء المحظورون: حذف",
  "notifications.view": "الإشعارات: عرض", "notifications.delete": "الإشعارات: حذف",
};

export const defaultPermissions: PermissionKey[] = ["dashboard", "contracts", "operations", "accounting", "maintenance"];
export const defaultGranularPermissions: GranularPermissionKey[] = [
  "dashboard.view", "contracts.view", "contracts.create", "contracts.operate", "contracts.extend", "contracts.swap", "contracts.suspend", "contracts.close", "contracts.return",
  "payments.view", "payments.create", "operations.view", "operations.create", "operations.print",
  "vehicles.view", "vehicles.maintenance", "customers.view", "customers.create",
  "accounting.view", "accounting.create", "maintenance.view", "maintenance.create", "maintenance.update", "notifications.view",
];

const legacyToGranular: Record<PermissionKey, readonly GranularPermissionKey[]> = {
  dashboard: ["dashboard.view"],
  contracts: ["contracts.view", "contracts.create", "contracts.operate", "contracts.extend", "contracts.swap", "contracts.suspend", "contracts.close", "contracts.return"],
  operations: ["operations.view", "operations.create", "contracts.operate", "payments.view", "payments.create"],
  vehicles: ["vehicles.view", "vehicles.create", "vehicles.maintenance"],
  customers: ["customers.view", "customers.create", "customers.edit"],
  accounting: ["accounting.view", "accounting.create"],
  reports: ["reports.view", "reports.export", "reports.print"],
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
      else if (typeof item === "string" && (permissionKeys as readonly string[]).includes(item)) for (const atomic of legacyToGranular[item as PermissionKey]) result.add(atomic);
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
