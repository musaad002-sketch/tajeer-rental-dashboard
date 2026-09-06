import fs from "node:fs";
const path = process.argv[2];
for (const line of fs.readFileSync(path, "utf8").split("\n")) {
  if (!line.includes("liabilities.list") && !line.includes("maintenance.list")) continue;
  try {
    const row = JSON.parse(line.slice(line.indexOf("{")));
    const url = row.url ?? "";
    if (!url.includes("liabilities.list") && !url.includes("maintenance.list")) continue;
    const response = row.response ?? {};
    console.log(JSON.stringify({ url: url.split("?")[0], status: response.status, body: response.body, error: row.error }));
  } catch {
    // Ignore non-JSON or wrapped log lines.
  }
}
