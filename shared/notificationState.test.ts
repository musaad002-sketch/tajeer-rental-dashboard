import { describe, expect, it } from "vitest";
import { filterDismissedNotifications, notificationKey } from "./notificationState";

describe("notificationState", () => {
  const alerts = [
    { type: "overdue", severity: "danger", title: "العقد 1001 متأخر", description: "تاريخ التسليم المتوقع 2026-08-20" },
    { type: "document", severity: "warning", title: "وثيقة الفحص للسيارة GXR 8924", description: "تنتهي قريباً" },
  ];

  it("يحذف الإشعار المختار من العرض فقط دون تغيير بقية الإشعارات", () => {
    expect(filterDismissedNotifications(alerts, [notificationKey(alerts[0])])).toEqual([alerts[1]]);
  });
});
