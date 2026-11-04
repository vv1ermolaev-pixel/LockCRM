import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/lib/auth";

// Who is asking: the user of the session cookie, or null. One database query per render
export const getCurrentUser = cache(async () => {
  // Headers first: they tell Next the page is dynamic. Reading `auth` first would make the build create it,
  // and without login settings in the environment the build would print an error for every page
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  return session?.user ?? null;
});

// The first line of every page and action that touches data. No session: to the login page
export async function requireUserId() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user.id;
}
