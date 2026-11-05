import "server-only";

import { count, eq, lt, sql } from "drizzle-orm";
import { APIError } from "better-auth/api";

import { db } from "@/db";
import { loginEmailSends, loginPasswordAttempts } from "@/db/schema";

const MINUTE_MS = 60 * 1000;

// At most this many emails with a link to one address within the window: to log in, to change the password
// or the email, all together
const EMAILS_PER_ADDRESS = 3;
const EMAIL_WINDOW_MINUTES = 10;

// At most this many failed password checks of one address within the window
const PASSWORD_ATTEMPTS_PER_ADDRESS = 5;
const PASSWORD_WINDOW_MINUTES = 15;

// Against sending to thousands of different addresses from one place, and against guessing passwords from it
const REQUESTS_PER_IP = 30;

export const TOO_MANY_LOGIN_EMAILS = "TOO_MANY_LOGIN_EMAILS";
export const TOO_MANY_PASSWORD_ATTEMPTS = "TOO_MANY_PASSWORD_ATTEMPTS";

// Requests per IP in the last minute, all login paths together. In memory: one app container,
// and the limits per email below live in the database
const recentRequests = new Map<string, number[]>();

// Behind nginx the last value of X-Forwarded-For is the address nginx saw; the ones before it come from the client.
// nginx always sets the header, so a request without it did not come through nginx: it is a developer's computer
// or an automatic test, where many logins from one place are normal and there is nobody to guard against
function clientAddress(headers: Headers | undefined) {
  const forwarded = headers?.get("x-forwarded-for");
  return forwarded?.split(",").at(-1)?.trim() || undefined;
}

export function assertIpWithinLimit(headers: Headers | undefined) {
  const address = clientAddress(headers);
  if (!address) return;

  const now = Date.now();
  const recent = (recentRequests.get(address) ?? []).filter((time) => now - time < MINUTE_MS);
  if (recent.length >= REQUESTS_PER_IP) {
    throw new APIError("TOO_MANY_REQUESTS", { message: "Too many login requests", code: TOO_MANY_LOGIN_EMAILS });
  }
  recent.push(now);
  recentRequests.set(address, recent);
  // The map must not grow with every address that ever asked
  if (recentRequests.size > 10_000) {
    for (const [key, times] of recentRequests) {
      if (times.every((time) => now - time >= MINUTE_MS)) recentRequests.delete(key);
    }
  }
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Call inside a transaction. Takes a lock on the address until its end, so two requests at once cannot both pass
export async function assertWithinEmailLimit(tx: Transaction, email: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${email}))`);

  // The address is kept no longer than the limit needs
  await tx
    .delete(loginEmailSends)
    .where(lt(loginEmailSends.sentAt, sql`now() - ${EMAIL_WINDOW_MINUTES} * interval '1 minute'`));
  const [{ sent }] = await tx.select({ sent: count() }).from(loginEmailSends).where(eq(loginEmailSends.email, email));
  if (sent >= EMAILS_PER_ADDRESS) {
    throw new APIError("TOO_MANY_REQUESTS", { message: "Too many login emails", code: TOO_MANY_LOGIN_EMAILS });
  }
}

// Takes a place in the limit before it is known whether the address has an account: the limit must not tell that
export async function reserveLinkEmail(email: string) {
  await db.transaction(async (tx) => {
    await assertWithinEmailLimit(tx, email);
    await tx.insert(loginEmailSends).values({ email });
  });
}

// Written before the password is checked and removed by a success: if it were written after a failure,
// many requests at one moment would all pass the limit. Over the limit no hash is calculated at all
export async function reservePasswordAttempt(email: string) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`password:${email}`}))`);

    await tx
      .delete(loginPasswordAttempts)
      .where(lt(loginPasswordAttempts.attemptedAt, sql`now() - ${PASSWORD_WINDOW_MINUTES} * interval '1 minute'`));
    const [{ attempts }] = await tx
      .select({ attempts: count() })
      .from(loginPasswordAttempts)
      .where(eq(loginPasswordAttempts.email, email));
    if (attempts >= PASSWORD_ATTEMPTS_PER_ADDRESS) {
      throw new APIError("TOO_MANY_REQUESTS", {
        message: "Too many password attempts",
        code: TOO_MANY_PASSWORD_ATTEMPTS,
      });
    }
    await tx.insert(loginPasswordAttempts).values({ email });
  });
}

export async function clearPasswordAttempts(email: string) {
  await db.delete(loginPasswordAttempts).where(eq(loginPasswordAttempts.email, email));
}
