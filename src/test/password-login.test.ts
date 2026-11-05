import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { requestLoginLink, signInWithPassword, signOut } from "@/app/login/actions";
import { db } from "@/db";
import { loginPasswordAttempts, users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";

import { loadContactsPage } from "./as-user";
import { lastEmailTo, loginLinkIn } from "./mailpit";
import { loginForm, PASSWORD, signInWithNewPassword } from "./password";
import { addContact } from "./scenario";
import { openLoginLink, signInAs } from "./sign-in";
import { headers, switchBrowser } from "./stubs/next-headers";

const WRONG_PAIR = { ok: false, error: "Неверная почта или пароль" };
const TOO_MANY = {
  ok: false,
  error: "Слишком много попыток. Попробуйте через 15 минут или войдите по ссылке.",
};

async function userEmails() {
  return (await db.select({ email: users.email }).from(users)).map((user) => user.email);
}

function postToAuth(path: string, body: unknown, ip = "198.51.100.7") {
  return auth.handler(
    new Request(`${process.env.BETTER_AUTH_URL}/api/auth${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: process.env.BETTER_AUTH_URL!,
        "x-forwarded-for": ip,
      },
      body: JSON.stringify(body),
    }),
  );
}

async function failToLogIn(email: string, times: number) {
  for (let i = 0; i < times; i++) {
    expect(await signInWithPassword(loginForm(email, "неверный пароль"))).toEqual(WRONG_PAIR);
  }
}

describe("Login by email and password", { timeout: 30_000 }, () => {
  it("lets in with the right pair", async () => {
    await signInWithNewPassword("anna@example.com");
    switchBrowser();
    expect(await getCurrentUser()).toBeNull();

    const result = await signInWithPassword(loginForm("anna@example.com", PASSWORD));

    expect(result).toEqual({ ok: true });
    expect((await getCurrentUser())?.email).toBe("anna@example.com");
  });

  it("takes «  Anna@Example.COM » for the same person with the same contacts", async () => {
    await signInWithNewPassword("anna@example.com");
    await addContact("Борис");
    switchBrowser();

    expect(await signInWithPassword(loginForm("  Anna@Example.COM ", PASSWORD))).toEqual({ ok: true });

    expect((await getCurrentUser())?.email).toBe("anna@example.com");
    expect((await loadContactsPage({})).contacts.map((contact) => contact.name)).toEqual(["Борис"]);
    expect(await userEmails()).toEqual(["anna@example.com"]);
  });

  it("keeps the person in on both devices", async () => {
    await signInWithNewPassword("anna@example.com", PASSWORD, { browser: "computer" });
    switchBrowser("phone");
    await signInWithPassword(loginForm("anna@example.com", PASSWORD));

    expect((await getCurrentUser())?.email).toBe("anna@example.com");
    switchBrowser("computer");
    expect((await getCurrentUser())?.email).toBe("anna@example.com");
  });

  it("answers the same for a wrong password, an unknown email and an email without a password", async () => {
    await signInWithNewPassword("anna@example.com");
    await signInAs("boris@example.com");
    switchBrowser();

    expect(await signInWithPassword(loginForm("anna@example.com", "неверный пароль"))).toEqual(WRONG_PAIR);
    expect(await signInWithPassword(loginForm("nobody@example.com", PASSWORD))).toEqual(WRONG_PAIR);
    expect(await signInWithPassword(loginForm("boris@example.com", PASSWORD))).toEqual(WRONG_PAIR);
    expect(await getCurrentUser()).toBeNull();
  });

  it("does not let a password of more than 128 characters tell anything else", async () => {
    await signInWithNewPassword("anna@example.com");
    switchBrowser();

    expect(await signInWithPassword(loginForm("anna@example.com", "a".repeat(129)))).toEqual(WRONG_PAIR);
  });

  it("shows «Проверьте адрес почты» for «anna@»", async () => {
    expect(await signInWithPassword(loginForm("anna@", PASSWORD))).toEqual({
      ok: false,
      error: "Проверьте адрес почты",
    });
  });

  it("shows «Введите пароль» for an empty password", async () => {
    await signInWithNewPassword("anna@example.com");
    switchBrowser();

    expect(await signInWithPassword(loginForm("anna@example.com", ""))).toEqual({
      ok: false,
      error: "Введите пароль",
    });
    expect(await getCurrentUser()).toBeNull();
  });

  it("creates no user for a new email", async () => {
    expect(await signInWithPassword(loginForm("new@example.com", PASSWORD))).toEqual(WRONG_PAIR);

    expect(await userEmails()).toEqual([]);
  });

  it("refuses a direct request to register", async () => {
    const response = await postToAuth("/sign-up/email", {
      name: "Анна",
      email: "new@example.com",
      password: PASSWORD,
    });

    expect(response.status).toBe(400);
    expect(await userEmails()).toEqual([]);
  });
});

describe("At most 5 failed password attempts on one address in 15 minutes", { timeout: 60_000 }, () => {
  it("does not let in with the right password on the 6th attempt", async () => {
    await signInWithNewPassword("anna@example.com");
    switchBrowser();
    await failToLogIn("anna@example.com", 5);

    expect(await signInWithPassword(loginForm("anna@example.com", PASSWORD))).toEqual(TOO_MANY);
    expect(await getCurrentUser()).toBeNull();
  });

  it("answers the same for an address nobody logged in with", async () => {
    await failToLogIn("nobody@example.com", 5);

    expect(await signInWithPassword(loginForm("nobody@example.com", PASSWORD))).toEqual(TOO_MANY);
  });

  it("makes no more than 5 checks of 10 requests at the same moment", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => signInWithPassword(loginForm("nobody@example.com", "неверный пароль"))),
    );

    expect(results.filter((result) => !result.ok && result.error === WRONG_PAIR.error)).toHaveLength(5);
    expect(results.filter((result) => !result.ok && result.error === TOO_MANY.error)).toHaveLength(5);
    expect(await db.select().from(loginPasswordAttempts)).toHaveLength(5);
  });

  it("counts every address on its own", async () => {
    await signInWithNewPassword("boris@example.com");
    switchBrowser();
    await failToLogIn("anna@example.com", 5);

    expect(await signInWithPassword(loginForm("boris@example.com", PASSWORD))).toEqual({ ok: true });
    expect((await getCurrentUser())?.email).toBe("boris@example.com");
  });

  it("keeps the login by the link working", async () => {
    await signInWithNewPassword("anna@example.com");
    switchBrowser();
    await failToLogIn("anna@example.com", 5);

    await requestLoginLink(loginForm("anna@example.com", ""));
    await openLoginLink(loginLinkIn((await lastEmailTo("anna@example.com"))!));

    expect((await getCurrentUser())?.email).toBe("anna@example.com");
  });

  it("lets in again when the attempts are more than 15 minutes old", async () => {
    await signInWithNewPassword("anna@example.com");
    switchBrowser();
    await failToLogIn("anna@example.com", 5);
    await db.update(loginPasswordAttempts).set({ attemptedAt: sql`attempted_at - interval '16 minutes'` });

    expect(await signInWithPassword(loginForm("anna@example.com", PASSWORD))).toEqual({ ok: true });
  });

  it("starts the count again after a successful login", async () => {
    await signInWithNewPassword("anna@example.com");
    switchBrowser();
    await failToLogIn("anna@example.com", 4);
    expect(await signInWithPassword(loginForm("anna@example.com", PASSWORD))).toEqual({ ok: true });
    await signOut();
    switchBrowser();

    await failToLogIn("anna@example.com", 4);

    expect(await signInWithPassword(loginForm("anna@example.com", PASSWORD))).toEqual({ ok: true });
    expect(await db.select().from(loginPasswordAttempts)).toEqual([]);
  });

  it("does not keep an address longer than 15 minutes", async () => {
    await failToLogIn("anna@example.com", 1);
    await db.update(loginPasswordAttempts).set({ attemptedAt: sql`attempted_at - interval '16 minutes'` });

    await failToLogIn("boris@example.com", 1);

    expect((await db.select().from(loginPasswordAttempts)).map((row) => row.email)).toEqual(["boris@example.com"]);
  });

  it("holds a request that skips the form to the same limit and the same rule for the address", async () => {
    await signInWithNewPassword("anna@example.com");

    const refused = await postToAuth("/sign-in/email", { email: "anna@", password: PASSWORD });
    expect(refused.status).toBe(400);

    for (let i = 0; i < 5; i++) {
      const wrong = await postToAuth("/sign-in/email", { email: "  Anna@Example.COM ", password: "неверный пароль" });
      expect(wrong.status).toBe(401);
    }
    const blocked = await postToAuth("/sign-in/email", { email: "anna@example.com", password: PASSWORD });

    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ code: "TOO_MANY_PASSWORD_ATTEMPTS" });
  });

  it("lets in with a direct request and spaces around the address", async () => {
    await signInWithNewPassword("anna@example.com");

    const response = await postToAuth("/sign-in/email", { email: "  Anna@Example.COM ", password: PASSWORD });

    expect(response.status).toBe(200);
  });

  it("refuses the 31st login request from one place, whichever the address", async () => {
    await signInWithNewPassword("anna@example.com");
    switchBrowser();
    const requestHeaders = await headers();
    for (let i = 0; i < 30; i++) {
      // A wrong address is the quickest request: it uses up the limit without a hash
      await expect(
        auth.api.signInEmail({ body: { email: "anna@", password: PASSWORD }, headers: requestHeaders }),
      ).rejects.toMatchObject({ status: "BAD_REQUEST" });
    }

    expect(await signInWithPassword(loginForm("anna@example.com", PASSWORD))).toEqual(TOO_MANY);

    switchBrowser();
    expect(await signInWithPassword(loginForm("anna@example.com", PASSWORD))).toEqual({ ok: true });
  });
});
