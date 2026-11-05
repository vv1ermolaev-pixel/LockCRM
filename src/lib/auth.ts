import "server-only";

import { createHash } from "node:crypto";

import { and, eq, lt, ne, sql } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx, isAPIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";

import { db } from "@/db";
import { accounts, groups, loginEmailSends, sessions, users, verifications } from "@/db/schema";
import { defaultGroups } from "@/lib/groups";
import {
  assertIpWithinLimit,
  assertWithinEmailLimit,
  clearPasswordAttempts,
  reserveLinkEmail,
  reservePasswordAttempt,
} from "@/lib/login-limits";
import {
  LOGIN_LINK_MINUTES,
  sendEmailChangeLink as sendEmailChangeEmail,
  sendInBackground,
  sendLoginEmail,
  sendPasswordChangedEmail,
  sendPasswordResetEmail,
} from "@/lib/mail";
import { hashPassword, verifyPassword } from "@/lib/password-hash";
import { loginEmailSchema } from "@/lib/validation";

const MINUTE = 60;
const DAY = 24 * 60 * MINUTE;

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

// Over HTTP they would go around the password and the limits, which live in the server actions:
// a stolen session would change the email, send emails past the limit, or guess the password
const SERVER_ONLY_PATHS = ["/change-email", "/send-verification-email", "/verify-password"];

export const LOGIN_EMAIL_FAILED = "LOGIN_EMAIL_FAILED";
export const INVALID_LOGIN_EMAIL = "INVALID_LOGIN_EMAIL";

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
      await assertWithinEmailLimit(tx, email);

      // A new link stops the earlier ones of this address; expired links of anybody go too.
      // CASE: other rows of the table do not hold JSON, and the database may check conditions in any order
      await tx.delete(verifications).where(
        sql`${verifications.expiresAt} < now() or (
            ${ne(verifications.identifier, current)}
            and case when ${verifications.identifier} like 'magic-link:%'
              then ${verifications.value}::jsonb ->> 'email' end = ${email}
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

// A new link to change the password stops the earlier ones of this person. Only the earlier ones: two requests
// at one moment must not stop each other's links and leave none. The row of a link holds the user id in `value`,
// and its identifier is the hash Better Auth makes (verification.storeIdentifier below)
async function removeEarlierResetLinks(userId: string, token: string) {
  const current = hashToken(`reset-password:${token}`);
  await db
    .delete(verifications)
    .where(
      and(
        eq(verifications.value, userId),
        lt(verifications.createdAt, sql`(select created_at from verifications where identifier = ${current})`),
      ),
    );
}

// After a change of the password or the email the links sent before are not to work: they went to the old address,
// and an email is often changed because the old mailbox is lost
async function removeResetLinks(userId: string) {
  await db.delete(verifications).where(eq(verifications.value, userId));
}

// Waits for nothing: the answer for an address with an account must not take longer than for one without
async function sendResetPassword({
  user,
  url,
  token,
}: {
  user: { id: string; email: string };
  url: string;
  token: string;
}) {
  sendInBackground(async () => {
    await removeEarlierResetLinks(user.id, token);
    await sendPasswordResetEmail(user.email, url);
  });
}

async function onPasswordReset({ user }: { user: { email: string } }) {
  await clearPasswordAttempts(user.email);
  sendInBackground(() => sendPasswordChangedEmail(user.email));
}

// Better Auth puts the new address into `user.email` here
async function sendEmailChangeLink({ user, url }: { user: { email: string }; url: string }) {
  sendInBackground(() => sendEmailChangeEmail(user.email, url));
}

// The code of an error from Better Auth or from the hooks here: what the actions tell the person depends on it
export function apiErrorCode(error: unknown) {
  return error instanceof APIError ? (error.body as { code?: string } | undefined)?.code : undefined;
}

// The same check for the form and for a request that skips it. Gives the address as it is stored
function normalizedEmail(ctx: { body?: unknown }) {
  const email = loginEmailSchema.safeParse((ctx.body as { email?: unknown } | undefined)?.email);
  if (!email.success) {
    throw new APIError("BAD_REQUEST", { message: email.error.issues[0].message, code: INVALID_LOGIN_EMAIL });
  }
  return email.data;
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
    // Registration stays with the first login by the link. So nobody can set a password before proving the mailbox
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      password: { hash: hashPassword, verify: verifyPassword },
      resetPasswordTokenExpiresIn: LOGIN_LINK_MINUTES * MINUTE,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword,
      onPasswordReset,
    },
    // Links to change the password are kept hashed. The login links are hashed already, and sendMagicLink finds them
    // by the start of the identifier, so they stay as they are
    verification: { storeIdentifier: { default: "plain", overrides: { "reset-password": "hashed" } } },
    // No confirmation from the old address (the owner's decision): the current password, the link to the new
    // address, a notice to the old one. The password is checked in the action, Better Auth does not ask for it,
    // so the path is closed for HTTP in the hook below
    user: { changeEmail: { enabled: true } },
    emailVerification: {
      expiresIn: LOGIN_LINK_MINUTES * MINUTE,
      sendVerificationEmail: sendEmailChangeLink,
      // Runs only after the email really changed. A hook after /verify-email cannot tell: both ways end in a redirect
      afterEmailVerification: (user) => removeResetLinks(user.id),
    },
    // The limits live in hooks: only hooks see both the server actions and the requests that skip the forms
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const requestHeaders = ctx.headers ?? ctx.request?.headers;

        // A call of auth.api from the server has no request
        if (ctx.request && SERVER_ONLY_PATHS.includes(ctx.path)) {
          throw new APIError("FORBIDDEN", { message: "Not available over HTTP", code: "SERVER_ONLY" });
        }

        if (ctx.path === "/sign-in/magic-link") {
          assertIpWithinLimit(requestHeaders);
          return { context: { ...ctx, body: { ...ctx.body, email: normalizedEmail(ctx) } } };
        }

        if (ctx.path === "/sign-in/email") {
          assertIpWithinLimit(requestHeaders);
          const email = normalizedEmail(ctx);
          await reservePasswordAttempt(email);
          return { context: { ...ctx, body: { ...ctx.body, email } } };
        }

        if (ctx.path === "/request-password-reset") {
          assertIpWithinLimit(requestHeaders);
          const email = normalizedEmail(ctx);
          await reserveLinkEmail(email);
          return { context: { ...ctx, body: { ...ctx.body, email } } };
        }

        if (ctx.path === "/reset-password" || ctx.path === "/verify-email") {
          assertIpWithinLimit(requestHeaders);
        }

        if (ctx.path === "/change-password") {
          assertIpWithinLimit(requestHeaders);
          // No session: Better Auth refuses the request by itself
          const session = await getSessionFromCtx(ctx);
          if (session) await reservePasswordAttempt(session.user.email);
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        // Better Auth calls this for a failed request too, with the error as the result
        if (isAPIError(ctx.context.returned)) return;

        if (ctx.path === "/sign-in/email") {
          await clearPasswordAttempts((ctx.body as { email: string }).email);
        }

        if (ctx.path === "/change-password") {
          const { user } = ctx.context.returned as { user: { id: string; email: string } };
          await clearPasswordAttempts(user.email);
          await removeResetLinks(user.id);
          sendInBackground(() => sendPasswordChangedEmail(user.email));
        }
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
