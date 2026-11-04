// Success criteria from specs/01-продуктовая-идея.md:
// 1. Open the app -> the list of contacts is visible, the rest behind «Показать ещё»
// 2. Add a contact -> find it by name -> add a note -> the change is saved in the contact card
// 3. Open the same address in another browser -> the same contacts

import { chromium, expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";

import { createTestPerson, removeTestPeople, signIn, type TestPerson } from "./sign-in";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

let person: TestPerson;

const suffix = Date.now().toString(36);
const contactName = `Василиса Проверкина-${suffix}`;
const noteText = `Созвонились после конференции, договорились встретиться в пятницу (${suffix})`;
let createdContactId: number | null = null;

async function countContactsInDb() {
  const [row] = await sql<{ count: string }[]>`select count(*) from contacts where owner_id = ${person.ownerId}`;
  return Number(row.count);
}

function contactRows(page: Page) {
  return page.locator('li[id^="contact-"]');
}

// The home list shows the first 20 by name; the rest are behind «Показать ещё»
async function expectFirstPart(page: Page) {
  const total = await countContactsInDb();
  await expect(contactRows(page)).toHaveCount(Math.min(20, total));
  await expect(page.getByRole("button", { name: "Показать ещё" })).toHaveCount(total > 20 ? 1 : 0);
}

async function openOtherBrowser(): Promise<Browser> {
  try {
    return await chromium.launch({ channel: "chrome" });
  } catch {
    // Chrome is not installed: a separate Edge instance still has its own storage
    return await chromium.launch({ channel: "msedge" });
  }
}

test.beforeAll(async ({ browser }) => {
  person = await createTestPerson(browser, sql, "main");
});

test.beforeEach(async ({ context }) => {
  await context.addCookies(person.cookies);
});

test.afterAll(async () => {
  // Remove only what this test created: the person with their contact (its notes go with it)
  await removeTestPeople(sql, [person.email]);
  await sql.end();
});

test("main scenario works end to end", async ({ page }) => {
  await test.step("open the app: the first 20 contacts are listed, the rest behind «Показать ещё»", async () => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Контакты" })).toBeVisible();
    await expectFirstPart(page);
  });

  await test.step("adding without a name shows an error", async () => {
    await page.getByRole("button", { name: "Добавить контакт" }).click();
    const dialog = page.getByRole("dialog", { name: "Новый контакт" });
    await dialog.getByRole("button", { name: "Добавить" }).click();
    await expect(dialog.getByText("Укажите имя")).toBeVisible();
  });

  await test.step("add a contact: it appears in the list", async () => {
    const dialog = page.getByRole("dialog", { name: "Новый контакт" });
    await dialog.getByLabel("Имя").fill(contactName);
    await dialog.getByLabel("Кто это").fill("Организатор конференции");
    await dialog.getByLabel("Откуда знакомы").fill("Познакомились на конференции в Казани");
    await dialog.getByLabel("Телефон").fill("+7 900 111-22-33");
    await dialog.getByLabel("Почта").fill("vasilisa@example.com");
    await dialog.getByRole("button", { name: "Добавить" }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByText(`Контакт «${contactName}» добавлен`)).toBeVisible();
    const newRow = contactRows(page).filter({ hasText: contactName });
    await expect(newRow).toBeVisible();
    await expect(newRow).toContainText("Новый");
    // It is the first row, above the first 20 others, and not again among them
    await expect(contactRows(page).first()).toContainText(contactName);
    await expect(contactRows(page)).toHaveCount(1 + Math.min(20, (await countContactsInDb()) - 1));
    await expect(newRow).toHaveCount(1);
  });

  await test.step("find the contact by name and open the card", async () => {
    const search = page.getByRole("searchbox", { name: "Поиск по контактам" });
    // Different case and word order on purpose
    await search.fill(`ПРОВЕРКИНА-${suffix} василиса`);
    await expect(page).toHaveURL(/\?q=/);
    await expect(contactRows(page)).toHaveCount(1);
    await contactRows(page).getByRole("link").click();

    await expect(page.getByRole("heading", { level: 1, name: contactName })).toBeVisible();
    createdContactId = Number(new URL(page.url()).pathname.split("/").pop());
    expect(createdContactId).toBeGreaterThan(0);
  });

  await test.step("add a note: it is saved in the card", async () => {
    await page.getByRole("button", { name: "Добавить заметку" }).click();
    await expect(page.getByText("Заметка пустая")).toBeVisible();

    await page.getByLabel("Новая заметка").fill(noteText);
    await page.getByRole("button", { name: "Добавить заметку" }).click();
    await expect(page.getByText("Заметка сохранена")).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: noteText })).toBeVisible();
    await expect(page.getByLabel("Новая заметка")).toHaveValue("");

    await page.reload();
    await expect(page.getByRole("listitem").filter({ hasText: noteText })).toBeVisible();
  });

  await test.step("edit the contact: changes are saved", async () => {
    await page.getByRole("button", { name: "Изменить" }).click();
    const dialog = page.getByRole("dialog", { name: "Изменить контакт" });
    await dialog.getByLabel("Телефон").fill("+7 900 444-55-66");
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Изменения сохранены")).toBeVisible();
    await expect(page.getByRole("link", { name: "+7 900 444-55-66" })).toBeVisible();
  });

  await test.step("another browser sees the same contacts and the note", async () => {
    const otherBrowser = await openOtherBrowser();
    try {
      const otherPage = await otherBrowser.newPage({ baseURL: test.info().project.use.baseURL });
      // Another browser has no login: the same person logs in there under the same email
      await signIn(otherPage, person.email);
      await expectFirstPart(otherPage);

      await otherPage.getByRole("searchbox", { name: "Поиск по контактам" }).fill(contactName);
      // Wait for the search to apply: in a database with only this contact the list has one row before it does,
      // and a late search would bring the page back from the card to the list
      await expect(otherPage).toHaveURL(/\?q=/);
      await expect(contactRows(otherPage)).toHaveCount(1);
      await contactRows(otherPage).getByRole("link").click();

      await expect(otherPage.getByRole("heading", { level: 1, name: contactName })).toBeVisible();
      await expect(otherPage.getByText("Организатор конференции")).toBeVisible();
      await expect(otherPage.getByText("+7 900 444-55-66")).toBeVisible();
      await expect(otherPage.getByRole("listitem").filter({ hasText: noteText })).toBeVisible();
    } finally {
      await otherBrowser.close();
    }
  });
});
