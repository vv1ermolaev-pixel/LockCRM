// Login for the tests, the way a person does it: the email on /login, the link from the email in Mailpit.
// No shortcut into the database: the same screens and the same email as in real use

import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type postgres from "postgres";

const mailpitUrl = () => process.env.MAILPIT_URL || "http://127.0.0.1:8025";

// A new email for every run and file: each test person has data of their own, so counts never overlap
export function testEmail(name: string) {
  return `e2e-${name}-${Date.now().toString(36)}@example.com`;
}

// The newest login link sent to the address, from the plain text of the email. Waits for the email to arrive
export async function loginLinkFor(email: string, { after = 0 }: { after?: number } = {}) {
  let link: string | undefined;
  await expect(async () => {
    const found = (await (
      await fetch(`${mailpitUrl()}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)
    ).json()) as { messages: { ID: string }[] };
    expect(found.messages.length).toBeGreaterThan(after);
    const message = (await (await fetch(`${mailpitUrl()}/api/v1/message/${found.messages[0].ID}`)).json()) as {
      Text: string;
    };
    link = message.Text.match(/https?:\/\/\S+/)?.[0];
    expect(link).toBeTruthy();
  }).toPass({ timeout: 15_000 });
  return link!;
}

// The link from the newest email with this subject: emails about the password go in the background,
// and other emails to the address may arrive around them
export async function emailLinkFor(email: string, subject: string) {
  let link: string | undefined;
  const query = `to:${email} subject:"${subject}"`;
  await expect(async () => {
    const found = (await (await fetch(`${mailpitUrl()}/api/v1/search?query=${encodeURIComponent(query)}`)).json()) as {
      messages: { ID: string }[];
    };
    expect(found.messages.length).toBeGreaterThan(0);
    const message = (await (await fetch(`${mailpitUrl()}/api/v1/message/${found.messages[0].ID}`)).json()) as {
      Text: string;
    };
    link = message.Text.match(/https?:\/\/\S+/)?.[0];
    expect(link).toBeTruthy();
  }).toPass({ timeout: 15_000 });
  return link!;
}

// How many login emails the address has received so far
export async function loginEmailCount(email: string) {
  const found = (await (
    await fetch(`${mailpitUrl()}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)
  ).json()) as { messages: unknown[] };
  return found.messages.length;
}

// The link in the email points to the address the app is configured with; the test opens it on the address
// the test browser uses, because the two may differ (the app on another port, 127.0.0.1 and localhost)
export async function openLink(page: Page, link: string) {
  const url = new URL(link);
  await page.goto(`${url.pathname}${url.search}`);
}

export async function requestLink(page: Page, email: string) {
  await page.getByLabel("Почта", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Получить ссылку для входа" }).click();
  await expect(page.getByText("Проверьте почту", { exact: true })).toBeVisible();
}

// Gets the person into the app and leaves the page on the home list
export async function signIn(page: Page, email: string) {
  const before = await loginEmailCount(email);
  await page.goto("/login");
  await requestLink(page, email);
  await openLink(page, await loginLinkFor(email, { after: before }));
  await expect(page.getByRole("heading", { name: "Контакты" })).toBeVisible();
}

// Removes the test people with everything of theirs: contacts (their notes go with them), groups, then the people
// (their sessions go with them). The order matters: data is never deleted together with its owner
export async function removeTestPeople(sql: postgres.Sql, emails: string[]) {
  await sql`delete from contacts where owner_id in (select id from users where email = any(${emails}))`;
  await sql`delete from groups where owner_id in (select id from users where email = any(${emails}))`;
  await sql`delete from users where email = any(${emails})`;
}

// A person for a whole spec file: logs in once through the screens, and the cookies of that login go into the browser
// of every test of the file (context.addCookies). The data of the file belongs to this person, so counts of contacts
// never overlap with other files or with the data of the developer
export type TestPerson = { email: string; ownerId: string; cookies: Awaited<ReturnType<BrowserContext["cookies"]>> };

export async function createTestPerson(browser: Browser, sql: postgres.Sql, name: string): Promise<TestPerson> {
  const email = testEmail(name);
  const context = await browser.newContext();
  try {
    await signIn(await context.newPage(), email);
    const cookies = await context.cookies();
    const [owner] = await sql<{ id: string }[]>`select id from users where email = ${email}`;
    return { email, ownerId: owner.id, cookies };
  } finally {
    await context.close();
  }
}
