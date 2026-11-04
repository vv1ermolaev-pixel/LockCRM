// A real login, step by step as a person does it: ask for the link, take it from the email in Mailpit, open it.
// The browser that opens it keeps the session cookie, so the actions called after it run as that person

import { auth } from "@/lib/auth";

import { lastEmailTo, loginLinkIn } from "./mailpit";
import { headers, storeSetCookies, switchBrowser } from "./stubs/next-headers";

export function tokenOfLink(link: string) {
  const token = new URL(link).searchParams.get("token");
  if (!token) throw new Error("No token in the link");
  return token;
}

// Opens the link in the current browser. Returns the response: a redirect to the app, or to the page of a bad link
export async function openLoginLink(link: string) {
  const response = await auth.api.magicLinkVerify({
    query: { token: tokenOfLink(link), callbackURL: "/", errorCallbackURL: "/login/expired" },
    headers: await headers(),
    asResponse: true,
  });
  storeSetCookies(response.headers.getSetCookie());
  return response;
}

// Gets the person into the app in a browser of their own (named by the email unless another name is given).
// Several calls with different emails give several people, each in their own browser: switch with switchBrowser(name)
export async function signInAs(email: string, { browser = email }: { browser?: string } = {}) {
  switchBrowser(browser);
  await auth.api.signInMagicLink({
    body: { email, callbackURL: "/", errorCallbackURL: "/login/expired" },
    headers: await headers(),
  });
  const message = await lastEmailTo(email.trim().toLowerCase());
  if (!message) throw new Error(`No login email for ${email}`);
  const response = await openLoginLink(loginLinkIn(message));
  const location = response.headers.get("location") ?? "";
  if (new URL(location, "http://x").pathname !== "/") throw new Error(`Login failed, redirected to ${location}`);
}
