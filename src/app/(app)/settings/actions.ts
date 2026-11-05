"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { ENTER_PASSWORD, TOO_MANY_ATTEMPTS, TOO_OFTEN, WRONG_CURRENT_PASSWORD } from "@/lib/action-messages";
import { apiErrorCode, auth } from "@/lib/auth";
import { rememberLoginEmail } from "@/lib/last-login-email";
import {
  clearPasswordAttempts,
  reserveLinkEmail,
  reservePasswordAttempt,
  TOO_MANY_LOGIN_EMAILS,
  TOO_MANY_PASSWORD_ATTEMPTS,
} from "@/lib/login-limits";
import { sendEmailChangeNotice, sendInBackground, sendPasswordChangedEmail } from "@/lib/mail";
import { hasPassword } from "@/lib/password";
import { requireUser } from "@/lib/session";
import { loginEmailSchema, passwordSchema } from "@/lib/validation";

export type SetPasswordResult = { ok: true } | { ok: false; error: string };
export type ChangePasswordResult =
  { ok: true } | { ok: false; field: "currentPassword" | "newPassword"; error: string };
export type ResetToMeResult = { ok: true; email: string } | { ok: false; error: string };
export type EmailChangeResult =
  { ok: true; email: string } | { ok: false; field: "newEmail" | "currentPassword"; error: string };

// No further check: the person is inside already. The notice to the mailbox is what guards a stolen session here
export async function setFirstPassword(formData: FormData): Promise<SetPasswordResult> {
  const user = await requireUser();
  const password = passwordSchema.safeParse(formData.get("password") ?? "");
  if (!password.success) {
    return { ok: false, error: password.error.issues[0].message };
  }

  await auth.api.setPassword({ body: { newPassword: password.data }, headers: await headers() });

  // This call has no path, so the hook after a password change does not run for it
  sendInBackground(() => sendPasswordChangedEmail(user.email));
  revalidatePath("/settings");
  return { ok: true };
}

export async function changePassword(formData: FormData): Promise<ChangePasswordResult> {
  await requireUser();
  const newPassword = passwordSchema.safeParse(formData.get("newPassword") ?? "");
  if (!newPassword.success) {
    return { ok: false, field: "newPassword", error: newPassword.error.issues[0].message };
  }
  const currentPassword = formData.get("currentPassword");
  if (typeof currentPassword !== "string" || currentPassword === "") {
    return { ok: false, field: "currentPassword", error: ENTER_PASSWORD };
  }

  try {
    // Other devices are logged out: a change of the password is the answer to a possible theft.
    // This device gets a new session, its cookie is set by nextCookies()
    await auth.api.changePassword({
      body: { currentPassword, newPassword: newPassword.data, revokeOtherSessions: true },
      headers: await headers(),
    });
  } catch (error) {
    const code = apiErrorCode(error);
    if (code === "INVALID_PASSWORD" || code === "PASSWORD_TOO_LONG") {
      return { ok: false, field: "currentPassword", error: WRONG_CURRENT_PASSWORD };
    }
    if (code === TOO_MANY_PASSWORD_ATTEMPTS || code === TOO_MANY_LOGIN_EMAILS) {
      return { ok: false, field: "currentPassword", error: TOO_MANY_ATTEMPTS };
    }
    throw error;
  }

  return { ok: true };
}

// «Забыли текущий пароль?»: the link goes to the address of the session, the person stays inside
export async function sendPasswordResetToMe(): Promise<ResetToMeResult> {
  const { email } = await requireUser();

  try {
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: "/login/reset" },
      headers: await headers(),
    });
  } catch (error) {
    if (apiErrorCode(error) === TOO_MANY_LOGIN_EMAILS) return { ok: false, error: TOO_OFTEN };
    throw error;
  }

  await rememberLoginEmail(email);
  return { ok: true, email };
}

// Better Auth does not ask for the password here, so this action is the only way in: see SERVER_ONLY_PATHS.
// The same answer for a free address and for a taken one: the limit is taken in both cases, the link goes only to
// a free one, and the notice to the old address goes at the request, so the owner learns before anything changes
export async function requestEmailChange(formData: FormData): Promise<EmailChangeResult> {
  const user = await requireUser();

  const parsed = loginEmailSchema.safeParse(formData.get("newEmail") ?? "");
  if (!parsed.success) {
    return { ok: false, field: "newEmail", error: parsed.error.issues[0].message };
  }
  const newEmail = parsed.data;
  if (newEmail === user.email) {
    return { ok: false, field: "newEmail", error: "Это ваша текущая почта" };
  }
  if (!(await hasPassword(user.id))) {
    return { ok: false, field: "currentPassword", error: "Чтобы сменить почту, сначала задайте пароль" };
  }
  const password = formData.get("currentPassword");
  if (typeof password !== "string" || password === "") {
    return { ok: false, field: "currentPassword", error: ENTER_PASSWORD };
  }

  const requestHeaders = await headers();
  try {
    await reservePasswordAttempt(user.email);
    await auth.api.verifyPassword({ body: { password }, headers: requestHeaders });
  } catch (error) {
    const code = apiErrorCode(error);
    if (code === "INVALID_PASSWORD" || code === "PASSWORD_TOO_LONG") {
      return { ok: false, field: "currentPassword", error: WRONG_CURRENT_PASSWORD };
    }
    if (code === TOO_MANY_PASSWORD_ATTEMPTS) {
      return { ok: false, field: "currentPassword", error: TOO_MANY_ATTEMPTS };
    }
    throw error;
  }
  await clearPasswordAttempts(user.email);

  try {
    await reserveLinkEmail(newEmail);
  } catch (error) {
    if (apiErrorCode(error) === TOO_MANY_LOGIN_EMAILS) {
      return { ok: false, field: "newEmail", error: TOO_OFTEN };
    }
    throw error;
  }

  await auth.api.changeEmail({
    body: { newEmail, callbackURL: "/login/email-changed" },
    headers: requestHeaders,
  });
  sendInBackground(() => sendEmailChangeNotice(user.email, newEmail));
  return { ok: true, email: newEmail };
}
