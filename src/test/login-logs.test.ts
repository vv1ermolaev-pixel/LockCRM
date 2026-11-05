import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { changePassword, requestEmailChange, setFirstPassword } from "@/app/(app)/settings/actions";
import { requestLoginLink, requestPasswordResetLink, resetPassword, signInWithPassword } from "@/app/login/actions";
import { db } from "@/db";
import { accounts, verifications } from "@/db/schema";
import { auth } from "@/lib/auth";

import { lastEmailTo, loginLinkIn, waitForBackgroundEmails, waitForEmailTo } from "./mailpit";
import { loginForm, PASSWORD, signInWithNewPassword } from "./password";
import { openLoginLink, signInAs } from "./sign-in";
import { headers, switchBrowser } from "./stubs/next-headers";

// Personal data must not reach the server log: the address of a person and the link that logs them in
const EMAIL = "anna.private@example.com";

const methods = ["log", "info", "warn", "error", "debug"] as const;

function captureConsole() {
  const lines: string[] = [];
  for (const method of methods) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      lines.push(args.map((arg) => (arg instanceof Error ? `${arg.message}\n${arg.stack}` : String(arg))).join(" "));
    });
  }
  return lines;
}

function emailForm(email: string) {
  const formData = new FormData();
  formData.set("email", email);
  return formData;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("The server log during login", () => {
  it("holds no address and no link when the address is wrong", async () => {
    const log = captureConsole();

    await requestLoginLink(emailForm("anna.private@"));
    await expect(
      auth.api.signInMagicLink({ body: { email: "anna.private@" }, headers: await headers() }),
    ).rejects.toThrow();

    expect(log.join("\n")).not.toContain("anna.private");
  });

  it("holds no address and no link when the limit is hit", async () => {
    for (let i = 0; i < 3; i++) await requestLoginLink(emailForm(EMAIL));
    const link = loginLinkIn((await lastEmailTo(EMAIL))!);
    const log = captureConsole();

    await requestLoginLink(emailForm(EMAIL));

    expect(log.join("\n")).not.toContain("anna.private");
    expect(log.join("\n")).not.toContain(new URL(link).searchParams.get("token"));
  });

  it("holds no address and no link when the mail service does not accept the email", async () => {
    const smtpUrl = process.env.SMTP_URL;
    process.env.SMTP_URL = "smtp://127.0.0.1:1";
    const log = captureConsole();

    try {
      await requestLoginLink(emailForm(EMAIL));
    } finally {
      process.env.SMTP_URL = smtpUrl;
    }

    expect(log.length).toBeGreaterThan(0);
    expect(log.join("\n")).not.toContain("anna.private");
    expect(log.join("\n")).not.toMatch(/magic-link|token=/);
  });

  it("holds no address and no link when an expired link is opened", async () => {
    await requestLoginLink(emailForm(EMAIL));
    const link = loginLinkIn((await lastEmailTo(EMAIL))!);
    await db.update(verifications).set({ expiresAt: sql`now() - interval '1 minute'` });
    const log = captureConsole();

    await openLoginLink(link);

    expect(log.join("\n")).not.toContain("anna.private");
    expect(log.join("\n")).not.toContain(new URL(link).searchParams.get("token"));
  });
});

describe("The server log around passwords", { timeout: 60_000 }, () => {
  const NEW_PASSWORD = "другая длинная фраза";

  function expectNothingPrivate(log: string[], ...secrets: string[]) {
    const text = log.join("\n");
    expect(text).not.toContain("anna.private");
    expect(text).not.toContain("new.private");
    expect(text).not.toContain("scrypt$");
    expect(text).not.toMatch(/token=|reset-password\//);
    for (const secret of [PASSWORD, NEW_PASSWORD, ...secrets]) expect(text).not.toContain(secret);
  }

  function changeForm(currentPassword: string, newPassword: string) {
    const formData = new FormData();
    formData.set("currentPassword", currentPassword);
    formData.set("newPassword", newPassword);
    return formData;
  }

  it("holds nothing private after wrong passwords, a block and an unknown address", async () => {
    await signInWithNewPassword(EMAIL);
    switchBrowser();
    const log = captureConsole();

    for (let i = 0; i < 6; i++) await signInWithPassword(loginForm(EMAIL, PASSWORD + i));
    await signInWithPassword(loginForm("new.private@example.com", PASSWORD));
    await signInWithPassword(loginForm("anna.private@", PASSWORD));

    expectNothingPrivate(log);
  });

  it("holds nothing private when the mail service does not take the email to change the password", async () => {
    await signInWithNewPassword(EMAIL);
    switchBrowser();
    const smtpUrl = process.env.SMTP_URL;
    process.env.SMTP_URL = "smtp://127.0.0.1:1";
    const log = captureConsole();

    try {
      await requestPasswordResetLink(emailForm(EMAIL));
      await vi.waitFor(() => expect(log.length).toBeGreaterThan(0), { timeout: 10_000 });
    } finally {
      process.env.SMTP_URL = smtpUrl;
    }

    expectNothingPrivate(log);
  });

  it("holds nothing private when a password is set, changed and reset", async () => {
    await signInAs(EMAIL);
    const log = captureConsole();
    const first = new FormData();
    first.set("password", PASSWORD);

    await setFirstPassword(first);
    await changePassword(changeForm("неверный пароль", NEW_PASSWORD));
    await changePassword(changeForm(PASSWORD, NEW_PASSWORD));
    switchBrowser();
    await requestPasswordResetLink(emailForm(EMAIL));
    const link = loginLinkIn(await waitForEmailTo(EMAIL, { subject: "Смена пароля в Личной CRM" }));
    const token = new URL(link).pathname.split("/").at(-1)!;
    const resetForm = new FormData();
    resetForm.set("token", token);
    resetForm.set("password", PASSWORD);
    await resetPassword(resetForm);
    await resetPassword(resetForm);
    await waitForBackgroundEmails();

    const [{ password: hash }] = await db.select({ password: accounts.password }).from(accounts);
    expectNothingPrivate(log, token, hash!);
  });

  it("holds nothing private when the email is changed", async () => {
    await signInWithNewPassword(EMAIL);
    const log = captureConsole();
    const form = new FormData();
    form.set("newEmail", "new.private@example.com");
    form.set("currentPassword", "неверный пароль");

    await requestEmailChange(form);
    form.set("currentPassword", PASSWORD);
    await requestEmailChange(form);
    const link = loginLinkIn(await waitForEmailTo("new.private@example.com", { subject: "Смена почты в Личной CRM" }));
    await auth.handler(new Request(link));
    await auth.handler(new Request(link));
    await waitForBackgroundEmails();

    expectNothingPrivate(log, new URL(link).searchParams.get("token")!);
  });
});
