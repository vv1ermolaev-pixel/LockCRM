"use server";

import { headers } from "next/headers";

import { ENTER_PASSWORD, TOO_MANY_ATTEMPTS, TOO_OFTEN } from "@/lib/action-messages";
import { apiErrorCode, auth, INVALID_LOGIN_EMAIL, LOGIN_EMAIL_FAILED } from "@/lib/auth";
import { rememberLoginEmail } from "@/lib/last-login-email";
import { TOO_MANY_LOGIN_EMAILS, TOO_MANY_PASSWORD_ATTEMPTS } from "@/lib/login-limits";
import { LOGIN_EMAIL_ERROR, loginEmailSchema, passwordSchema } from "@/lib/validation";

export type LoginLinkResult = { ok: true; email: string } | { ok: false; error: string };
export type PasswordLoginResult = { ok: true } | { ok: false; error: string };
export type ResetPasswordResult = { ok: true } | { ok: false; error: string } | { ok: false; expired: true };

const NOT_SENT = "Не удалось отправить письмо. Попробуйте ещё раз.";
const WRONG_PAIR = "Неверная почта или пароль";

export async function requestLoginLink(formData: FormData): Promise<LoginLinkResult> {
  const parsed = loginEmailSchema.safeParse(formData.get("email") ?? "");
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const email = parsed.data;

  try {
    await auth.api.signInMagicLink({
      body: { email, callbackURL: "/", errorCallbackURL: "/login/expired" },
      headers: await headers(),
    });
  } catch (error) {
    // Answers, not errors: a thrown error reaches the client without its text in production
    const code = apiErrorCode(error);
    if (code === TOO_MANY_LOGIN_EMAILS) return { ok: false, error: TOO_OFTEN };
    if (code === LOGIN_EMAIL_FAILED) return { ok: false, error: NOT_SENT };
    if (code === INVALID_LOGIN_EMAIL) return { ok: false, error: LOGIN_EMAIL_ERROR };
    throw error;
  }

  await rememberLoginEmail(email);
  return { ok: true, email };
}

export async function signInWithPassword(formData: FormData): Promise<PasswordLoginResult> {
  const email = loginEmailSchema.safeParse(formData.get("email") ?? "");
  if (!email.success) {
    return { ok: false, error: email.error.issues[0].message };
  }
  // Only «not empty» here: the rules of length are for a new password, an old one is just compared
  const password = formData.get("password");
  if (typeof password !== "string" || password === "") {
    return { ok: false, error: ENTER_PASSWORD };
  }

  try {
    await auth.api.signInEmail({ body: { email: email.data, password }, headers: await headers() });
  } catch (error) {
    const code = apiErrorCode(error);
    if (code === "INVALID_EMAIL_OR_PASSWORD" || code === "PASSWORD_TOO_LONG") {
      return { ok: false, error: WRONG_PAIR };
    }
    // The limit per IP gives the other code: for the person it is the same «wait or use the link»
    if (code === TOO_MANY_PASSWORD_ATTEMPTS || code === TOO_MANY_LOGIN_EMAILS) {
      return { ok: false, error: TOO_MANY_ATTEMPTS };
    }
    if (code === INVALID_LOGIN_EMAIL) return { ok: false, error: LOGIN_EMAIL_ERROR };
    throw error;
  }

  return { ok: true };
}

// The same answer for an address with an account and without: the email goes only to the first, in the background
export async function requestPasswordResetLink(formData: FormData): Promise<LoginLinkResult> {
  const parsed = loginEmailSchema.safeParse(formData.get("email") ?? "");
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const email = parsed.data;

  try {
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: "/login/reset" },
      headers: await headers(),
    });
  } catch (error) {
    const code = apiErrorCode(error);
    if (code === TOO_MANY_LOGIN_EMAILS) return { ok: false, error: TOO_OFTEN };
    if (code === INVALID_LOGIN_EMAIL) return { ok: false, error: LOGIN_EMAIL_ERROR };
    throw error;
  }

  await rememberLoginEmail(email);
  return { ok: true, email };
}

export async function resetPassword(formData: FormData): Promise<ResetPasswordResult> {
  const password = passwordSchema.safeParse(formData.get("password") ?? "");
  if (!password.success) {
    return { ok: false, error: password.error.issues[0].message };
  }
  const token = formData.get("token");
  if (typeof token !== "string" || token === "") {
    return { ok: false, expired: true };
  }

  try {
    await auth.api.resetPassword({ body: { newPassword: password.data, token }, headers: await headers() });
  } catch (error) {
    if (apiErrorCode(error) === "INVALID_TOKEN") return { ok: false, expired: true };
    throw error;
  }

  return { ok: true };
}

// Ends the session of this device only; the others stay
export async function signOut() {
  await auth.api.signOut({ headers: await headers() });
}
