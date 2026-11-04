"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";

import { auth, INVALID_LOGIN_EMAIL, LOGIN_EMAIL_FAILED, TOO_MANY_LOGIN_EMAILS } from "@/lib/auth";
import { rememberLoginEmail } from "@/lib/last-login-email";
import { LOGIN_EMAIL_ERROR, loginEmailSchema } from "@/lib/validation";

export type LoginLinkResult = { ok: true; email: string } | { ok: false; error: string };

const TOO_MANY = "Слишком часто, попробуйте через несколько минут";
const NOT_SENT = "Не удалось отправить письмо. Попробуйте ещё раз.";

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
    if (error instanceof APIError) {
      const code = (error.body as { code?: string } | undefined)?.code;
      if (code === TOO_MANY_LOGIN_EMAILS) return { ok: false, error: TOO_MANY };
      if (code === LOGIN_EMAIL_FAILED) return { ok: false, error: NOT_SENT };
      if (code === INVALID_LOGIN_EMAIL) return { ok: false, error: LOGIN_EMAIL_ERROR };
    }
    throw error;
  }

  await rememberLoginEmail(email);
  return { ok: true, email };
}

// Ends the session of this device only; the others stay
export async function signOut() {
  await auth.api.signOut({ headers: await headers() });
}
