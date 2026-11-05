// Success criterion of specs/02-пользователи-вход.md: person A logs in and adds a contact; person B logs in
// in another browser and does not see it, not in the list, not in the search, not by the address of the card.
// Plus the login screens: the page without login, a wrong email, "Проверьте почту", an old link, logout.

import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

import { loginEmailCount, loginLinkFor, openLink, removeTestPeople, requestLink, signIn, testEmail } from "./sign-in";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

const emailA = testEmail("login-a");
const emailB = testEmail("login-b");
const emailC = testEmail("login-c");
const contactName = `Анна Тестова-${Date.now().toString(36)}`;

function contactRows(page: Page) {
  return page.locator('li[id^="contact-"]');
}

test.afterAll(async () => {
  // Remove only what these tests created
  await removeTestPeople(sql, [emailA, emailB, emailC]);
  await sql.end();
});

test("a contact of A is not visible to B", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  let cardPath = "";

  await test.step("A logs in and adds a contact", async () => {
    await signIn(pageA, emailA);
    await expect(pageA.getByText("Пока нет ни одного контакта")).toBeVisible();
    await pageA.getByRole("button", { name: "Добавить контакт" }).click();
    const dialog = pageA.getByRole("dialog", { name: "Новый контакт" });
    await dialog.getByLabel("Имя").fill(contactName);
    await dialog.getByRole("button", { name: "Добавить" }).click();
    await expect(dialog).toBeHidden();
    await expect(contactRows(pageA).filter({ hasText: contactName })).toBeVisible();
    await contactRows(pageA).getByRole("link").click();
    await expect(pageA.getByRole("heading", { level: 1, name: contactName })).toBeVisible();
    cardPath = new URL(pageA.url()).pathname;
  });

  await test.step("B logs in: the contact of A is neither in the list nor in the search", async () => {
    await signIn(pageB, emailB);
    await expect(pageB.getByText("Пока нет ни одного контакта")).toBeVisible();
    await expect(pageB.getByText(contactName)).toHaveCount(0);
    await expect(contactRows(pageB)).toHaveCount(0);
  });

  await test.step("B opens the address of the card of A: «Такого контакта нет»", async () => {
    await pageB.goto(cardPath);
    await expect(pageB.getByText("Такого контакта нет")).toBeVisible();
    await expect(pageB.getByText(contactName)).toHaveCount(0);
  });

  await test.step("A still sees the contact", async () => {
    await pageA.goto("/");
    await expect(contactRows(pageA).filter({ hasText: contactName })).toBeVisible();
  });

  await contextA.close();
  await contextB.close();
});

test("without login every page is the login page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Вход в приложение" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Вход по ссылке" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Почта и пароль" })).toBeVisible();
  await expect(page.getByText("Введите почту — пришлём ссылку для входа. Пароль не нужен.")).toBeVisible();
  await expect(page.getByLabel("Почта", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Получить ссылку для входа" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Контакты" })).toHaveCount(0);

  await page.goto("/contacts/1");
  await expect(page.getByRole("heading", { name: "Вход в приложение" })).toBeVisible();
});

test("the health check answers without login", async ({ request }) => {
  expect((await request.get("/health")).status()).toBe(200);
});

test("a wrong email shows an error under the field and sends nothing", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Почта", { exact: true }).fill("anna@");
  await page.getByRole("button", { name: "Получить ссылку для входа" }).click();

  await expect(page.getByText("Проверьте адрес почты")).toBeVisible();
  await expect(page.getByLabel("Почта", { exact: true })).toBeVisible();
  await expect(page.getByText("Проверьте почту", { exact: true })).toHaveCount(0);
});

test("after sending: «Проверьте почту», and «Ввести другую почту» brings the form back with the email", async ({
  page,
}) => {
  await page.goto("/login");
  await requestLink(page, `  ${emailC.toUpperCase()} `);

  await expect(page.getByText(`Отправили ссылку для входа на ${emailC}. Ссылка работает 15 минут.`)).toBeVisible();
  await page.getByRole("button", { name: "Ввести другую почту" }).click();

  await expect(page.getByRole("heading", { name: "Вход в приложение" })).toBeVisible();
  await expect(page.getByLabel("Почта", { exact: true })).toHaveValue(emailC);
});

test("a used link opens «Ссылка устарела» with the email, and «Отправить ссылку повторно» sends a new one", async ({
  browser,
}) => {
  const email = testEmail("login-old");
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto("/login");
    await requestLink(page, email);
    const link = await loginLinkFor(email);
    await openLink(page, link);
    await expect(page.getByRole("heading", { name: "Контакты" })).toBeVisible();

    // Logged in and the same link again: the link works once
    await page.getByRole("button", { name: "Выйти" }).click();
    await expect(page.getByRole("heading", { name: "Вход в приложение" })).toBeVisible();
    await openLink(page, link);
    await expect(page.getByRole("heading", { name: "Ссылка устарела" })).toBeVisible();
    await expect(page.getByText("Запросите новую — она придёт на почту.")).toBeVisible();
    await expect(page.getByLabel("Почта", { exact: true })).toHaveValue(email);

    const before = await loginEmailCount(email);
    await page.getByRole("button", { name: "Отправить ссылку повторно" }).click();
    await expect(page.getByText("Проверьте почту", { exact: true })).toBeVisible();
    await openLink(page, await loginLinkFor(email, { after: before }));
    await expect(page.getByRole("heading", { name: "Контакты" })).toBeVisible();
  } finally {
    await context.close();
    await removeTestPeople(sql, [email]);
  }
});

test("the 4th request in 10 minutes shows «Слишком часто, попробуйте через несколько минут» under the field", async ({
  page,
}) => {
  const email = testEmail("login-limit");
  await page.goto("/login");
  for (let i = 0; i < 3; i++) {
    await requestLink(page, email);
    await page.getByRole("button", { name: "Ввести другую почту" }).click();
  }

  await page.getByRole("button", { name: "Получить ссылку для входа" }).click();

  await expect(page.getByText("Слишком часто, попробуйте через несколько минут")).toBeVisible();
  await expect(page.getByLabel("Почта", { exact: true })).toHaveValue(email);
  expect(await loginEmailCount(email)).toBe(3);
});

test("an old link opened in another browser shows «Ссылка устарела» with an empty email field", async ({ browser }) => {
  const email = testEmail("login-other");
  const computer = await browser.newContext();
  const phone = await browser.newContext();
  try {
    const computerPage = await computer.newPage();
    await computerPage.goto("/login");
    await requestLink(computerPage, email);
    const link = await loginLinkFor(email);
    await openLink(computerPage, link);
    await expect(computerPage.getByRole("heading", { name: "Контакты" })).toBeVisible();

    const phonePage = await phone.newPage();
    await openLink(phonePage, link);

    await expect(phonePage.getByRole("heading", { name: "Ссылка устарела" })).toBeVisible();
    await expect(phonePage.getByLabel("Почта", { exact: true })).toHaveValue("");
    // The button works as «Получить ссылку для входа» once the email is typed
    await phonePage.getByLabel("Почта", { exact: true }).fill(email);
    await phonePage.getByRole("button", { name: "Отправить ссылку повторно" }).click();
    await expect(phonePage.getByText("Проверьте почту", { exact: true })).toBeVisible();
  } finally {
    await computer.close();
    await phone.close();
    await removeTestPeople(sql, [email]);
  }
});

test("a link with a part of its characters gone opens «Ссылка устарела»", async ({ page }) => {
  const email = testEmail("login-broken");
  await page.goto("/login");
  await requestLink(page, email);
  const link = new URL(await loginLinkFor(email));
  link.searchParams.set("token", link.searchParams.get("token")!.slice(0, -5));

  await openLink(page, link.toString());

  await expect(page.getByRole("heading", { name: "Ссылка устарела" })).toBeVisible();
  await expect(page.getByLabel("Почта", { exact: true })).toHaveValue(email);
});

test("a logged-in person who opens the login page lands on the home page", async ({ browser }) => {
  const email = testEmail("login-in");
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await signIn(page, email);
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Контакты" })).toBeVisible();
  } finally {
    await context.close();
    await removeTestPeople(sql, [email]);
  }
});

test("the header shows the email, «Выйти» opens the login page and «Назад» does not bring the contacts back", async ({
  browser,
}) => {
  const email = testEmail("login-out");
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await signIn(page, email);
    await expect(page.getByRole("banner").getByText(email)).toBeVisible();

    await page.getByRole("button", { name: "Выйти" }).click();
    await expect(page.getByRole("heading", { name: "Вход в приложение" })).toBeVisible();

    await page.goBack();
    await expect(page.getByRole("heading", { name: "Вход в приложение" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Контакты" })).toHaveCount(0);
  } finally {
    await context.close();
    await removeTestPeople(sql, [email]);
  }
});
