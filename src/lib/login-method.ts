import "server-only";

import { cookies } from "next/headers";

export type LoginMethod = "link" | "password";

// The tab of the login page this browser chose last; the panel writes the cookie. Without a choice, the link
export async function readLoginMethod(): Promise<LoginMethod> {
  return (await cookies()).get("login_method")?.value === "password" ? "password" : "link";
}
