import { sql } from "drizzle-orm";
import { afterEach, describe, expect, inject, it, vi } from "vitest";

// The production build loads every module with no database settings: src/db must not need them until the first query
async function loadDbModule() {
  vi.resetModules();
  return import("@/db");
}

describe("Database connection", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("loads without DATABASE_URL and reports it only at the first query", async () => {
    vi.stubEnv("DATABASE_URL", undefined);
    const { db } = await loadDbModule();

    await expect(async () => db.execute(sql`select 1`)).rejects.toThrow("DATABASE_URL is not set");
  });

  it("reads DATABASE_URL at the first query, not when the module loads", async () => {
    vi.stubEnv("DATABASE_URL", undefined);
    const { db } = await loadDbModule();

    vi.stubEnv("DATABASE_URL", inject("testDatabaseUrl"));
    const rows = await db.execute<{ answer: number }>(sql`select 1 as answer`);

    expect(rows[0]?.answer).toBe(1);
  });
});
