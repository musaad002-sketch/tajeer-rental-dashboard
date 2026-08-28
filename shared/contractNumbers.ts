export function nextContractNumber(values: Array<string | number | null | undefined>) {
  const numericValues = values.map((value) => Number(String(value ?? "").trim())).filter((value) => Number.isInteger(value) && value > 0);
  return String(Math.max(1000, ...numericValues) + 1);
}
