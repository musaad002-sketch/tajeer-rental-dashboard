export type CsvColumn = { key: string; header: string };

function escapeCsvValue(value: unknown) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(
  rows: Record<string, unknown>[],
  columns?: CsvColumn[]
): string {
  if (!rows.length) return "";
  const cols = columns ?? Object.keys(rows[0]).map(key => ({ key, header: key }));
  const header = cols.map(column => escapeCsvValue(column.header)).join(",");
  const body = rows.map(row =>
    cols.map(column => escapeCsvValue(row[column.key])).join(",")
  );
  return [header, ...body].join("\r\n");
}