export type NotificationItem = { type: string; title: string; description: string; severity: string };

export function notificationKey(alert: NotificationItem) {
  return `${alert.type}:${alert.severity}:${alert.title}:${alert.description}`;
}

export function filterDismissedNotifications<T extends NotificationItem>(alerts: T[], dismissed: string[]) {
  const dismissedSet = new Set(dismissed);
  return alerts.filter((alert) => !dismissedSet.has(notificationKey(alert)));
}
