// The whole way of a password in one test, as a person walks it: the login by the link, the first password
// in the settings, the login by password, «Забыли пароль?», and a change of the email

import { expect, test } from "@playwright/test";
import postgres from "postgres";

import { emailLinkFor, openLink, removeTestPeople, signIn, testEmail } from "./sign-in";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

const email = testEmail("password");
const newEmail = testEmail("password-new");
const firstPassword = "первый длинный пароль";
const secondPassword = "второй длинный пароль";

test.afterAll(async () => {
  await removeTestPeople(sql, [email, newEmail]);
  await sql.end();
});

test("a password from the first one to a change of the email", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  const logOut = async () => {
    await page.getByRole("button", { name: "Выйти" }).click();
    await expect(page.getByRole("heading", { name: "Вход в приложение" })).toBeVisible();
  };
  const logIn = async (address: string, password: string) => {
    await page.getByLabel("Почта", { exact: true }).fill(address);
    await page.getByLabel("Пароль", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Войти", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Контакты" })).toBeVisible();
  };

  await test.step("the tab of the link is open at first", async () => {
    await page.goto("/login");
    await expect(page.getByRole("tab", { name: "Вход по ссылке" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: "Почта и пароль" })).toHaveAttribute("aria-selected", "false");
  });

  await test.step("a login by the link, the email in the header opens the settings", async () => {
    await signIn(page, email);
    await page.getByRole("banner").getByRole("link", { name: email }).click();
    await expect(page.getByRole("heading", { name: "Настройки" })).toBeVisible();
    await expect(page.getByText("Чтобы сменить почту, сначала задайте пароль")).toBeVisible();
  });

  await test.step("the first password is saved", async () => {
    await expect(page.getByRole("heading", { name: "Задать пароль" })).toBeVisible();
    await page.getByLabel("Новый пароль", { exact: true }).fill(firstPassword);
    await page.getByRole("button", { name: "Сохранить пароль" }).click();
    await expect(page.getByText("Пароль сохранён")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Сменить пароль" })).toBeVisible();
  });

  await test.step("the password changes and the person stays on the page", async () => {
    await page.getByLabel("Текущий пароль", { exact: true }).last().fill(firstPassword);
    await page.getByLabel("Новый пароль", { exact: true }).fill(secondPassword);
    await page.getByRole("button", { name: "Сменить пароль" }).click();
    await expect(page.getByText("Пароль изменён")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Настройки" })).toBeVisible();
    await page.getByLabel("Текущий пароль", { exact: true }).last().fill(secondPassword);
    await page.getByLabel("Новый пароль", { exact: true }).fill(firstPassword);
    await page.getByRole("button", { name: "Сменить пароль" }).click();
    await expect(page.getByLabel("Новый пароль", { exact: true })).toHaveValue("");
  });

  await test.step("the password lets in after logging out", async () => {
    await logOut();
    const tab = page.getByRole("tab", { name: "Почта и пароль" });
    // A click before the page comes alive is lost: the dev server is slow at that
    await expect(async () => {
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 1_000 });
    }).toPass();
    await logIn(email, firstPassword);
  });

  await test.step("the browser remembers the tab", async () => {
    await logOut();
    await expect(page.getByRole("tab", { name: "Почта и пароль" })).toHaveAttribute("aria-selected", "true");
  });

  await test.step("«Забыли пароль?» sends a link, and it gives a new password", async () => {
    await page.getByLabel("Почта", { exact: true }).fill(email);
    await page.getByRole("button", { name: "Забыли пароль?" }).click();
    await expect(page.getByRole("heading", { name: "Забыли пароль?" })).toBeVisible();
    await expect(page.getByLabel("Почта", { exact: true })).toHaveValue(email);
    await page.getByRole("button", { name: "Получить ссылку для смены пароля" }).click();
    await expect(page.getByText("Проверьте почту", { exact: true })).toBeVisible();

    await openLink(page, await emailLinkFor(email, "Смена пароля в Личной CRM"));
    await expect(page.getByRole("heading", { name: "Новый пароль" })).toBeVisible();
    await page.getByLabel("Новый пароль", { exact: true }).fill(secondPassword);
    await page.getByRole("button", { name: "Сохранить пароль" }).click();

    await expect(page.getByText("Пароль изменён. Войдите с новым паролем.")).toBeVisible();
    await logIn(email, secondPassword);
  });

  await test.step("the email changes by the link sent to the new address", async () => {
    await page.getByRole("banner").getByRole("link", { name: email }).click();
    await page.getByLabel("Новая почта").fill(newEmail);
    await page
      .getByRole("form", { name: "Смена почты" })
      .getByLabel("Текущий пароль", { exact: true })
      .fill(secondPassword);
    await page.getByRole("button", { name: "Сменить почту" }).click();
    await expect(page.getByText(`Отправили ссылку на ${newEmail}.`)).toBeVisible();

    await openLink(page, await emailLinkFor(newEmail, "Смена почты в Личной CRM"));
    await expect(page.getByText("Почта изменена")).toBeVisible();
    await expect(page.getByRole("banner").getByText(newEmail)).toBeVisible();
  });

  await test.step("the new email lets in with the password", async () => {
    await logOut();
    await logIn(newEmail, secondPassword);
    await expect(page.getByRole("banner").getByText(newEmail)).toBeVisible();
  });

  await context.close();
});
