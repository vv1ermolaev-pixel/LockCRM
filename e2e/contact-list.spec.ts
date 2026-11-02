// The home list in parts of 20 (openspec/specs/contact-list/spec.md).
// The shared database may hold any number of people, so the scenarios run on a group of their own:
// 45 contacts in «Пагинация-<suffix>». The list is split the same way with or without a group

import { chromium, expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

const suffix = Date.now().toString(36);
const groupName = `Пагинация-${suffix}`;
// "… 01" … "… 45": zero-padded numbers sort the same way in any collation
const names = Array.from({ length: 45 }, (_, index) => `Пагинация ${suffix} ${String(index + 1).padStart(2, "0")}`);
// Added on screen in the new contact test: by name it is the 6th in the group
const newName = `Пагинация ${suffix} 05 Новая`;
let groupId = 0;
let contactIds: number[] = [];

function contactRows(page: Page) {
  return page.locator('li[id^="contact-"]');
}

async function countContactsInDb() {
  const [row] = await sql<{ count: string }[]>`select count(*) from contacts`;
  return Number(row.count);
}

function groupFilter(page: Page) {
  return page.getByRole("navigation", { name: "Фильтр по группам" });
}

function searchBox(page: Page) {
  return page.getByRole("searchbox", { name: "Поиск по контактам" });
}

function showMore(page: Page) {
  return page.getByRole("button", { name: "Показать ещё" });
}

async function openOtherBrowser(): Promise<Browser> {
  try {
    return await chromium.launch({ channel: "chrome" });
  } catch {
    // Chrome is not installed: a separate Edge instance still has its own storage
    return await chromium.launch({ channel: "msedge" });
  }
}

// A press counts only once React has taken over the server markup; before that it is lost. Mounting also runs
// effects that may scroll the page (the group filter brings the chosen group into view), which would move
// the button from under a press: so the rows must be React's, and two frames must pass for the effects
async function openList(page: Page, url: string) {
  await page.goto(url);
  await expect
    .poll(() =>
      contactRows(page)
        .first()
        .evaluate((row) => Object.keys(row).some((key) => key.startsWith("__reactFiber$"))),
    )
    .toBe(true);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)))),
  );
}

test.beforeAll(async () => {
  const [group] = await sql<{ id: number }[]>`
    insert into groups (name, color, position)
    values (${groupName}, 'gray', (select coalesce(max(position), 0) + 1 from groups))
    returning id
  `;
  groupId = group.id;
  const contacts = await sql<{ id: number }[]>`
    insert into contacts ${sql(names.map((name) => ({ name })))} returning id
  `;
  contactIds = contacts.map(({ id }) => id);
  await sql`insert into contact_groups ${sql(contactIds.map((id) => ({ contact_id: id, group_id: groupId })))}`;
});

test.afterAll(async () => {
  // Remove only what this file created; group membership goes with the contacts and the group
  await sql`delete from contacts where name like ${`Пагинация ${suffix} %`}`;
  await sql`delete from groups where id = ${groupId}`;
  await sql.end();
});

test("«Показать ещё» adds the next 20 below the first 20 and the page stays where it was", async ({ page }) => {
  await openList(page, `/?group=${groupId}`);
  await expect(contactRows(page)).toHaveCount(20);
  await expect(contactRows(page).first()).toContainText(names[0]);

  await showMore(page).scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await showMore(page).click();

  await expect(contactRows(page)).toHaveCount(40);
  await expect(contactRows(page).nth(0)).toContainText(names[0]);
  await expect(contactRows(page).nth(19)).toContainText(names[19]);
  await expect(contactRows(page).nth(20)).toContainText(names[20]);
  await expect(contactRows(page).nth(39)).toContainText(names[39]);
  await expect(showMore(page)).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
});

test("the last «Показать ещё» shows all 45 and the button goes", async ({ page }) => {
  await openList(page, `/?group=${groupId}&page=2`);
  await expect(contactRows(page)).toHaveCount(40);

  await showMore(page).click();

  await expect(contactRows(page)).toHaveCount(45);
  await expect(contactRows(page).last()).toContainText(names[44]);
  await expect(showMore(page)).toHaveCount(0);
});

test("a quick double press of «Показать ещё» adds one part, not two", async ({ page }) => {
  await openList(page, `/?group=${groupId}`);
  await expect(contactRows(page)).toHaveCount(20);

  await showMore(page).dblclick();

  await expect(contactRows(page)).toHaveCount(40);
  await expect(page).toHaveURL(/[?&]page=2(&|$)/);
  await expect(showMore(page)).toBeVisible();
  await expect(showMore(page)).not.toHaveAttribute("aria-disabled", "true");
  await expect(contactRows(page)).toHaveCount(40);
});

test("from the keyboard: Tab to «Показать ещё», Enter adds 20, the focus stays on the button", async ({ page }) => {
  await openList(page, `/?group=${groupId}`);
  await expect(contactRows(page)).toHaveCount(20);

  await contactRows(page).last().getByRole("link").focus();
  await page.keyboard.press("Tab");
  await expect(showMore(page)).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(contactRows(page)).toHaveCount(40);
  await expect(showMore(page)).toBeFocused();
});

test("from the keyboard, the last part: the button goes and the focus is on the 41st contact", async ({ page }) => {
  await openList(page, `/?group=${groupId}&page=2`);
  await expect(contactRows(page)).toHaveCount(40);

  await showMore(page).focus();
  await page.keyboard.press("Enter");

  await expect(contactRows(page)).toHaveCount(45);
  await expect(showMore(page)).toHaveCount(0);
  await expect(contactRows(page).nth(40).getByRole("link")).toBeFocused();
  await expect(contactRows(page).nth(40)).toContainText(names[40]);
});

test.describe("a new list starts again from the first 20", () => {
  test("choosing a group after 60 rows of the whole list shows the first 20 of the group", async ({ page }) => {
    await openList(page, "/?page=3");
    await expect(contactRows(page)).toHaveCount(Math.min(60, await countContactsInDb()));

    await groupFilter(page).getByRole("link", { name: groupName }).click();

    await expect(page).toHaveURL(new RegExp(`[?&]group=${groupId}`));
    await expect(page).not.toHaveURL(/[?&]page=/);
    await expect(contactRows(page)).toHaveCount(20);
    await expect(contactRows(page).first()).toContainText(names[0]);
  });

  test("«Все» after 40 rows of the group shows the first 20 of the whole list", async ({ page }) => {
    await openList(page, `/?group=${groupId}&page=2`);
    await expect(contactRows(page)).toHaveCount(40);

    await groupFilter(page).getByRole("link", { name: "Все" }).click();

    await expect(page).not.toHaveURL(/[?&](group|page)=/);
    await expect(contactRows(page)).toHaveCount(Math.min(20, await countContactsInDb()));
  });

  test("starting a search after 60 rows shows the first 20 found", async ({ page }) => {
    await openList(page, "/?page=3");

    await searchBox(page).fill(`Пагинация ${suffix}`);

    await expect(page).toHaveURL(/[?&]q=/);
    await expect(page).not.toHaveURL(/[?&]page=/);
    await expect(contactRows(page)).toHaveCount(20);
    await expect(contactRows(page).first()).toContainText(names[0]);
    await expect(showMore(page)).toBeVisible();
  });

  test("clearing the search after 40 found shows the first 20 of the whole list", async ({ page }) => {
    await openList(page, `/?q=${encodeURIComponent(`Пагинация ${suffix}`)}&page=2`);
    await expect(contactRows(page)).toHaveCount(40);

    await page.getByRole("button", { name: "Очистить поиск" }).click();

    await expect(page).not.toHaveURL(/[?&](q|page)=/);
    await expect(contactRows(page)).toHaveCount(Math.min(20, await countContactsInDb()));
  });
});

test.describe("how many are shown is kept in the address", () => {
  test("a reload keeps the rows shown after «Показать ещё»", async ({ page }) => {
    await openList(page, `/?group=${groupId}`);
    await showMore(page).click();
    await expect(contactRows(page)).toHaveCount(40);

    await page.reload();

    await expect(contactRows(page)).toHaveCount(40);
  });

  test("«Все контакты» on the card of the 55th of 60 brings back the same 60", async ({ page }) => {
    const shown = Math.min(60, await countContactsInDb());
    await openList(page, "/?page=3");
    await expect(contactRows(page)).toHaveCount(shown);

    // The 55th, or the last one when the database has fewer people
    await contactRows(page)
      .nth(Math.min(55, shown) - 1)
      .getByRole("link")
      .click();
    await expect(page).toHaveURL(/\/contacts\/\d+/);
    await page.getByRole("link", { name: "Все контакты", exact: true }).click();

    await expect(page).toHaveURL(/\/\?page=3$/);
    await expect(contactRows(page)).toHaveCount(shown);
  });

  test("«Назад» in the browser from the card of the 55th of 60 brings back the same 60", async ({ page }) => {
    const shown = Math.min(60, await countContactsInDb());
    await openList(page, "/?page=3");
    await expect(contactRows(page)).toHaveCount(shown);

    await contactRows(page)
      .nth(Math.min(55, shown) - 1)
      .getByRole("link")
      .click();
    await expect(page).toHaveURL(/\/contacts\/\d+/);
    await page.goBack();

    await expect(page).toHaveURL(/\/\?page=3$/);
    await expect(contactRows(page)).toHaveCount(shown);
  });

  test("«Все контакты» on a card opened from 40 rows of the group brings back the group and the 40", async ({
    page,
  }) => {
    await openList(page, `/?group=${groupId}&page=2`);
    await contactRows(page).nth(35).getByRole("link").click();
    await expect(page.getByRole("heading", { level: 1, name: names[35] })).toBeVisible();

    await page.getByRole("link", { name: "Все контакты", exact: true }).click();

    await expect(groupFilter(page).getByRole("link", { name: groupName })).toHaveAttribute("aria-current", "true");
    await expect(contactRows(page)).toHaveCount(40);
  });

  test("a copied address opens the same rows in another browser", async ({ page }) => {
    await openList(page, `/?group=${groupId}`);
    await showMore(page).click();
    await expect(contactRows(page)).toHaveCount(40);
    const address = page.url();

    const otherBrowser = await openOtherBrowser();
    try {
      const otherPage = await otherBrowser.newPage();
      await otherPage.goto(address);
      await expect(contactRows(otherPage)).toHaveCount(40);
      await expect(contactRows(otherPage).nth(39)).toContainText(names[39]);
    } finally {
      await otherBrowser.close();
    }
  });

  test("«Назад» in the browser after two «Показать ещё» leaves the home page", async ({ page }) => {
    await page.goto(`/contacts/${contactIds[0]}`);
    await openList(page, `/?group=${groupId}`);
    await showMore(page).click();
    await expect(contactRows(page)).toHaveCount(40);
    await showMore(page).click();
    await expect(contactRows(page)).toHaveCount(45);

    await page.goBack();

    await expect(page).toHaveURL(new RegExp(`/contacts/${contactIds[0]}$`));
  });
});

test("a new contact is the first row, survives a reload and goes to its place after a search, a group or the card", async ({
  page,
}) => {
  let newId = 0;

  await test.step("add a contact in the group: it is the first row, marked «Новый»", async () => {
    await openList(page, "/");
    await page.getByRole("button", { name: "Добавить контакт" }).click();
    const dialog = page.getByRole("dialog", { name: "Новый контакт" });
    await dialog.getByLabel("Имя").fill(newName);
    const groupToggle = dialog.getByRole("group", { name: "Группы" }).getByRole("button", { name: groupName });
    await groupToggle.click();
    await expect(groupToggle).toHaveAttribute("aria-pressed", "true");
    await dialog.getByRole("button", { name: "Добавить" }).click();
    await expect(dialog).toBeHidden();

    await expect(page).toHaveURL(/[?&]added=\d+/);
    newId = Number(new URL(page.url()).searchParams.get("added"));
    await expect(contactRows(page).first()).toContainText(newName);
    await expect(contactRows(page).first()).toContainText("Новый");
    await expect(contactRows(page).filter({ hasText: newName })).toHaveCount(1);
  });

  await test.step("a reload keeps it first, marked «Новый»", async () => {
    await page.reload();
    await expect(contactRows(page).first()).toContainText(newName);
    await expect(contactRows(page).first()).toContainText("Новый");
  });

  await test.step("a search puts it in its place, without «Новый»", async () => {
    await searchBox(page).fill(`Пагинация ${suffix}`);
    await expect(page).not.toHaveURL(/[?&]added=/);
    await expect(contactRows(page).nth(5)).toContainText(newName);
    await expect(contactRows(page).filter({ hasText: "Новый" })).toHaveCount(0);
  });

  await test.step("choosing the group puts it in its place, without «Новый»", async () => {
    await openList(page, `/?added=${newId}`);
    await expect(contactRows(page).first()).toContainText(newName);

    await groupFilter(page).getByRole("link", { name: groupName }).click();

    await expect(page).not.toHaveURL(/[?&]added=/);
    await expect(contactRows(page).nth(5)).toContainText(newName);
    await expect(contactRows(page).filter({ hasText: "Новый" })).toHaveCount(0);
  });

  await test.step("«Все контакты» on its card puts it in its place, without «Новый»", async () => {
    await openList(page, `/?added=${newId}`);
    await contactRows(page).first().getByRole("link").click();
    await expect(page.getByRole("heading", { level: 1, name: newName })).toBeVisible();

    await page.getByRole("link", { name: "Все контакты", exact: true }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(contactRows(page).first()).not.toContainText(newName);
    await expect(contactRows(page).filter({ hasText: "Новый" })).toHaveCount(0);
  });
});

test("a contact due in «Пора связаться» past the first 20 is in the list after «Показать ещё»", async ({ page }) => {
  // The 30th of the group is a week overdue: a due date in the past cannot be set on screen
  await sql`
    update contacts set contact_frequency = 'week', created_at = now() - interval '14 days'
    where id = ${contactIds[29]}
  `;

  await openList(page, `/?group=${groupId}`);
  await expect(
    page.getByRole("region", { name: "Пора связаться" }).getByRole("listitem").filter({ hasText: names[29] }),
  ).toBeVisible();
  await expect(contactRows(page).filter({ hasText: names[29] })).toHaveCount(0);

  await showMore(page).click();

  // In its place by name: right after the 29th. Not by position: the new contact test may add one more to the group
  await expect(contactRows(page).filter({ hasText: names[29] })).toHaveCount(1);
  await expect(page.locator(`li:has(+ #contact-${contactIds[29]})`)).toContainText(names[28]);
});
