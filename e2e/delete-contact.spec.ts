// Delete a contact from its card: the confirmation names the contact and its notes,
// "Cancel" keeps everything, "Delete" removes the contact with its notes and opens the list

import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

import { createTestPerson, removeTestPeople, type TestPerson } from "./sign-in";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

const suffix = Date.now().toString(36);
const contactName = `Удалямир Проверкин-${suffix}`;
let contactId: number | null = null;
let person: TestPerson;

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

test.beforeAll(async ({ browser }) => {
  person = await createTestPerson(browser, sql, "delete");
  const [contact] = await sql<{ id: number }[]>`
    insert into contacts (owner_id, name, about)
    values (${person.ownerId}, ${contactName}, 'Тестовый контакт для удаления') returning id
  `;
  contactId = contact.id;
  await sql`
    insert into notes (contact_id, body)
    values (${contactId}, 'Первая заметка'), (${contactId}, 'Вторая заметка')
  `;
});

test.beforeEach(async ({ context }) => {
  await context.addCookies(person.cookies);
});

test.afterAll(async () => {
  // The test deletes the contact itself; this removes the person with everything left if it failed earlier
  await removeTestPeople(sql, [person.email]);
  await sql.end();
});

test("delete a contact from its card", async ({ page }) => {
  await test.step("cancel keeps the contact", async () => {
    await page.goto(`/contacts/${contactId}`);
    await page.getByRole("button", { name: "Удалить" }).click();

    const dialog = page.getByRole("dialog", { name: "Удалить контакт?" });
    await expect(dialog).toContainText(`Контакт «${contactName}» удалится насовсем вместе с 2 заметками.`);
    await dialog.getByRole("button", { name: "Отмена" }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByRole("heading", { level: 1, name: contactName })).toBeVisible();
  });

  await test.step("delete removes the contact and opens the list", async () => {
    await page.getByRole("button", { name: "Удалить" }).click();
    const dialog = page.getByRole("dialog", { name: "Удалить контакт?" });
    await dialog.getByRole("button", { name: "Удалить" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText(`Контакт «${contactName}» удалён`)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Контакты" })).toBeVisible();
    await expectFirstPart(page);
    // Gone from the list. Looked up by the unique name: a row past the first 20 is not on the page anyway.
    // In an empty database (as in CI) there is no search, and the list says there is nobody
    if ((await countContactsInDb()) === 0) {
      await expect(page.getByText("Пока нет ни одного контакта")).toBeVisible();
    } else {
      await page.getByRole("searchbox", { name: "Поиск по контактам" }).fill(contactName);
      await expect(page.getByText(`Никого не нашли по запросу «${contactName}»`)).toBeVisible();
      await expect(contactRows(page)).toHaveCount(0);
    }
  });

  await test.step("the contact and its notes are gone from the database", async () => {
    const contacts = await sql`select id from contacts where id = ${contactId}`;
    const notes = await sql`select id from notes where contact_id = ${contactId}`;
    expect(contacts).toHaveLength(0);
    expect(notes).toHaveLength(0);
  });

  await test.step("the old link shows that the contact is gone", async () => {
    await page.goto(`/contacts/${contactId}`);
    await expect(page.getByText("Такого контакта нет")).toBeVisible();
    await expect(page.getByText("Возможно, ссылка неверная или контакт удалён.")).toBeVisible();
  });
});
