import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { requestLoginLink } from "@/app/login/actions";
import { db } from "@/db";
import { loginEmailSends, users, verifications } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";

import { emailsTo, lastEmailTo, loginLinkIn } from "./mailpit";
import { openLoginLink, signInAs } from "./sign-in";
import { browserCookie, headers, switchBrowser } from "./stubs/next-headers";

function emailForm(email: string) {
  const formData = new FormData();
  formData.set("email", email);
  return formData;
}

async function userEmails() {
  return (await db.select({ email: users.email }).from(users)).map((user) => user.email);
}

async function lastLinkTo(email: string) {
  const message = await lastEmailTo(email);
  if (!message) throw new Error(`No email to ${email}`);
  return loginLinkIn(message);
}

describe("The login email", () => {
  it("comes from «Личная CRM» with the subject «Вход в Личную CRM»", async () => {
    await requestLoginLink(emailForm("anna@example.com"));

    const email = await lastEmailTo("anna@example.com");
    expect(email).toMatchObject({ from: { name: "Личная CRM" }, subject: "Вход в Личную CRM" });
  });

  it("says in order: the link works 15 minutes, the «Войти» button, ignore it if you did not ask", async () => {
    await requestLoginLink(emailForm("anna@example.com"));

    const email = (await lastEmailTo("anna@example.com"))!;
    const link = loginLinkIn(email);
    const sentence = "Чтобы войти в Личную CRM, перейдите по ссылке. Ссылка работает 15 минут.";
    const ignore = "Если вы не запрашивали вход — просто проигнорируйте письмо.";
    const html = email.html.replace(/\s+/g, " ");
    expect(html.indexOf(sentence)).toBeGreaterThanOrEqual(0);
    expect(html.indexOf("Войти")).toBeGreaterThan(html.indexOf(sentence));
    expect(html.indexOf(ignore)).toBeGreaterThan(html.indexOf("Войти"));
    expect(html).toContain(`href="${link.replaceAll("&", "&amp;")}"`);
    // The plain text version, for mail programs that do not show HTML: the same words and the link itself
    expect(email.text).toContain(sentence);
    expect(email.text).toContain(ignore);
    expect(email.text.indexOf(link)).toBeGreaterThan(email.text.indexOf(sentence));
    expect(email.text.indexOf(ignore)).toBeGreaterThan(email.text.indexOf(link));
  });
});

describe("Login by the link", () => {
  it("lets in the person who opens the link and shows them as the current user", async () => {
    await requestLoginLink(emailForm("anna@example.com"));

    const response = await openLoginLink(await lastLinkTo("anna@example.com"));

    expect(new URL(response.headers.get("location")!, "http://x").pathname).toBe("/");
    expect((await getCurrentUser())?.email).toBe("anna@example.com");
  });

  it("creates the user at the first login and not before", async () => {
    await requestLoginLink(emailForm("boris@example.com"));
    expect(await userEmails()).toEqual([]);

    await openLoginLink(await lastLinkTo("boris@example.com"));

    expect(await userEmails()).toEqual(["boris@example.com"]);
    expect((await getCurrentUser())?.email).toBe("boris@example.com");
  });

  it("answers the same for a new email and for one that has logged in before", async () => {
    await signInAs("anna@example.com");
    switchBrowser();

    const known = await requestLoginLink(emailForm("anna@example.com"));
    const unknown = await requestLoginLink(emailForm("boris@example.com"));

    expect(known).toEqual({ ok: true, email: "anna@example.com" });
    expect(unknown).toEqual({ ok: true, email: "boris@example.com" });
  });

  it("does not let in with a link used before, with an expired one, or with a broken one", async () => {
    await requestLoginLink(emailForm("anna@example.com"));
    const link = await lastLinkTo("anna@example.com");
    await openLoginLink(link);

    switchBrowser();
    const second = await openLoginLink(link);
    expect(second.headers.get("location")).toContain("/login/expired");
    expect(await getCurrentUser()).toBeNull();

    await requestLoginLink(emailForm("anna@example.com"));
    const old = await lastLinkTo("anna@example.com");
    await db.update(verifications).set({ expiresAt: sql`now() - interval '1 minute'` });
    const expired = await openLoginLink(old);
    expect(expired.headers.get("location")).toContain("/login/expired");
    expect(await getCurrentUser()).toBeNull();

    await requestLoginLink(emailForm("anna@example.com"));
    // Part of the characters of the token is gone
    const broken = new URL(await lastLinkTo("anna@example.com"));
    broken.searchParams.set("token", broken.searchParams.get("token")!.slice(0, -5));
    const brokenResult = await openLoginLink(broken.toString());
    expect(brokenResult.headers.get("location")).toContain("/login/expired");
    expect(await getCurrentUser()).toBeNull();
  });

  it("makes the link work for 15 minutes", async () => {
    await requestLoginLink(emailForm("anna@example.com"));

    const [{ expiresAt }] = await db.select({ expiresAt: verifications.expiresAt }).from(verifications);

    const minutesLeft = (expiresAt.getTime() - Date.now()) / 60_000;
    expect(minutesLeft).toBeGreaterThan(14);
    expect(minutesLeft).toBeLessThanOrEqual(15);
  });

  it("stops the first link when a second one is asked for, and the second one lets in", async () => {
    await requestLoginLink(emailForm("anna@example.com"));
    const first = await lastLinkTo("anna@example.com");
    await requestLoginLink(emailForm("anna@example.com"));
    const second = await lastLinkTo("anna@example.com");
    expect(second).not.toBe(first);

    expect((await openLoginLink(first)).headers.get("location")).toContain("/login/expired");
    expect(await getCurrentUser()).toBeNull();
    expect((await openLoginLink(second)).headers.get("location")).not.toContain("/login/expired");
    expect((await getCurrentUser())?.email).toBe("anna@example.com");
  });

  it("keeps in the database only the hash of the link", async () => {
    await requestLoginLink(emailForm("anna@example.com"));
    const token = new URL(await lastLinkTo("anna@example.com")).searchParams.get("token")!;

    const rows = await db.select().from(verifications);

    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(token);
  });
});

describe("The email typed on the login page", () => {
  it("shows «Проверьте адрес почты» for «anna@», sends nothing and remembers nothing", async () => {
    const result = await requestLoginLink(emailForm("anna@"));

    expect(result).toEqual({ ok: false, error: "Проверьте адрес почты" });
    expect(await emailsTo("anna@")).toEqual([]);
    expect(await db.select().from(verifications)).toEqual([]);
    expect(browserCookie("login_email")).toBeUndefined();
  });

  it("refuses a request that skips the form with «not-an-email» and sends nothing", async () => {
    await expect(
      auth.api.signInMagicLink({ body: { email: "not-an-email" }, headers: await headers() }),
    ).rejects.toMatchObject({ status: "BAD_REQUEST" });

    expect(await db.select().from(verifications)).toEqual([]);
    expect(await db.select().from(loginEmailSends)).toEqual([]);
  });

  it("trims and lowercases «  Anna@Example.COM »: the email goes to anna@example.com and the page shows that address", async () => {
    const result = await requestLoginLink(emailForm("  Anna@Example.COM "));

    expect(result).toEqual({ ok: true, email: "anna@example.com" });
    expect(await emailsTo("anna@example.com")).toHaveLength(1);
  });

  it("remembers the address for 7 days in this browser only, for the page of an old link", async () => {
    await requestLoginLink(emailForm("  Anna@Example.COM "));

    expect(browserCookie("login_email")).toMatchObject({
      value: "anna@example.com",
      httpOnly: true,
      path: "/login",
      maxAge: 7 * 24 * 60 * 60,
    });
  });

  it("is one user for «Anna@Example.com» and «anna@example.com»", async () => {
    await requestLoginLink(emailForm("Anna@Example.com"));
    await openLoginLink(await lastLinkTo("anna@example.com"));
    switchBrowser();
    await requestLoginLink(emailForm("anna@example.com"));
    await openLoginLink(await lastLinkTo("anna@example.com"));

    expect(await userEmails()).toEqual(["anna@example.com"]);
  });
});

describe("At most 3 emails to one address in 10 minutes", () => {
  it("refuses the 4th request with «Слишком часто, попробуйте через несколько минут» and sends no 4th email", async () => {
    for (let i = 0; i < 3; i++) {
      expect(await requestLoginLink(emailForm("anna@example.com"))).toMatchObject({ ok: true });
    }

    const result = await requestLoginLink(emailForm("anna@example.com"));

    expect(result).toEqual({ ok: false, error: "Слишком часто, попробуйте через несколько минут" });
    expect(await emailsTo("anna@example.com")).toHaveLength(3);
  });

  it("counts every address on its own", async () => {
    for (let i = 0; i < 3; i++) await requestLoginLink(emailForm("anna@example.com"));

    const result = await requestLoginLink(emailForm("boris@example.com"));

    expect(result).toEqual({ ok: true, email: "boris@example.com" });
    expect(await emailsTo("boris@example.com")).toHaveLength(1);
  });

  it("allows a request again when the first of the 3 emails is more than 10 minutes old", async () => {
    for (let i = 0; i < 3; i++) await requestLoginLink(emailForm("anna@example.com"));
    await db
      .update(loginEmailSends)
      .set({ sentAt: sql`sent_at - interval '11 minutes'` })
      .where(eq(loginEmailSends.id, sql`(select min(id) from login_email_sends)`));

    const result = await requestLoginLink(emailForm("anna@example.com"));

    expect(result).toMatchObject({ ok: true });
    expect(await emailsTo("anna@example.com")).toHaveLength(4);
  });

  it("keeps the record of an email no longer than 10 minutes", async () => {
    await requestLoginLink(emailForm("anna@example.com"));
    await db.update(loginEmailSends).set({ sentAt: sql`sent_at - interval '11 minutes'` });

    await requestLoginLink(emailForm("boris@example.com"));

    expect((await db.select().from(loginEmailSends)).map((row) => row.email)).toEqual(["boris@example.com"]);
  });

  it("lets only 3 of 5 requests at the same moment through", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => requestLoginLink(emailForm("anna@example.com"))));

    expect(results.filter((result) => result.ok)).toHaveLength(3);
    expect(await emailsTo("anna@example.com")).toHaveLength(3);
  });

  it("does not count a refused request and does not stop the link that works", async () => {
    for (let i = 0; i < 3; i++) await requestLoginLink(emailForm("anna@example.com"));
    const link = await lastLinkTo("anna@example.com");

    await requestLoginLink(emailForm("anna@example.com"));

    expect(await db.select().from(loginEmailSends)).toHaveLength(3);
    await openLoginLink(link);
    expect((await getCurrentUser())?.email).toBe("anna@example.com");
  });
});

describe("At most 30 requests a minute from one address", () => {
  it("refuses the 31st request, even for an address that has not asked yet, and counts other places apart", async () => {
    for (let i = 0; i < 30; i++) {
      expect(await requestLoginLink(emailForm(`person${i}@example.com`))).toMatchObject({ ok: true });
    }

    expect(await requestLoginLink(emailForm("boris@example.com"))).toEqual({
      ok: false,
      error: "Слишком часто, попробуйте через несколько минут",
    });
    expect(await emailsTo("boris@example.com")).toEqual([]);

    switchBrowser();
    expect(await requestLoginLink(emailForm("boris@example.com"))).toMatchObject({ ok: true });
  });
});

describe("An email that the mail service does not accept", () => {
  async function withUnreachableMailService<T>(run: () => Promise<T>) {
    const smtpUrl = process.env.SMTP_URL;
    // A port nobody listens on
    process.env.SMTP_URL = "smtp://127.0.0.1:1";
    try {
      return await run();
    } finally {
      process.env.SMTP_URL = smtpUrl;
    }
  }

  it("shows «Не удалось отправить письмо. Попробуйте ещё раз.», does not count the request and sets no cookie", async () => {
    const result = await withUnreachableMailService(() => requestLoginLink(emailForm("anna@example.com")));

    expect(result).toEqual({ ok: false, error: "Не удалось отправить письмо. Попробуйте ещё раз." });
    expect(await db.select().from(loginEmailSends)).toEqual([]);
    expect(browserCookie("login_email")).toBeUndefined();
  });

  it("leaves the link from the last email working", async () => {
    await requestLoginLink(emailForm("anna@example.com"));
    const link = await lastLinkTo("anna@example.com");

    await withUnreachableMailService(() => requestLoginLink(emailForm("anna@example.com")));

    expect(await db.select().from(verifications)).toHaveLength(1);
    await openLoginLink(link);
    expect((await getCurrentUser())?.email).toBe("anna@example.com");
  });
});
