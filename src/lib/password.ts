import "server-only";

import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { accounts } from "@/db/schema";

// A password lives in the "credential" row of accounts; a person who has only used the link has no such row
export async function hasPassword(userId: string) {
  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential"), isNotNull(accounts.password)))
    .limit(1);
  return account !== undefined;
}
