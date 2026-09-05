const dateOnlyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

function normalizeDate(value: Date | string | number): Date {
  if (typeof value === "string") {
    const match = dateOnlyPattern.exec(value.slice(0, 10));
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  return value instanceof Date ? value : new Date(value);
}

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  calendar: "gregory",
  numberingSystem: "latn",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  calendar: "gregory",
  numberingSystem: "latn",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatGregorianDate(value: Date | string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  const date = normalizeDate(value);
  return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
}

export function formatGregorianDateTime(value: Date | string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  const date = normalizeDate(value);
  return Number.isNaN(date.getTime()) ? "—" : dateTimeFormatter.format(date);
}
