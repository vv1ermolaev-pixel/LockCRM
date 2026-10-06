// Success criteria from specs/01-продуктовая-идея.md:
// 1. Open the app -> the list of all contacts is visible
// 2. Add a contact -> find it by name -> add a note -> the change is saved in the contact card
// 3. Open the same address in another browser -> the same contacts

import { chromium, expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

const suffix = Date.now().toString(36);
const contactName = `Василиса Проверкина-${suffix}`;
const noteText = `Созвонились после конференции, договорились встретиться в пятницу (${suffix})`;
let createdContactId: number | null = null;

async function countContactsInDb() {
  const [row] = await sql<{ count: string }[]>`select count(*) from contacts`;
  return Number(row.count);
}

function contactRows(page: Page) {
  return page.locator('li[id^="contact-"]');
}

async function openOtherBrowser(): Promise<Browser> {
  try {
    return await chromium.launch({ channel: "chrome" });
  } catch {
    // Chrome is not installed: a separate Edge instance still has its own storage
    return await chromium.launch({ channel: "msedge" });
  }
}

test.afterAll(async () => {
  // Remove only the contact this test created (its notes go with it)
  if (createdContactId) {
    await sql`delete from contacts where id = ${createdContactId}`;
  }
  await sql.end();
});

test("main scenario works end to end", async ({ page }) => {
  await test.step("open the app: all contacts are listed", async () => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Контакты" })).toBeVisible();
    await expect(contactRows(page)).toHaveCount(await countContactsInDb());
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
    await expect(contactRows(page)).toHaveCount(await countContactsInDb());
  });

  await test.step("find the contact by name and open the card", async () => {
    const search = page.getByRole("searchbox", { name: "Поиск по имени" });
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
      await otherPage.goto("/");
      await expect(contactRows(otherPage)).toHaveCount(await countContactsInDb());

      await otherPage.getByRole("searchbox", { name: "Поиск по имени" }).fill(contactName);
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
