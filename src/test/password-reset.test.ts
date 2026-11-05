import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { requestLoginLink, requestPasswordResetLink, resetPassword, signInWithPassword } from "@/app/login/actions";
import { db } from "@/db";
import { accounts, loginPasswordAttempts, sessions, users, verifications } from "@/db/schema";
import { auth } from "@/lib/auth";
import {
  sendEmailChangeLink,
  sendEmailChangeNotice,
  sendPasswordChangedEmail,
  sendPasswordResetEmail,
} from "@/lib/mail";
import { getCurrentUser } from "@/lib/session";

import { emailsTo, lastEmailTo, loginLinkIn, waitForBackgroundEmails, waitForEmailTo, type Email } from "./mailpit";
import { loginForm, PASSWORD, signInWithNewPassword } from "./password";
import { signInAs } from "./sign-in";
import { browserCookie, switchBrowser } from "./stubs/next-headers";

const RESET_SUBJECT = "Смена пароля в Личной CRM";
const CHANGED_SUBJECT = "Пароль в Личной CRM изменён";
const NEW_PASSWORD = "другая длинная фраза";
const TOO_OFTEN = { ok: false, error: "Слишком часто, попробуйте через несколько минут" };

function emailForm(email: string) {
  const formData = new FormData();
  formData.set("email", email);
  return formData;
}

function newPasswordForm(token: string, password = NEW_PASSWORD) {
  const formData = new FormData();
  formData.set("token", token);
  formData.set("password", password);
  return formData;
}

// The newest link to change the password, from the email that has just gone in the background
async function resetLinkTo(email: string, { count = 1 } = {}) {
  return loginLinkIn(await waitForEmailTo(email, { subject: RESET_SUBJECT, count }));
}

// Opens the link as a browser does: gives the address it redirects to, as a path with the query
async function openResetLink(link: string) {
  const response = await auth.handler(new Request(link));
  expect(response.status).toBe(302);
  const location = new URL(response.headers.get("location")!, process.env.BETTER_AUTH_URL);
  return `${location.pathname}${location.search}`;
}

async function tokenOf(link: string) {
  return new URLSearchParams((await openResetLink(link)).split("?")[1]).get("token")!;
}

const EXPIRED_LINK_PAGE = "/login/reset?error=INVALID_TOKEN";

afterEach(() => {
  vi.restoreAllMocks();
});

const LINK = "https://crm.example.com/api/auth/some-path/token?callbackURL=%2Flogin&x=1";

function expectInOrder(email: Email, sentence: string, button: string, note: string) {
  const html = email.html.replace(/\s+/g, " ");
  expect(html.indexOf(sentence)).toBeGreaterThanOrEqual(0);
  expect(html.indexOf(`>${button}</a>`)).toBeGreaterThan(html.indexOf(sentence));
  expect(html.indexOf(note)).toBeGreaterThan(html.indexOf(`>${button}</a>`));
  expect(html).toContain(`href="${LINK.replaceAll("&", "&amp;")}"`);
  // The plain text version: the same words, and the link stands in for the button
  expect(email.text.indexOf(sentence)).toBeGreaterThanOrEqual(0);
  expect(email.text.indexOf(LINK)).toBeGreaterThan(email.text.indexOf(sentence));
  expect(email.text.indexOf(note)).toBeGreaterThan(email.text.indexOf(LINK));
}

describe("The emails about the password and the email", () => {
  it("«Смена пароля в Личной CRM»: the text, the «Задать пароль» button, the note", async () => {
    await sendPasswordResetEmail("anna@example.com", LINK);

    const email = (await lastEmailTo("anna@example.com"))!;
    expect(email).toMatchObject({ from: { name: "Личная CRM" }, subject: "Смена пароля в Личной CRM" });
    expectInOrder(
      email,
      "Чтобы задать новый пароль, перейдите по ссылке. Ссылка работает 15 минут.",
      "Задать пароль",
      "Если вы не запрашивали смену пароля — просто проигнорируйте письмо. Пароль останется прежним.",
    );
  });

  it("«Пароль в Личной CRM изменён»: the text and no link", async () => {
    await sendPasswordChangedEmail("anna@example.com");

    const email = (await lastEmailTo("anna@example.com"))!;
    expect(email).toMatchObject({ from: { name: "Личная CRM" }, subject: "Пароль в Личной CRM изменён" });
    const text =
      "Пароль вашего аккаунта только что изменён. Если это были вы, ничего делать не нужно. " +
      "Если нет — откройте страницу входа, нажмите «Забыли пароль?» и задайте новый.";
    expect(email.text).toContain(text);
    expect(email.html.replace(/\s+/g, " ")).toContain(text);
    expect(email.html).not.toContain("<a ");
    expect(email.text).not.toMatch(/https?:/);
  });

  it("«Смена почты в Личной CRM»: the text, the «Сменить почту» button, the note", async () => {
    await sendEmailChangeLink("new@example.com", LINK);

    const email = (await lastEmailTo("new@example.com"))!;
    expect(email).toMatchObject({ from: { name: "Личная CRM" }, subject: "Смена почты в Личной CRM" });
    expectInOrder(
      email,
      "Чтобы сменить почту аккаунта на эту, перейдите по ссылке. Ссылка работает 15 минут.",
      "Сменить почту",
      "Если вы не запрашивали смену почты — просто проигнорируйте письмо.",
    );
  });

  it("«Запрошена смена почты в Личной CRM»: the text with the new address", async () => {
    await sendEmailChangeNotice("anna@example.com", "new@example.com");

    const email = (await lastEmailTo("anna@example.com"))!;
    expect(email).toMatchObject({ from: { name: "Личная CRM" }, subject: "Запрошена смена почты в Личной CRM" });
    const text =
      "Запрошена смена почты вашего аккаунта на new@example.com. Если это были вы, откройте ссылку в письме " +
      "на новой почте. Если нет — кто-то знает ваш пароль: сразу смените его.";
    expect(email.text).toContain(text);
    expect(email.html.replace(/\s+/g, " ")).toContain(text);
  });

  it("escapes the special characters of the new address in the HTML", async () => {
    await sendEmailChangeNotice("anna@example.com", `a&b<i>"c"@example.com`);

    const email = (await lastEmailTo("anna@example.com"))!;
    expect(email.html).toContain("a&amp;b&lt;i&gt;&quot;c&quot;@example.com");
    expect(email.html).not.toContain("<i>");
    expect(email.text).toContain(`a&b<i>"c"@example.com`);
  });
});

describe("Asking for a link to change the password", { timeout: 30_000 }, () => {
  it("sends the link to an address with an account, in the form the page shows", async () => {
    await signInWithNewPassword("anna@example.com");
    switchBrowser();

    const result = await requestPasswordResetLink(emailForm("  Anna@Example.COM "));

    expect(result).toEqual({ ok: true, email: "anna@example.com" });
    expect(await waitForEmailTo("anna@example.com", { subject: RESET_SUBJECT })).toBeDefined();
  });

  it("answers the same for an unknown address, sends nothing and creates nobody", async () => {
    const result = await requestPasswordResetLink(emailForm("nobody@example.com"));

    expect(result).toEqual({ ok: true, email: "nobody@example.com" });
    await waitForBackgroundEmails();
    expect(await emailsTo("nobody@example.com")).toEqual([]);
    expect(await db.select().from(users)).toEqual([]);
  });

  it("sends the link to a person who has only logged in by the link", async () => {
    await signInAs("boris@example.com");
    switchBrowser();

    await requestPasswordResetLink(emailForm("boris@example.com"));

    expect(await waitForEmailTo("boris@example.com", { subject: RESET_SUBJECT })).toBeDefined();
  });

  it("shows «Проверьте адрес почты» for «anna@» and sends nothing", async () => {
    expect(await requestPasswordResetLink(emailForm("anna@"))).toEqual({
      ok: false,
      error: "Проверьте адрес почты",
    });
    expect(await db.select().from(verifications)).toEqual([]);
  });

  it("refuses a request that skips the form with a wrong address", async () => {
    await expect(auth.api.requestPasswordReset({ body: { email: "anna@" } })).rejects.toMatchObject({
      status: "BAD_REQUEST",
    });
  });

  it("remembers the address for the page of an old link", async () => {
    await requestPasswordResetLink(emailForm("anna@example.com"));

    expect(browserCookie("login_email")).toMatchObject({ value: "anna@example.com" });
  });

  it("counts 2 login links and 1 reset link together: the 4th request of any kind is refused", async () => {
    await signInAs("anna@example.com");
    switchBrowser();
    await requestLoginLink(emailForm("anna@example.com"));
    await requestPasswordResetLink(emailForm("anna@example.com"));
    await waitForEmailTo("anna@example.com", { subject: RESET_SUBJECT });

    expect(await requestPasswordResetLink(emailForm("anna@example.com"))).toEqual(TOO_OFTEN);
    expect(await requestLoginLink(emailForm("anna@example.com"))).toEqual(TOO_OFTEN);
    await waitForBackgroundEmails();
    expect(await emailsTo("anna@example.com")).toHaveLength(3);
  });

  it("gives the same refusal for an address nobody logged in with", async () => {
    for (let i = 0; i < 3; i++) await requestPasswordResetLink(emailForm("nobody@example.com"));

    expect(await requestPasswordResetLink(emailForm("nobody@example.com"))).toEqual(TOO_OFTEN);
  });

  it("answers as usual when the mail service fails, with only the code in the log", async () => {
    await signInWithNewPassword("anna.private@example.com");
    switchBrowser();
    const failed = vi.spyOn(console, "error").mockImplementation(() => {});
    const smtpUrl = process.env.SMTP_URL;
    process.env.SMTP_URL = "smtp://127.0.0.1:1";

    try {
      const result = await requestPasswordResetLink(emailForm("anna.private@example.com"));
      expect(result).toEqual({ ok: true, email: "anna.private@example.com" });
      await vi.waitFor(() => expect(failed).toHaveBeenCalled(), { timeout: 10_000 });
    } finally {
      process.env.SMTP_URL = smtpUrl;
    }

    expect(failed.mock.calls.flat().join(" ")).toBe("Email was not sent: ESOCKET");
  });

  it("keeps in the database only the hash of the link", async () => {
    await signInWithNewPassword("anna@example.com");
    switchBrowser();

    await requestPasswordResetLink(emailForm("anna@example.com"));
    const token = new URL(await resetLinkTo("anna@example.com")).pathname.split("/").at(-1)!;

    const rows = await db.select().from(verifications);
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  it("makes the link work for 15 minutes", async () => {
    await signInWithNewPassword("anna@example.com");
    await db.delete(verifications);
    switchBrowser();

    await requestPasswordResetLink(emailForm("anna@example.com"));

    const [{ expiresAt }] = await db.select({ expiresAt: verifications.expiresAt }).from(verifications);
    const minutesLeft = (expiresAt.getTime() - Date.now()) / 60_000;
    expect(minutesLeft).toBeGreaterThan(14);
    expect(minutesLeft).toBeLessThanOrEqual(15);
  });

  it("keeps the login links working next to a link to change the password", async () => {
    await signInWithNewPassword("anna@example.com");
    switchBrowser();
    await requestPasswordResetLink(emailForm("anna@example.com"));
    await resetLinkTo("anna@example.com");

    expect(await requestLoginLink(emailForm("anna@example.com"))).toMatchObject({ ok: true });
  });
});

describe("The link to change the password", { timeout: 30_000 }, () => {
  async function askForLink(email = "anna@example.com") {
    await signInWithNewPassword(email);
    switchBrowser();
    await requestPasswordResetLink(emailForm(email));
    return resetLinkTo(email);
  }

  it("opens the page of a new password", async () => {
    const link = await askForLink();

    expect(await openResetLink(link)).toMatch(/^\/login\/reset\?token=.+/);
  });

  it("saves the new password: the new one lets in, the old one does not", async () => {
    const token = await tokenOf(await askForLink());

    expect(await resetPassword(newPasswordForm(token))).toEqual({ ok: true });

    expect(await signInWithPassword(loginForm("anna@example.com", PASSWORD))).toEqual({
      ok: false,
      error: "Неверная почта или пароль",
    });
    expect(await signInWithPassword(loginForm("anna@example.com", NEW_PASSWORD))).toEqual({ ok: true });
  });

  it("works once: the same link opens the old-link page", async () => {
    const link = await askForLink();
    const token = await tokenOf(link);
    await resetPassword(newPasswordForm(token));

    expect(await openResetLink(link)).toBe(EXPIRED_LINK_PAGE);
    expect(await resetPassword(newPasswordForm(token, "ещё один пароль"))).toEqual({ ok: false, expired: true });
  });

  it("stops working after 15 minutes", async () => {
    const link = await askForLink();
    await db.update(verifications).set({ expiresAt: sql`now() - interval '1 minute'` });

    expect(await openResetLink(link)).toBe(EXPIRED_LINK_PAGE);
  });

  it("opens the old-link page with a part of its characters gone", async () => {
    const link = await askForLink();
    const broken = new URL(link);
    broken.pathname = broken.pathname.slice(0, -5);

    expect(await openResetLink(broken.toString())).toBe(EXPIRED_LINK_PAGE);
  });

  it("stops the first link when a second one is asked for, and the second one works", async () => {
    const first = await askForLink();
    await requestPasswordResetLink(emailForm("anna@example.com"));
    const second = await resetLinkTo("anna@example.com", { count: 2 });
    expect(second).not.toBe(first);

    expect(await openResetLink(first)).toBe(EXPIRED_LINK_PAGE);
    expect(await resetPassword(newPasswordForm(await tokenOf(second)))).toEqual({ ok: true });
  });

  it("does not change the password when the link ran out while the page was open", async () => {
    const token = await tokenOf(await askForLink());
    await db.update(verifications).set({ expiresAt: sql`now() - interval '1 minute'` });

    expect(await resetPassword(newPasswordForm(token))).toEqual({ ok: false, expired: true });

    expect(await signInWithPassword(loginForm("anna@example.com", PASSWORD))).toEqual({ ok: true });
  });

  it("ends the sessions of the person on all devices, and only of that person", async () => {
    await signInWithNewPassword("boris@example.com");
    const token = await tokenOf(await askForLink());

    await resetPassword(newPasswordForm(token));

    switchBrowser("anna@example.com");
    expect(await getCurrentUser()).toBeNull();
    switchBrowser("boris@example.com");
    expect((await getCurrentUser())?.email).toBe("boris@example.com");
    expect(await db.select().from(sessions)).toHaveLength(1);
  });

  it("gives a person without a password the first one", async () => {
    await signInAs("anna@example.com");
    switchBrowser();
    await requestPasswordResetLink(emailForm("anna@example.com"));
    const token = await tokenOf(await resetLinkTo("anna@example.com"));

    expect(await resetPassword(newPasswordForm(token))).toEqual({ ok: true });

    expect(await signInWithPassword(loginForm("anna@example.com", NEW_PASSWORD))).toEqual({ ok: true });
    const [account] = await db.select().from(accounts);
    expect(account.password).toMatch(/^scrypt\$/);
  });

  it("takes the block of password attempts off", async () => {
    const token = await tokenOf(await askForLink());
    for (let i = 0; i < 5; i++) await signInWithPassword(loginForm("anna@example.com", "неверный пароль"));

    await resetPassword(newPasswordForm(token));

    expect(await db.select().from(loginPasswordAttempts)).toEqual([]);
    expect(await signInWithPassword(loginForm("anna@example.com", NEW_PASSWORD))).toEqual({ ok: true });
  });

  it.each([
    ["7", 7, "Пароль должен быть не короче 8 символов"],
    ["129", 129, "Пароль должен быть не длиннее 128 символов"],
  ])("refuses a new password of %s characters and keeps the link", async (_, length, error) => {
    const token = await tokenOf(await askForLink());

    expect(await resetPassword(newPasswordForm(token, "a".repeat(length)))).toEqual({ ok: false, error });

    expect(await resetPassword(newPasswordForm(token))).toEqual({ ok: true });
  });

  it("refuses a short password in a request that skips the form", async () => {
    const token = await tokenOf(await askForLink());

    await expect(auth.api.resetPassword({ body: { newPassword: "a".repeat(7), token } })).rejects.toMatchObject({
      status: "BAD_REQUEST",
    });

    expect(await signInWithPassword(loginForm("anna@example.com", PASSWORD))).toEqual({ ok: true });
  });

  it("sends «Пароль в Личной CRM изменён», even when the limit of links is used up", async () => {
    const token = await tokenOf(await askForLink());
    await requestLoginLink(emailForm("anna@example.com"));
    expect(await requestLoginLink(emailForm("anna@example.com"))).toEqual(TOO_OFTEN);

    await resetPassword(newPasswordForm(token));

    const email = await waitForEmailTo("anna@example.com", { subject: CHANGED_SUBJECT });
    expect(email.text).not.toContain(NEW_PASSWORD);
    expect(email.html).not.toContain(NEW_PASSWORD);
  });
});
