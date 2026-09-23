import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { Bell, Eye, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  filterDismissedNotifications,
  notificationKey,
  type NotificationItem,
} from "@shared/notificationState";

const storageKey = "tajeerk-dismissed-alerts";
type AlertItem = NotificationItem & {
  type:
    | "overdue"
    | "maintenance"
    | "document"
    | "monthly_expiry"
    | "vehicle_note";
  severity: "warning" | "danger";
};

export default function NotificationCenter() {
  const { data: alerts = [] } = trpc.alerts.useQuery();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [viewedKey, setViewedKey] = useState<string | null>(null);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
      if (Array.isArray(saved))
        setDismissed(
          saved.filter((item): item is string => typeof item === "string")
        );
    } catch {
      /* تجاهل بيانات المتصفح غير الصالحة */
    }
  }, []);
  const visibleAlerts = useMemo(
    () => filterDismissedNotifications(alerts as AlertItem[], dismissed),
    [alerts, dismissed]
  );
  const dismiss = (alert: AlertItem) => {
    const key = notificationKey(alert);
    const next = Array.from(new Set([...dismissed, key]));
    setDismissed(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
    if (viewedKey === key) setViewedKey(null);
  };
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        className="relative flex min-h-11 min-w-11 items-center justify-center rounded-xl p-2.5 text-slate-500 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-[#16b4a5] focus-visible:ring-offset-2"
        aria-label={`الإشعارات${visibleAlerts.length ? `: ${visibleAlerts.length} جديدة` : ""}`}
        aria-expanded={open}
      >
        <Bell aria-hidden="true" className="h-5 w-5" />
        {visibleAlerts.length ? (
          <span
            aria-hidden="true"
            className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[#e8aa2a] ring-2 ring-white"
          />
        ) : null}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="مركز الإشعارات"
          className="absolute left-0 top-14 z-[70] w-[min(92vw,420px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="font-black text-slate-800">الإشعارات</p>
              <p className="text-xs text-slate-400">
                كل إشعار مستقل ويمكن حذفه بعد الاطلاع.
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              onClick={() => setOpen(false)}
              aria-label="إغلاق الإشعارات"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {visibleAlerts.length ? (
              visibleAlerts.map(alert => {
                const key = notificationKey(alert);
                const viewed = viewedKey === key;
                return (
                  <article
                    key={key}
                    className={cn(
                      "mb-2 rounded-xl border p-3 last:mb-0",
                      alert.severity === "danger"
                        ? "border-red-100 bg-red-50/60"
                        : "border-amber-100 bg-amber-50/60"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800">
                          {alert.title}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-600">
                          {alert.description}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "mt-1 h-2.5 w-2.5 shrink-0 rounded-full",
                          alert.severity === "danger"
                            ? "bg-red-500"
                            : "bg-amber-500"
                        )}
                      />
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setViewedKey(key)}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-bold text-[#0c8f87] shadow-sm hover:bg-slate-50"
                      >
                        <Eye className="h-3.5 w-3.5" /> اطلاع
                      </button>
                      <button
                        type="button"
                        disabled={!viewed}
                        onClick={() => dismiss(alert)}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-bold text-red-600 shadow-sm hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> حذف
                      </button>
                    </div>
                    {viewed && (
                      <p className="mt-2 rounded-lg bg-white/80 px-2.5 py-2 text-xs text-slate-500">
                        تم الاطلاع على الإشعار. يمكنك حذفه من قائمة الإشعارات
                        دون التأثير على بياناته الأصلية.
                      </p>
                    )}
                  </article>
                );
              })
            ) : (
              <p className="px-4 py-9 text-center text-sm text-slate-400">
                لا توجد إشعارات جديدة.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
