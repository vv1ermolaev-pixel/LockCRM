import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/lib/auth";

// Who is asking: the user of the session cookie, or null. One database query per render
export const getCurrentUser = cache(async () => {
  // Headers first: they tell Next the page is dynamic. Reading `auth` first would make the build create it,
  // and without login settings in the environment the build would print an error for every page
  const requestHeaders = new Headers(await headers());
  // A page rendered right after a server action gets the old cookies in headers(): a change of the password ends the
  // session they name, and the person would land on the login page. cookies() already has the new session
  const current = (await cookies()).getAll().filter(({ value }) => value);
  requestHeaders.set("cookie", current.map(({ name, value }) => `${name}=${encodeURIComponent(value)}`).join("; "));
  const session = await auth.api.getSession({ headers: requestHeaders });
  return session?.user ?? null;
});

// The first line of every page and action that touches data. No session: to the login page
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireUserId() {
  return (await requireUser()).id;
}
