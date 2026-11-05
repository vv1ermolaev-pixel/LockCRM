import { describe, expect, it } from "vitest";

import { changePassword, sendPasswordResetToMe, setFirstPassword } from "@/app/(app)/settings/actions";
import { requestLoginLink, requestPasswordResetLink, signInWithPassword, signOut } from "@/app/login/actions";
import { db } from "@/db";
import { accounts, loginPasswordAttempts } from "@/db/schema";
import { auth } from "@/lib/auth";
import { hasPassword } from "@/lib/password";
import { getCurrentUser } from "@/lib/session";

import { currentUserId } from "./as-user";
import { emailsTo, lastEmailTo, loginLinkIn, waitForBackgroundEmails, waitForEmailTo } from "./mailpit";
import { loginForm, PASSWORD, signInWithNewPassword } from "./password";
import { openLoginLink, signInAs } from "./sign-in";
import { headers, switchBrowser } from "./stubs/next-headers";

const CHANGED_SUBJECT = "Пароль в Личной CRM изменён";
const RESET_SUBJECT = "Смена пароля в Личной CRM";
const NEW_PASSWORD = "другая длинная фраза";
const WRONG_PAIR = { ok: false, error: "Неверная почта или пароль" };

function newPasswordForm(password: string) {
  const formData = new FormData();
  formData.set("password", password);
  return formData;
}

function changeForm(currentPassword: string, newPassword: string) {
  const formData = new FormData();
  formData.set("currentPassword", currentPassword);
  formData.set("newPassword", newPassword);
  return formData;
}

// A redirect of Next is an error with this mark: the action stopped before doing anything
const toLoginPage = { digest: expect.stringContaining("/login") };

describe("The first password", { timeout: 30_000 }, () => {
  it("shows that a person has a password, only for that person", async () => {
    await signInAs("anna@example.com");
    const anna = await currentUserId();
    expect(await hasPassword(anna)).toBe(false);

    await signInWithNewPassword("boris@example.com");

    expect(await hasPassword(await currentUserId())).toBe(true);
    expect(await hasPassword(anna)).toBe(false);
  });

  it("is saved and lets in after logging out", async () => {
    await signInAs("anna@example.com");

    expect(await setFirstPassword(newPasswordForm(PASSWORD))).toEqual({ ok: true });

    await signOut();
    switchBrowser();
    expect(await signInWithPassword(loginForm("anna@example.com", PASSWORD))).toEqual({ ok: true });
  });

  it("keeps the login by the link working", async () => {
    await signInAs("anna@example.com");
    await setFirstPassword(newPasswordForm(PASSWORD));
    switchBrowser();

    await requestLoginLink(loginForm("anna@example.com", ""));
    await openLoginLink(loginLinkIn((await lastEmailTo("anna@example.com"))!));

    expect((await getCurrentUser())?.email).toBe("anna@example.com");
  });

  it("keeps the other devices in", async () => {
    await signInAs("anna@example.com", { browser: "computer" });
    await signInAs("anna@example.com", { browser: "phone" });

    await setFirstPassword(newPasswordForm(PASSWORD));

    switchBrowser("computer");
    expect((await getCurrentUser())?.email).toBe("anna@example.com");
  });

  it.each([
    [7, "Пароль должен быть не короче 8 символов"],
    [129, "Пароль должен быть не длиннее 128 символов"],
  ])("refuses %i characters with the text of the rule", async (length, error) => {
    await signInAs("anna@example.com");

    expect(await setFirstPassword(newPasswordForm("a".repeat(length)))).toEqual({ ok: false, error });

    expect(await hasPassword(await currentUserId())).toBe(false);
  });

  it("is saved with exactly 8 characters", async () => {
    await signInAs("anna@example.com");

    expect(await setFirstPassword(newPasswordForm("a".repeat(8)))).toEqual({ ok: true });
  });

  it("keeps the spaces at the edges", async () => {
    await signInAs("anna@example.com");
    await setFirstPassword(newPasswordForm(" длинная фраза "));
    switchBrowser();

    expect(await signInWithPassword(loginForm("anna@example.com", "длинная фраза"))).toEqual(WRONG_PAIR);
    expect(await signInWithPassword(loginForm("anna@example.com", " длинная фраза "))).toEqual({ ok: true });
  });

  it("sends a person without a session to the login page and saves nothing", async () => {
    await expect(setFirstPassword(newPasswordForm(PASSWORD))).rejects.toMatchObject(toLoginPage);

    expect(await db.select().from(accounts)).toEqual([]);
  });

  it("sends «Пароль в Личной CRM изменён»", async () => {
    await signInAs("anna@example.com");

    await setFirstPassword(newPasswordForm(PASSWORD));

    const email = await waitForEmailTo("anna@example.com", { subject: CHANGED_SUBJECT });
    expect(email.text).not.toContain(PASSWORD);
    expect(email.html).not.toContain(PASSWORD);
  });

  it("is kept as a hash, different for two people with one password", async () => {
    await signInAs("anna@example.com");
    await setFirstPassword(newPasswordForm(PASSWORD));
    await signInAs("boris@example.com");
    await setFirstPassword(newPasswordForm(PASSWORD));

    const rows = await db.select({ password: accounts.password }).from(accounts);

    expect(rows).toHaveLength(2);
    expect(rows[0].password).toMatch(/^scrypt\$/);
    expect(rows[0].password).not.toContain(PASSWORD);
    expect(rows[0].password).not.toBe(rows[1].password);
  });
});

describe("Changing the password", { timeout: 60_000 }, () => {
  it("works with the right current password: the old one stops, the new one lets in", async () => {
    await signInWithNewPassword("anna@example.com");

    expect(await changePassword(changeForm(PASSWORD, NEW_PASSWORD))).toEqual({ ok: true });

    switchBrowser();
    expect(await signInWithPassword(loginForm("anna@example.com", PASSWORD))).toEqual(WRONG_PAIR);
    expect(await signInWithPassword(loginForm("anna@example.com", NEW_PASSWORD))).toEqual({ ok: true });
  });

  it("shows «Неверный текущий пароль» and leaves the password as it was", async () => {
    await signInWithNewPassword("anna@example.com");

    expect(await changePassword(changeForm("неверный пароль", NEW_PASSWORD))).toEqual({
      ok: false,
      field: "currentPassword",
      error: "Неверный текущий пароль",
    });

    switchBrowser();
    expect(await signInWithPassword(loginForm("anna@example.com", PASSWORD))).toEqual({ ok: true });
  });

  it("asks for the current password without counting an empty field as an attempt", async () => {
    await signInWithNewPassword("anna@example.com");

    expect(await changePassword(changeForm("", NEW_PASSWORD))).toEqual({
      ok: false,
      field: "currentPassword",
      error: "Введите пароль",
    });

    expect(await db.select().from(loginPasswordAttempts)).toEqual([]);
  });

  it.each([
    [7, "Пароль должен быть не короче 8 символов"],
    [129, "Пароль должен быть не длиннее 128 символов"],
  ])("refuses a new password of %i characters", async (length, error) => {
    await signInWithNewPassword("anna@example.com");

    expect(await changePassword(changeForm(PASSWORD, "a".repeat(length)))).toEqual({
      ok: false,
      field: "newPassword",
      error,
    });
  });

  it("ends the other sessions and keeps this one", async () => {
    await signInWithNewPassword("anna@example.com", PASSWORD, { browser: "computer" });
    await signInAs("anna@example.com", { browser: "phone" });

    switchBrowser("computer");
    await changePassword(changeForm(PASSWORD, NEW_PASSWORD));

    expect((await getCurrentUser())?.email).toBe("anna@example.com");
    switchBrowser("phone");
    expect(await getCurrentUser()).toBeNull();
  });

  it("refuses a short new password in a request that skips the form", async () => {
    await signInWithNewPassword("anna@example.com");

    await expect(
      auth.api.changePassword({
        body: { currentPassword: PASSWORD, newPassword: "a".repeat(7) },
        headers: await headers(),
      }),
    ).rejects.toMatchObject({ status: "BAD_REQUEST" });

    switchBrowser();
    expect(await signInWithPassword(loginForm("anna@example.com", PASSWORD))).toEqual({ ok: true });
  });

  it("counts wrong current passwords: after 5 the right one is refused too", async () => {
    await signInWithNewPassword("anna@example.com");
    for (let i = 0; i < 5; i++) {
      expect(await changePassword(changeForm("неверный пароль", NEW_PASSWORD))).toMatchObject({
        error: "Неверный текущий пароль",
      });
    }

    expect(await changePassword(changeForm(PASSWORD, NEW_PASSWORD))).toEqual({
      ok: false,
      field: "currentPassword",
      error: "Слишком много попыток. Попробуйте через 15 минут или войдите по ссылке.",
    });

    await db.delete(loginPasswordAttempts);
    switchBrowser();
    expect(await signInWithPassword(loginForm("anna@example.com", PASSWORD))).toEqual({ ok: true });
  });

  it("clears the attempts after a success", async () => {
    await signInWithNewPassword("anna@example.com");
    await changePassword(changeForm("неверный пароль", NEW_PASSWORD));

    await changePassword(changeForm(PASSWORD, NEW_PASSWORD));

    expect(await db.select().from(loginPasswordAttempts)).toEqual([]);
  });

  it("stops the links to change the password that were sent before", async () => {
    await signInWithNewPassword("anna@example.com");
    await requestPasswordResetLink(loginForm("anna@example.com", ""));
    const link = loginLinkIn(await waitForEmailTo("anna@example.com", { subject: RESET_SUBJECT }));

    await changePassword(changeForm(PASSWORD, NEW_PASSWORD));

    const response = await auth.handler(new Request(link));
    expect(response.headers.get("location")).toContain("/login/reset?error=INVALID_TOKEN");
  });

  it("sends «Пароль в Личной CRM изменён» without the password", async () => {
    await signInWithNewPassword("anna@example.com");

    await changePassword(changeForm(PASSWORD, NEW_PASSWORD));

    const email = await waitForEmailTo("anna@example.com", { subject: CHANGED_SUBJECT });
    expect(email.text).not.toContain(NEW_PASSWORD);
    expect(email.html).not.toContain(NEW_PASSWORD);
  });

  it("sends no notice when the current password is wrong", async () => {
    await signInWithNewPassword("anna@example.com");

    await changePassword(changeForm("неверный пароль", NEW_PASSWORD));

    await waitForBackgroundEmails();
    const subjects = (await emailsTo("anna@example.com")).map((email) => email.subject);
    expect(subjects).not.toContain(CHANGED_SUBJECT);
  });
});

describe("«Забыли текущий пароль?»", { timeout: 30_000 }, () => {
  it("sends the link to the address of the person and keeps them in", async () => {
    await signInWithNewPassword("anna@example.com");

    expect(await sendPasswordResetToMe()).toEqual({ ok: true, email: "anna@example.com" });

    expect(await waitForEmailTo("anna@example.com", { subject: RESET_SUBJECT })).toBeDefined();
    expect((await getCurrentUser())?.email).toBe("anna@example.com");
  });

  it("goes by the common limit of emails", async () => {
    await signInWithNewPassword("anna@example.com");
    await sendPasswordResetToMe();
    await sendPasswordResetToMe();

    expect(await sendPasswordResetToMe()).toEqual({
      ok: false,
      error: "Слишком часто, попробуйте через несколько минут",
    });
  });

  it("sends a person without a session to the login page", async () => {
    await expect(sendPasswordResetToMe()).rejects.toMatchObject(toLoginPage);
  });
});
