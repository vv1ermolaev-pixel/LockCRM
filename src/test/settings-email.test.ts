import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { requestEmailChange, sendPasswordResetToMe, setFirstPassword } from "@/app/(app)/settings/actions";
import { addNote } from "@/app/actions";
import EmailChangedPage from "@/app/login/email-changed/page";
import { requestLoginLink, signInWithPassword } from "@/app/login/actions";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";

import { getContactGroupIds, listNotes, loadContactsPage } from "./as-user";
import { emailsTo, lastEmailTo, loginLinkIn, waitForBackgroundEmails, waitForEmailTo } from "./mailpit";
import { loginForm, PASSWORD, signInWithNewPassword } from "./password";
import { addContact, addGroup } from "./scenario";
import { openLoginLink, signInAs } from "./sign-in";
import { headers, storeSetCookies, switchBrowser } from "./stubs/next-headers";

const LINK_SUBJECT = "Смена почты в Личной CRM";
const NOTICE_SUBJECT = "Запрошена смена почты в Личной CRM";
const WRONG_PAIR = { ok: false, error: "Неверная почта или пароль" };
const WRONG_CURRENT = { ok: false, field: "currentPassword", error: "Неверный текущий пароль" };

function changeForm(newEmail: string, currentPassword = PASSWORD) {
  const formData = new FormData();
  formData.set("newEmail", newEmail);
  formData.set("currentPassword", currentPassword);
  return formData;
}

async function storedEmails() {
  return (await db.select({ email: users.email }).from(users)).map((user) => user.email).sort();
}

async function postWithSession(path: string, body: unknown) {
  const requestHeaders = await headers();
  requestHeaders.set("content-type", "application/json");
  requestHeaders.set("origin", process.env.BETTER_AUTH_URL!);
  return auth.handler(
    new Request(`${process.env.BETTER_AUTH_URL}/api/auth${path}`, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(body),
    }),
  );
}

async function changeLinkTo(email: string, { count = 1 } = {}) {
  return loginLinkIn(await waitForEmailTo(email, { subject: LINK_SUBJECT, count }));
}

// Opens the link in the current browser, as a person does. Gives where it leads
async function openChangeLink(link: string) {
  const response = await auth.handler(new Request(link, { headers: await headers() }));
  expect(response.status).toBe(302);
  storeSetCookies(response.headers.getSetCookie());
  const location = new URL(response.headers.get("location")!, process.env.BETTER_AUTH_URL);
  return `${location.pathname}${location.search}`;
}

async function askForChange(newEmail = "new@example.com") {
  await signInWithNewPassword("anna@example.com");
  await requestEmailChange(changeForm(newEmail));
  return changeLinkTo(newEmail);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Asking to change the email", { timeout: 60_000 }, () => {
  it("sends a link to the new address and a notice to the old one, the email stays as it was", async () => {
    await signInWithNewPassword("anna@example.com");

    const result = await requestEmailChange(changeForm("  New@Example.COM "));

    expect(result).toEqual({ ok: true, email: "new@example.com" });
    expect(await waitForEmailTo("new@example.com", { subject: LINK_SUBJECT })).toBeDefined();
    const notice = await waitForEmailTo("anna@example.com", { subject: NOTICE_SUBJECT });
    expect(notice.text).toContain("new@example.com");
    expect((await getCurrentUser())?.email).toBe("anna@example.com");
    expect(await storedEmails()).toEqual(["anna@example.com"]);
  });

  it("is refused to a person without a password", async () => {
    await signInAs("anna@example.com");

    expect(await requestEmailChange(changeForm("new@example.com"))).toEqual({
      ok: false,
      field: "currentPassword",
      error: "Чтобы сменить почту, сначала задайте пароль",
    });

    await waitForBackgroundEmails();
    expect(await emailsTo("new@example.com")).toEqual([]);
  });

  it("shows «Неверный текущий пароль» and sends nothing", async () => {
    await signInWithNewPassword("anna@example.com");

    expect(await requestEmailChange(changeForm("new@example.com", "неверный пароль"))).toEqual(WRONG_CURRENT);

    await waitForBackgroundEmails();
    expect(await emailsTo("new@example.com")).toEqual([]);
    const subjects = (await emailsTo("anna@example.com")).map((email) => email.subject);
    expect(subjects).not.toContain(NOTICE_SUBJECT);
  });

  it("shows «Проверьте адрес почты» for «anna@»", async () => {
    await signInWithNewPassword("anna@example.com");

    expect(await requestEmailChange(changeForm("anna@"))).toEqual({
      ok: false,
      field: "newEmail",
      error: "Проверьте адрес почты",
    });
  });

  it.each(["anna@example.com", "ANNA@Example.com"])("shows «Это ваша текущая почта» for %s", async (email) => {
    await signInWithNewPassword("anna@example.com");

    expect(await requestEmailChange(changeForm(email))).toEqual({
      ok: false,
      field: "newEmail",
      error: "Это ваша текущая почта",
    });

    await waitForBackgroundEmails();
    const subjects = (await emailsTo("anna@example.com")).map((message) => message.subject);
    expect(subjects).not.toContain(NOTICE_SUBJECT);
  });

  it("answers the same for an address of somebody else: no link, the notice goes, the other account is intact", async () => {
    await signInAs("boris@example.com");
    await signInWithNewPassword("anna@example.com");

    expect(await requestEmailChange(changeForm("boris@example.com"))).toEqual({
      ok: true,
      email: "boris@example.com",
    });

    expect(await waitForEmailTo("anna@example.com", { subject: NOTICE_SUBJECT })).toBeDefined();
    await waitForBackgroundEmails();
    const subjects = (await emailsTo("boris@example.com")).map((message) => message.subject);
    expect(subjects).not.toContain(LINK_SUBJECT);
    expect(await storedEmails()).toEqual(["anna@example.com", "boris@example.com"]);
  });

  it("refuses the 4th request for one new address and sends nothing more", async () => {
    await signInWithNewPassword("anna@example.com");
    for (let i = 0; i < 3; i++) await requestEmailChange(changeForm("new@example.com"));
    await changeLinkTo("new@example.com", { count: 3 });

    expect(await requestEmailChange(changeForm("new@example.com"))).toEqual({
      ok: false,
      field: "newEmail",
      error: "Слишком часто, попробуйте через несколько минут",
    });

    await waitForBackgroundEmails();
    expect(await emailsTo("new@example.com")).toHaveLength(3);
  });

  it("counts the link for the new address together with its other emails", async () => {
    await signInWithNewPassword("anna@example.com");
    for (let i = 0; i < 3; i++) await requestLoginLink(loginForm("new@example.com", ""));

    expect(await requestEmailChange(changeForm("new@example.com"))).toMatchObject({
      error: "Слишком часто, попробуйте через несколько минут",
    });
  });

  it("counts wrong passwords: after 5 the right one is refused and nothing is sent", async () => {
    await signInWithNewPassword("anna@example.com");
    for (let i = 0; i < 5; i++) {
      expect(await requestEmailChange(changeForm("new@example.com", "неверный пароль"))).toEqual(WRONG_CURRENT);
    }

    expect(await requestEmailChange(changeForm("new@example.com"))).toEqual({
      ok: false,
      field: "currentPassword",
      error: "Слишком много попыток. Попробуйте через 15 минут или войдите по ссылке.",
    });

    await waitForBackgroundEmails();
    expect(await emailsTo("new@example.com")).toEqual([]);
  });

  it.each([
    ["/change-email", { newEmail: "new@example.com" }],
    ["/send-verification-email", { email: "anna@example.com" }],
  ])("refuses a direct request to %s and sends nothing", async (path, body) => {
    await signInWithNewPassword("anna@example.com");

    expect((await postWithSession(path, body)).status).toBe(403);

    await waitForBackgroundEmails();
    expect(await emailsTo("new@example.com")).toEqual([]);
    const subjects = (await emailsTo("anna@example.com")).map((email) => email.subject);
    expect(subjects).not.toContain(LINK_SUBJECT);
  });

  it("gives no way to check a password over HTTP around the limit", async () => {
    await signInWithNewPassword("anna@example.com");

    const response = await postWithSession("/verify-password", { password: PASSWORD });

    expect(response.status).not.toBe(200);
  });

  it("sends a person without a session to the login page", async () => {
    await expect(requestEmailChange(changeForm("new@example.com"))).rejects.toMatchObject({
      digest: expect.stringContaining("/login"),
    });
  });
});

describe("The link to change the email", { timeout: 60_000 }, () => {
  it("changes the email: the new one lets in with the old password and by a link, the old one does not", async () => {
    const link = await askForChange();

    expect(await openChangeLink(link)).toBe("/login/email-changed");

    expect((await getCurrentUser())?.email).toBe("new@example.com");
    switchBrowser();
    expect(await signInWithPassword(loginForm("anna@example.com", PASSWORD))).toEqual(WRONG_PAIR);
    expect(await signInWithPassword(loginForm("new@example.com", PASSWORD))).toEqual({ ok: true });
    switchBrowser();
    await requestLoginLink(loginForm("new@example.com", ""));
    await openLoginLink(loginLinkIn((await lastEmailTo("new@example.com"))!));
    expect((await getCurrentUser())?.email).toBe("new@example.com");
  });

  it("leaves contacts, notes and groups in place", async () => {
    await signInWithNewPassword("anna@example.com");
    const group = await addGroup("Теннис");
    const contact = await addContact("Борис", { groupIds: [group] });
    const note = new FormData();
    note.set("body", "Познакомились на корте");
    await addNote(contact, note);

    await requestEmailChange(changeForm("new@example.com"));
    await openChangeLink(await changeLinkTo("new@example.com"));

    expect((await loadContactsPage({})).contacts.map((item) => item.name)).toEqual(["Борис"]);
    expect((await listNotes(contact)).map((item) => item.body)).toEqual(["Познакомились на корте"]);
    expect(await getContactGroupIds(contact)).toEqual([group]);
  });

  it("keeps the other devices in", async () => {
    await signInAs("anna@example.com", { browser: "phone" });
    const link = await askForChange();

    await openChangeLink(link);

    switchBrowser("phone");
    expect((await getCurrentUser())?.email).toBe("new@example.com");
  });

  it("changes the email on a device without a login and opens no session there", async () => {
    const link = await askForChange();
    const before = await db.select().from(sessions);
    switchBrowser();

    expect(await openChangeLink(link)).toBe("/login/email-changed");

    expect(await getCurrentUser()).toBeNull();
    expect(await storedEmails()).toEqual(["new@example.com"]);
    expect(await db.select().from(sessions)).toHaveLength(before.length);
  });

  it("stops the links to change the password sent to the old address", async () => {
    await signInWithNewPassword("anna@example.com");
    await sendPasswordResetToMe();
    const resetLink = loginLinkIn(await waitForEmailTo("anna@example.com", { subject: "Смена пароля в Личной CRM" }));
    await requestEmailChange(changeForm("new@example.com"));

    await openChangeLink(await changeLinkTo("new@example.com"));

    const response = await auth.handler(new Request(resetLink));
    expect(response.headers.get("location")).toContain("/login/reset?error=INVALID_TOKEN");
  });

  it("keeps the links to change the password when the email did not change", async () => {
    await signInWithNewPassword("anna@example.com");
    await sendPasswordResetToMe();
    const resetLink = loginLinkIn(await waitForEmailTo("anna@example.com", { subject: "Смена пароля в Личной CRM" }));
    await requestEmailChange(changeForm("new@example.com"));
    const link = new URL(await changeLinkTo("new@example.com"));
    link.searchParams.set("token", link.searchParams.get("token")!.slice(0, -5));

    await openChangeLink(link.toString());

    const response = await auth.handler(new Request(resetLink));
    expect(response.headers.get("location")).toMatch(/\/login\/reset\?token=/);
  });

  it("works once", async () => {
    const link = await askForChange();
    await openChangeLink(link);

    expect(await openChangeLink(link)).toMatch(/^\/login\/email-changed\?error=/);
  });

  it("stops working after 15 minutes", async () => {
    const link = await askForChange();
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 16 * 60_000 });

    expect(await openChangeLink(link)).toMatch(/^\/login\/email-changed\?error=/);

    vi.useRealTimers();
    expect(await storedEmails()).toEqual(["anna@example.com"]);
  });

  it("opens the old-link page with a part of its characters gone", async () => {
    const link = new URL(await askForChange());
    link.searchParams.set("token", link.searchParams.get("token")!.slice(0, -5));

    expect(await openChangeLink(link.toString())).toMatch(/^\/login\/email-changed\?error=/);
    expect(await storedEmails()).toEqual(["anna@example.com"]);
  });

  it("lets only the first opened of two links work", async () => {
    await signInWithNewPassword("anna@example.com");
    await requestEmailChange(changeForm("first@example.com"));
    await requestEmailChange(changeForm("second@example.com"));
    const first = await changeLinkTo("first@example.com");
    const second = await changeLinkTo("second@example.com");

    expect(await openChangeLink(second)).toBe("/login/email-changed");
    expect(await openChangeLink(first)).toMatch(/^\/login\/email-changed\?error=/);

    expect(await storedEmails()).toEqual(["second@example.com"]);
  });

  it("changes nobody's email in a browser with a login of another person", async () => {
    const link = await askForChange();
    await signInAs("boris@example.com");

    expect(await openChangeLink(link)).toMatch(/^\/login\/email-changed\?error=/);

    expect(await storedEmails()).toEqual(["anna@example.com", "boris@example.com"]);
  });
});

describe("The page the link leads to", { timeout: 30_000 }, () => {
  const open = (searchParams: Record<string, string> = {}) =>
    EmailChangedPage({ searchParams: Promise.resolve(searchParams) });

  it("leads to the settings with the message", async () => {
    await signInWithNewPassword("anna@example.com");

    await expect(open()).rejects.toMatchObject({ digest: expect.stringContaining("/settings?email=changed") });
  });

  it("leads to the login page with the message when there is no login on this device", async () => {
    await expect(open()).rejects.toMatchObject({ digest: expect.stringContaining("/login?email=changed") });
  });

  it("shows the old-link page when the link did not work", async () => {
    const page = await open({ error: "INVALID_TOKEN" });

    expect(page).toMatchObject({
      props: { title: "Ссылка устарела", text: "Откройте настройки и запросите смену почты заново." },
    });
  });
});

// The first password is the same path a real person takes before changing the email
describe("A person who has just set the first password", { timeout: 30_000 }, () => {
  it("can change the email", async () => {
    await signInAs("anna@example.com");
    const form = new FormData();
    form.set("password", PASSWORD);
    await setFirstPassword(form);

    await requestEmailChange(changeForm("new@example.com"));
    await openChangeLink(await changeLinkTo("new@example.com"));

    const [user] = await db.select().from(users).where(eq(users.email, "new@example.com"));
    expect(user.emailVerified).toBe(true);
  });
});
