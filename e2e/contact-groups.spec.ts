// Main path of contact groups (openspec/specs/contact-groups/spec.md):
// create a group in the "Группы" window -> add a contact to it -> filter the list by the group;
// the filter survives a reload and the way back from the card, another browser sees the same group

import { chromium, expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

const suffix = Date.now().toString(36);
const groupName = `Теннис ${suffix}`;
const memberName = `Анна Ракеткина-${suffix}`;
const outsiderName = `Борис Безгруппов-${suffix}`;

function contactRows(page: Page) {
  return page.locator('li[id^="contact-"]');
}

function groupFilter(page: Page) {
  return page.getByRole("navigation", { name: "Фильтр по группам" });
}

async function openOtherBrowser(): Promise<Browser> {
  try {
    return await chromium.launch({ channel: "chrome" });
  } catch {
    // Chrome is not installed: a separate Edge instance still has its own storage
    return await chromium.launch({ channel: "msedge" });
  }
}

async function addContact(page: Page, name: string, withGroup: boolean) {
  await page.getByRole("button", { name: "Добавить контакт" }).click();
  const dialog = page.getByRole("dialog", { name: "Новый контакт" });
  await dialog.getByLabel("Имя").fill(name);
  if (withGroup) {
    const groupToggle = dialog.getByRole("group", { name: "Группы" }).getByRole("button", { name: groupName });
    await groupToggle.click();
    await expect(groupToggle).toHaveAttribute("aria-pressed", "true");
  }
  await dialog.getByRole("button", { name: "Добавить" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(`Контакт «${name}» добавлен`)).toBeVisible();
  // The app then opens the whole list with the new contact highlighted; a click before that re-render is lost
  await expect(page).toHaveURL(/[?&]added=\d+/);
  await expect(contactRows(page).filter({ hasText: name })).toContainText("Новый");
}

test.afterAll(async () => {
  // Remove only what this test created; group membership goes with the contacts and the group
  await sql`delete from contacts where name in (${memberName}, ${outsiderName})`;
  await sql`delete from groups where name = ${groupName}`;
  await sql.end();
});

test("contact groups: create, add a contact, filter the list", async ({ page }) => {
  // The group filter with its "Группы" button is shown only when there are contacts: in an empty database
  // (as in CI) it appears after this one
  await test.step("add a contact without groups", async () => {
    await page.goto("/");
    await addContact(page, outsiderName, false);
  });

  await test.step("create a group in the Группы window: it is last, with 0 people", async () => {
    await page.getByRole("button", { name: "Группы" }).click();
    const dialog = page.getByRole("dialog", { name: "Группы" });
    await dialog.getByLabel("Новая группа").fill(groupName);
    await dialog.getByRole("button", { name: "Добавить" }).click();

    const newRow = dialog.getByRole("listitem").last();
    await expect(newRow).toContainText(groupName);
    await expect(newRow).toContainText("· 0 человек");
    await expect(dialog.getByLabel("Новая группа")).toHaveValue("");

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(groupFilter(page).getByRole("link").last()).toHaveText(groupName);
  });

  await test.step("add a contact to the group", async () => {
    await addContact(page, memberName, true);

    await expect(contactRows(page).filter({ hasText: memberName })).toContainText(groupName);
    await expect(contactRows(page).filter({ hasText: outsiderName })).not.toContainText(groupName);
  });

  await test.step("choose the group in the filter: only its people are listed", async () => {
    const groupLink = groupFilter(page).getByRole("link", { name: groupName, exact: true });
    await groupLink.click();

    await expect(page).toHaveURL(/[?&]group=\d+/);
    await expect(groupLink).toHaveAttribute("aria-current", "true");
    await expect(page.getByText(`В группе «${groupName}» — 1 контакт`)).toBeVisible();
    await expect(contactRows(page)).toHaveCount(1);
    await expect(contactRows(page)).toContainText(memberName);
  });

  await test.step("the filter survives a reload", async () => {
    await page.reload();
    await expect(groupFilter(page).getByRole("link", { name: groupName, exact: true })).toHaveAttribute(
      "aria-current",
      "true",
    );
    await expect(contactRows(page)).toHaveCount(1);
    await expect(contactRows(page)).toContainText(memberName);
  });

  await test.step("the card shows the group, and the way back keeps the filter", async () => {
    await contactRows(page).getByRole("link").click();
    await expect(page.getByRole("heading", { level: 1, name: memberName })).toBeVisible();
    const groupsDetail = page
      .locator("div")
      .filter({ has: page.locator("dt", { hasText: /^Группы$/ }) })
      .last();
    await expect(groupsDetail.locator("dd")).toHaveText(groupName);

    await page.getByRole("link", { name: "Все контакты", exact: true }).click();
    await expect(page).toHaveURL(/[?&]group=\d+/);
    await expect(contactRows(page)).toHaveCount(1);
    await expect(contactRows(page)).toContainText(memberName);
  });

  await test.step("the Группы window counts 1 person in the group", async () => {
    await page.getByRole("button", { name: "Группы" }).click();
    const dialog = page.getByRole("dialog", { name: "Группы" });
    await expect(dialog.getByRole("listitem").filter({ hasText: groupName })).toContainText("· 1 человек");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  await test.step("another browser sees the same group with the contact in it", async () => {
    const otherBrowser = await openOtherBrowser();
    try {
      const otherPage = await otherBrowser.newPage({ baseURL: test.info().project.use.baseURL });
      await otherPage.goto("/");
      await groupFilter(otherPage).getByRole("link", { name: groupName, exact: true }).click();
      await expect(otherPage).toHaveURL(/[?&]group=\d+/);
      await expect(contactRows(otherPage)).toHaveCount(1);
      await expect(contactRows(otherPage)).toContainText(memberName);
    } finally {
      await otherBrowser.close();
    }
  });

  await test.step("Все clears the filter", async () => {
    await groupFilter(page).getByRole("link", { name: "Все", exact: true }).click();
    await expect(page).not.toHaveURL(/[?&]group=/);
    await expect(contactRows(page).filter({ hasText: memberName })).toBeVisible();
    await expect(contactRows(page).filter({ hasText: outsiderName })).toBeVisible();
  });
});
