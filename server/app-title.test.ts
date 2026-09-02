import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("app title configuration", () => {
  it("keeps the configured title and serves the app endpoint", async () => {
    const indexHtml = readFileSync(resolve(process.cwd(), "client/index.html"), "utf8");
    expect(indexHtml).toContain('content="مكتب مشاري لتأجير السيارات"');

    const response = await fetch("http://127.0.0.1:3000/");
    expect(response.ok).toBe(true);
    expect(response.headers.get("content-type")).toMatch(/text\/html/i);
  });
});
