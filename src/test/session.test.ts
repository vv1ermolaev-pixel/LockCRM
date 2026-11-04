import { sql } from "drizzle-orm";
import { describe, expect, inject, it } from "vitest";

import { signOut } from "@/app/login/actions";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { listGroups } from "@/lib/groups";
import { getCurrentUser } from "@/lib/session";

import { applyPendingMigrations, resetTestDatabaseUpTo } from "./database";
import { signInAs } from "./sign-in";
import { switchBrowser } from "./stubs/next-headers";

async function currentEmail() {
  return (await getCurrentUser())?.email;
}

const DAY = 24 * 60 * 60 * 1000;

describe("Login lasts 30 days", () => {
  it("sets the session to end 30 days after the login", async () => {
    await signInAs("anna@example.com");

    const [{ expiresAt }] = await db.select({ expiresAt: sessions.expiresAt }).from(sessions);

    const daysLeft = (expiresAt.getTime() - Date.now()) / DAY;
    expect(daysLeft).toBeGreaterThan(29.99);
    expect(daysLeft).toBeLessThanOrEqual(30);
  });

  it("keeps the person in after 7 days", async () => {
    await signInAs("anna@example.com");
    await db.update(sessions).set({ createdAt: sql`created_at - interval '7 days'` });

    expect(await currentEmail()).toBe("anna@example.com");
  });

  it("does not let in a session that ended 31 days after the last visit", async () => {
    await signInAs("anna@example.com");
    await db.update(sessions).set({ expiresAt: sql`now() - interval '1 day'` });

    expect(await currentEmail()).toBeUndefined();
  });

  it("extends the session when the person comes back after more than a day", async () => {
    await signInAs("anna@example.com");
    await db
      .update(sessions)
      .set({ expiresAt: sql`now() + interval '20 days'`, updatedAt: sql`now() - interval '10 days'` });

    expect(await currentEmail()).toBe("anna@example.com");

    const [{ expiresAt }] = await db.select({ expiresAt: sessions.expiresAt }).from(sessions);
    expect((expiresAt.getTime() - Date.now()) / DAY).toBeGreaterThan(29.9);
  });
});

describe("Two devices", () => {
  it("keeps both in after the person logs in on the second", async () => {
    await signInAs("anna@example.com", { browser: "computer" });
    await signInAs("anna@example.com", { browser: "phone" });

    switchBrowser("computer");
    expect(await currentEmail()).toBe("anna@example.com");
    switchBrowser("phone");
    expect(await currentEmail()).toBe("anna@example.com");
  });

  it("logs out only the device where «Выйти» was pressed", async () => {
    await signInAs("anna@example.com", { browser: "computer" });
    await signInAs("anna@example.com", { browser: "phone" });

    switchBrowser("computer");
    await signOut();

    expect(await currentEmail()).toBeUndefined();
    switchBrowser("phone");
    expect(await currentEmail()).toBe("anna@example.com");
    expect(await db.select().from(sessions)).toHaveLength(1);
  });
});

describe("A new user", () => {
  it("gets «Семья», «Друзья», «Знакомые», «Коллеги» at the first login: pink, green, yellow, blue, empty", async () => {
    await signInAs("boris@example.com");

    const user = (await getCurrentUser())!;

    expect(await listGroups(user.id)).toMatchObject([
      { name: "Семья", color: "pink", contactCount: 0 },
      { name: "Друзья", color: "green", contactCount: 0 },
      { name: "Знакомые", color: "yellow", contactCount: 0 },
      { name: "Коллеги", color: "blue", contactCount: 0 },
    ]);
  });

  it("gets the groups once, not again at the next login", async () => {
    await signInAs("boris@example.com");
    await signInAs("boris@example.com", { browser: "phone" });

    const user = (await getCurrentUser())!;

    expect(await listGroups(user.id)).toHaveLength(4);
  });

  it("does not get new groups for the owner whose data came with the migration", async () => {
    const testUrl = inject("testDatabaseUrl");
    await resetTestDatabaseUpTo(testUrl, "0003_default_groups");
    await db.execute(sql`update groups set name = 'Родня' where name = 'Семья'`);
    await applyPendingMigrations(testUrl, { ownerEmail: "owner@example.com" });

    await signInAs("owner@example.com");

    const owner = (await getCurrentUser())!;
    expect((await listGroups(owner.id)).map((group) => group.name)).toEqual(["Родня", "Друзья", "Знакомые", "Коллеги"]);
  });
});
