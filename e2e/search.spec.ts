// Search finds a contact by any of its fields or notes, words may match different fields,
// and the list shows why a contact was found when its row doesn't make it obvious

import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

const suffix = Date.now().toString(36);
const tail = String(Date.now()).slice(-7);
// Test data phones all start with +7 9, so this one is unique
const phone = `+7 812 ${tail.slice(0, 3)}-${tail.slice(3, 5)}-${tail.slice(5)}`;
const surname = `Искомова-${suffix}`;
const trip = `Эльбрус-${suffix}`;
const wine = `саперави-${suffix}`;
// Has an "8", like the phone query below: digits of a phone query must not be marked in the email
const email = `glafira8.${suffix}@example.com`;
// Has every field filled
let foundId = 0;
// Comes first alphabetically and only mentions the first contact in a note
let mentionId = 0;

function rows(page: Page) {
  return page.locator('li[id^="contact-"]');
}

function row(page: Page, id: number) {
  return page.locator(`#contact-${id}`);
}

// The "why it was found" line under the name, e.g. "Заметка: …"
function matchLine(page: Page, id: number, label: string) {
  return row(page, id).locator("p", { hasText: `${label}:` });
}

async function search(page: Page, query: string) {
  await page.getByRole("searchbox", { name: "Поиск по контактам" }).fill(query);
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe(query);
}

test.beforeAll(async () => {
  const [found] = await sql<{ id: number }[]>`
    insert into contacts (name, about, how_we_met, phone, email)
    values (${`Глафира ${surname}`}, 'Сомелье', ${`Ходили вместе на ${trip} в 2022`}, ${phone}, ${email})
    returning id
  `;
  foundId = found.id;
  const longNote = `${"Строка-заполнитель. ".repeat(12)}\nОбещала привезти ${wine} к пятнице.`;
  await sql`
    insert into notes (contact_id, body, created_at)
    values (${foundId}, 'Короткая старая заметка', now() - interval '30 days'), (${foundId}, ${longNote}, now())
  `;

  const [mention] = await sql<{ id: number }[]>`
    insert into contacts (name) values (${`Аврора Сводная-${suffix}`}) returning id
  `;
  mentionId = mention.id;
  await sql`insert into notes (contact_id, body) values (${mentionId}, ${`Познакомила с Глафирой (${surname})`})`;
});

test.afterAll(async () => {
  // Remove only the contacts this test created (their notes go with them)
  const ids = [foundId, mentionId].filter(Boolean);
  if (ids.length > 0) {
    await sql`delete from contacts where id in ${sql(ids)}`;
  }
  await sql.end();
});

test("search finds contacts by any field and shows why", async ({ page }) => {
  await page.goto("/");

  await test.step("words from the name and «Кто это»: no extra line, both marked", async () => {
    await search(page, `${surname.toUpperCase()} сомелье`);
    await expect(rows(page)).toHaveCount(1);
    await expect(row(page, foundId).locator("mark", { hasText: surname })).toBeVisible();
    await expect(row(page, foundId).locator("mark", { hasText: "Сомелье" })).toBeVisible();
    await expect(row(page, foundId).locator("p", { hasText: /^(Заметка|Откуда знакомы|Телефон|Почта):/ })).toHaveCount(
      0,
    );
  });

  await test.step("a word from «Откуда знакомы» shows that line", async () => {
    await search(page, `сомелье ${trip.toLowerCase()}`);
    await expect(rows(page)).toHaveCount(1);
    await expect(matchLine(page, foundId, "Откуда знакомы")).toContainText(trip);
    await expect(matchLine(page, foundId, "Откуда знакомы").locator("mark", { hasText: trip })).toBeVisible();
  });

  await test.step("a word from the end of a long note shows the piece around it", async () => {
    await search(page, wine);
    await expect(rows(page)).toHaveCount(1);
    const line = matchLine(page, foundId, "Заметка");
    await expect(line).toContainText(`…Обещала привезти ${wine}`);
    await expect(line).not.toContainText("Короткая старая");
    await expect(line.locator("mark", { hasText: wine })).toBeVisible();
  });

  await test.step("name matches come before note matches", async () => {
    await search(page, surname);
    await expect(rows(page)).toHaveCount(2);
    await expect(rows(page).nth(0)).toHaveId(`contact-${foundId}`);
    await expect(rows(page).nth(1)).toHaveId(`contact-${mentionId}`);
    await expect(matchLine(page, mentionId, "Заметка")).toContainText(surname);
  });

  await test.step("phone typed differently: the line on a phone, the mark on the right on a wide screen", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await search(page, `8 (812) ${tail}`);
    await expect(rows(page)).toHaveCount(1);
    await expect(matchLine(page, foundId, "Телефон")).toBeVisible();
    await expect(matchLine(page, foundId, "Телефон")).toContainText(phone);

    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(matchLine(page, foundId, "Телефон")).toBeHidden();
    const marks = row(page, foundId).locator("mark").filter({ visible: true });
    await expect(marks).toHaveCount(1);
    await expect(marks).toContainText(tail.slice(0, 3));
  });

  await test.step("email in another case", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await search(page, `GLAFIRA8.${suffix.toUpperCase()}`);
    await expect(rows(page)).toHaveCount(1);
    await expect(matchLine(page, foundId, "Почта")).toContainText(email);
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  await test.step("special characters are searched as plain text", async () => {
    await search(page, "%_\\");
    await expect(page.getByText("Никого не нашли по запросу «%_\\»")).toBeVisible();
  });
});
