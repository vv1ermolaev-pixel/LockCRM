import "server-only";

import { createHash } from "node:crypto";

import { count, eq, lt, ne, sql } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";

import { db } from "@/db";
import { accounts, groups, loginEmailSends, sessions, users, verifications } from "@/db/schema";
import { defaultGroups } from "@/lib/groups";
import { LOGIN_LINK_MINUTES, sendLoginEmail } from "@/lib/mail";
import { loginEmailSchema } from "@/lib/validation";

const MINUTE = 60;
const DAY = 24 * 60 * MINUTE;

// At most this many login emails to one address within the window
const EMAILS_PER_ADDRESS = 3;
const EMAIL_WINDOW_MINUTES = 10;

// Against sending to thousands of different addresses from one place
const REQUESTS_PER_IP = 30;

export const TOO_MANY_LOGIN_EMAILS = "TOO_MANY_LOGIN_EMAILS";
export const LOGIN_EMAIL_FAILED = "LOGIN_EMAIL_FAILED";
export const INVALID_LOGIN_EMAIL = "INVALID_LOGIN_EMAIL";

// Requests for a login link per address, in the last minute. In memory: one app container, and the limit
// per email below lives in the database
const recentRequests = new Map<string, number[]>();

// Behind nginx the last value of X-Forwarded-For is the address nginx saw; the ones before it come from the client.
// nginx always sets the header, so a request without it did not come through nginx: it is a developer's computer
// or an automatic test, where many logins from one place are normal and there is nobody to guard against
function clientAddress(headers: Headers | undefined) {
  const forwarded = headers?.get("x-forwarded-for");
  return forwarded?.split(",").at(-1)?.trim() || undefined;
}

function assertIpWithinLimit(headers: Headers | undefined) {
  const address = clientAddress(headers);
  if (!address) return;

  const now = Date.now();
  const recent = (recentRequests.get(address) ?? []).filter((time) => now - time < MINUTE * 1000);
  if (recent.length >= REQUESTS_PER_IP) {
    throw new APIError("TOO_MANY_REQUESTS", { message: "Too many login requests", code: TOO_MANY_LOGIN_EMAILS });
  }
  recent.push(now);
  recentRequests.set(address, recent);
  // The map must not grow with every address that ever asked
  if (recentRequests.size > 10_000) {
    for (const [key, times] of recentRequests) {
      if (times.every((time) => now - time >= MINUTE * 1000)) recentRequests.delete(key);
    }
  }
}

// What the database keeps of a link: only its hash, so a copy of the database lets nobody in.
// The same function names the row (`magic-link:<hash>`), so sendMagicLink knows which row is the new link
function hashToken(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

const linkIdentifier = (token: string) => `magic-link:${hashToken(token)}`;

// Runs inside the request for a link, after Better Auth saved the new link and before the response.
// Under a lock on the address, so two requests at once cannot both pass the limit
async function sendMagicLink({ email, url, token }: { email: string; url: string; token: string }) {
  const current = linkIdentifier(token);
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${email}))`);

      // The address is kept no longer than the limit needs
      await tx
        .delete(loginEmailSends)
        .where(lt(loginEmailSends.sentAt, sql`now() - ${EMAIL_WINDOW_MINUTES} * interval '1 minute'`));
      const [{ sent }] = await tx
        .select({ sent: count() })
        .from(loginEmailSends)
        .where(eq(loginEmailSends.email, email));
      if (sent >= EMAILS_PER_ADDRESS) {
        throw new APIError("TOO_MANY_REQUESTS", { message: "Too many login emails", code: TOO_MANY_LOGIN_EMAILS });
      }

      // A new link stops the earlier ones of this address; expired links of anybody go too
      await tx.delete(verifications).where(
        sql`${verifications.expiresAt} < now() or (
            ${verifications.identifier} like 'magic-link:%'
            and ${ne(verifications.identifier, current)}
            and ${verifications.value}::jsonb ->> 'email' = ${email}
          )`,
      );

      try {
        await sendLoginEmail(email, url);
      } catch (error) {
        // Only the code: the message of a mail library may hold the address
        console.error("Login email was not sent:", (error as { code?: string }).code ?? "unknown error");
        throw new APIError("BAD_GATEWAY", { message: "Login email was not sent", code: LOGIN_EMAIL_FAILED });
      }
      await tx.insert(loginEmailSends).values({ email });
    });
  } catch (error) {
    // The email did not go: the link that was just saved is of no use to anybody, and the earlier ones keep working
    await db.delete(verifications).where(eq(verifications.identifier, current));
    throw error;
  }
}

function createAuth() {
  return betterAuth({
    // BETTER_AUTH_SECRET and BETTER_AUTH_URL are read from the environment by Better Auth itself
    database: drizzleAdapter(db, {
      provider: "pg",
      usePlural: true,
      schema: { users, sessions, accounts, verifications },
    }),
    // Only errors, and the places that log them keep emails and links out of the message
    logger: { level: "error" },
    // Better Auth limits only requests that come over HTTP, not the calls the login form makes from the server.
    // Its limit is off; the one in the hook below covers both ways in
    rateLimit: { enabled: false },
    session: {
      // 30 days from the last visit; a visit extends the session, but not more than once a day
      expiresIn: 30 * DAY,
      updateAge: DAY,
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-in/magic-link") return;

        assertIpWithinLimit(ctx.headers ?? ctx.request?.headers);
        // The same check for the form and for a request that skips it
        const email = loginEmailSchema.safeParse((ctx.body as { email?: unknown } | undefined)?.email);
        if (!email.success) {
          throw new APIError("BAD_REQUEST", { message: email.error.issues[0].message, code: INVALID_LOGIN_EMAIL });
        }
        return { context: { ...ctx, body: { ...ctx.body, email: email.data } } };
      }),
    },
    databaseHooks: {
      user: {
        create: {
          // Every new user starts with the same four groups
          after: async (user) => {
            await db.insert(groups).values(
              defaultGroups.map((group, index) => ({
                ownerId: user.id,
                name: group.name,
                color: group.color,
                position: index + 1,
              })),
            );
          },
        },
      },
    },
    plugins: [
      magicLink({
        expiresIn: LOGIN_LINK_MINUTES * MINUTE,
        storeToken: { type: "custom-hasher", hash: async (token) => hashToken(token) },
        sendMagicLink,
      }),
      // Last in the list: lets server actions set and clear the session cookie
      nextCookies(),
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;

let instance: Auth | undefined;

// Created at the first call, not on import: the build loads every module with no login settings,
// and betterAuth() must not fail without BETTER_AUTH_SECRET then
export const auth = new Proxy({} as Auth, {
  get(_, property) {
    instance ??= createAuth();
    const value: unknown = Reflect.get(instance, property, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
  has(_, property) {
    instance ??= createAuth();
    return Reflect.has(instance, property);
  },
});
