import "server-only";

import { cookies } from "next/headers";

// The email the login link was last asked for in this browser. The page "Ссылка устарела" puts it back in the field:
// the link itself and its record in the database say nothing about the address. It stays in this browser only,
// for 7 days, and is sent only to the login pages (path)
const COOKIE_NAME = "login_email";
const DAYS = 7;

export async function rememberLoginEmail(email: string) {
  (await cookies()).set(COOKIE_NAME, email, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.BETTER_AUTH_URL?.startsWith("https://") ?? false,
    path: "/login",
    maxAge: DAYS * 24 * 60 * 60,
  });
}

export async function readLastLoginEmail() {
  return (await cookies()).get(COOKIE_NAME)?.value ?? "";
}
