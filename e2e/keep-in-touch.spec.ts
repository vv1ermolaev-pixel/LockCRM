// Keep in touch (openspec/specs/keep-in-touch): how often to talk to a contact, when it is time to reach out,
// the "Пора связаться" block on the home page and the "Связались" button.
// Every test works with its own contacts (the name ends with a suffix) and removes them afterwards:
// the local database holds real data, so other contacts are never touched.

import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

const suffix = Date.now().toString(36);
const names = new Set<string>();

type Frequency = "week" | "month" | "quarter" | "year";

function uniqueName(label: string) {
  const name = `${label} Проверкин-${suffix}`;
  names.add(name);
  return name;
}

async function getContactId(name: string) {
  const [row] = await sql<{ id: number }[]>`select id from contacts where name = ${name}`;
  return row.id;
}

async function getFrequency(name: string) {
  const [row] = await sql<{ contact_frequency: string | null }[]>`
    select contact_frequency from contacts where name = ${name}
  `;
  return row.contact_frequency;
}

// The «Как часто общаться» row of the card details; "не указано" also appears in the other empty rows
function frequencyDetail(page: Page) {
  return page.locator("dl > div").filter({ hasText: "Как часто общаться" });
}

async function chooseFrequency(page: Page, label: string) {
  await page.getByRole("dialog").getByLabel("Как часто общаться").click();
  await page.getByRole("option", { name: label }).click();
}

// --- Calendar math, written independently from the app: days are Moscow days ("YYYY-MM-DD") ---

const DAY_MS = 24 * 60 * 60 * 1000;

function moscowDay(offsetDays = 0) {
  // Moscow has no daylight saving time, so whole days of 24 hours are exact
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + offsetDays * DAY_MS));
}

// Calendar months; a short month ends on its last day (31 January + 1 month = 28 February)
function addMonths(day: string, months: number) {
  const [year, month, dayOfMonth] = day.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(dayOfMonth, lastDay));
  return first.toISOString().slice(0, 10);
}

function addDays(day: string, days: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

const periodMonths = { month: 1, quarter: 3, year: 12 } as const;

// How many days overdue a contact is today, when the last communication was on `lastDay` (a Moscow day)
function expectedOverdueDays(frequency: Frequency, lastDay: string) {
  const dueDay = frequency === "week" ? addDays(lastDay, 7) : addMonths(lastDay, periodMonths[frequency]);
  return daysBetween(dueDay, moscowDay());
}

const dayMonth = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });

// "26 ноября"; the year is added only when it is not the current one
function dayText(day: string) {
  const text = dayMonth.format(new Date(`${day}T00:00:00Z`));
  return day.slice(0, 4) === moscowDay().slice(0, 4) ? text : `${text} ${day.slice(0, 4)}`;
}

// --- Test data ---

// A moment `days` days ago at the same time of day, or an exact Moscow time such as "2099-09-14T23:30:00+03:00"
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();

type SeedContact = {
  label: string;
  frequency?: Frequency | null;
  createdAt?: string;
  noteTimes?: string[];
  markedAt?: string;
};

async function seedContact({ label, frequency = null, createdAt = daysAgo(0), noteTimes = [], markedAt }: SeedContact) {
  const name = uniqueName(label);
  const [contact] = await sql<{ id: number }[]>`
    insert into contacts (name, contact_frequency, contact_marked_at, created_at)
    values (${name}, ${frequency}, ${markedAt ?? null}, ${createdAt})
    returning id
  `;
  for (const noteTime of noteTimes) {
    await sql`insert into notes (contact_id, body, created_at) values (${contact.id}, 'Заметка', ${noteTime})`;
  }
  return { id: contact.id, name };
}

// After every test, so the contacts of one test never show up in the "Пора связаться" block of the next.
// Notes go with their contact (on delete cascade)
test.afterEach(async () => {
  await sql`delete from contacts where name = any(${[...names]})`;
  names.clear();
});

test.afterAll(async () => {
  await sql.end();
});

// --- Requirement: contact frequency ---

test.describe("contact frequency", () => {
  test("is set when adding, changed and removed", async ({ page }) => {
    const name = uniqueName("Частота");

    await test.step("a new contact starts with «Не задано»; pick «Раз в месяц» and add", async () => {
      await page.goto("/");
      await page.getByRole("button", { name: "Добавить контакт" }).click();
      const dialog = page.getByRole("dialog", { name: "Новый контакт" });
      await expect(dialog.getByLabel("Как часто общаться")).toHaveText("Не задано");

      await dialog.getByLabel("Имя").fill(name);
      await chooseFrequency(page, "Раз в месяц");
      await expect(dialog.getByLabel("Как часто общаться")).toHaveText("Раз в месяц");
      await dialog.getByRole("button", { name: "Добавить" }).click();

      await expect(dialog).toBeHidden();
      await expect(page.getByText(`Контакт «${name}» добавлен`)).toBeVisible();
      expect(await getFrequency(name)).toBe("month");
    });

    const id = await getContactId(name);

    await test.step("the card shows it, and «Изменить» shows the saved frequency", async () => {
      await page.goto(`/contacts/${id}`);
      await expect(page.getByText("Раз в месяц", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Изменить" }).click();
      await expect(page.getByRole("dialog", { name: "Изменить контакт" }).getByLabel("Как часто общаться")).toHaveText(
        "Раз в месяц",
      );
    });

    await test.step("change to «Раз в неделю»", async () => {
      const dialog = page.getByRole("dialog", { name: "Изменить контакт" });
      await chooseFrequency(page, "Раз в неделю");
      await dialog.getByRole("button", { name: "Сохранить" }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByText("Изменения сохранены")).toBeVisible();
      expect(await getFrequency(name)).toBe("week");

      // From the server, not from what the page remembers
      await page.reload();
      await expect(page.getByText("Раз в неделю", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Изменить" }).click();
      await expect(dialog.getByLabel("Как часто общаться")).toHaveText("Раз в неделю");
    });

    await test.step("remove the frequency with «Не задано»", async () => {
      const dialog = page.getByRole("dialog", { name: "Изменить контакт" });
      await chooseFrequency(page, "Не задано");
      await dialog.getByRole("button", { name: "Сохранить" }).click();
      await expect(dialog).toBeHidden();
      expect(await getFrequency(name)).toBeNull();

      await page.reload();
      await expect(frequencyDetail(page)).toContainText("не указано");
      await page.getByRole("button", { name: "Изменить" }).click();
      await expect(dialog.getByLabel("Как часто общаться")).toHaveText("Не задано");
    });
  });

  test("a contact added without touching the field has no frequency", async ({ page }) => {
    const name = uniqueName("БезЧастоты");

    await page.goto("/");
    await page.getByRole("button", { name: "Добавить контакт" }).click();
    const dialog = page.getByRole("dialog", { name: "Новый контакт" });
    await dialog.getByLabel("Имя").fill(name);
    await dialog.getByRole("button", { name: "Добавить" }).click();
    await expect(dialog).toBeHidden();

    expect(await getFrequency(name)).toBeNull();

    await page.goto(`/contacts/${await getContactId(name)}`);
    await expect(page.getByText("Как часто общаться")).toBeVisible();
    await expect(frequencyDetail(page)).toContainText("не указано");
    await page.getByRole("button", { name: "Изменить" }).click();
    await expect(page.getByRole("dialog", { name: "Изменить контакт" }).getByLabel("Как часто общаться")).toHaveText(
      "Не задано",
    );
  });
});

// --- Requirements: last communication, due date, when it is time to reach out, status on the card ---

// What the card says under «Как часто общаться»
type CardStatus = { next: string } | { overdue: string } | "none";

async function expectStatus(page: Page, id: number, expected: CardStatus) {
  await page.goto(`/contacts/${id}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  if (expected === "none") {
    await expect(page.getByText("Следующий раз")).toHaveCount(0);
    await expect(page.getByText("Пора связаться")).toHaveCount(0);
  } else if ("next" in expected) {
    await expect(page.getByText(`Следующий раз — до ${expected.next}`, { exact: true })).toBeVisible();
    await expect(page.getByText("Пора связаться")).toHaveCount(0);
  } else {
    await expect(page.getByText(`Пора связаться — ${expected.overdue}`, { exact: true })).toBeVisible();
    await expect(page.getByText("Следующий раз")).toHaveCount(0);
  }
}

test.describe("due date and status on the card", () => {
  test("a month from the day the contact was added, when there are no notes or marks", async ({ page }) => {
    const { id } = await seedContact({ label: "Месяц", frequency: "month" });
    await expectStatus(page, id, { next: dayText(addMonths(moscowDay(), 1)) });
    await expect(page.getByText("Раз в месяц", { exact: true })).toBeVisible();
  });

  test("the due date has not come yet", async ({ page }) => {
    const { id } = await seedContact({ label: "Срок впереди", frequency: "week", createdAt: daysAgo(3) });
    await expectStatus(page, id, { next: dayText(moscowDay(4)) });
  });

  test("on the due date the contact is not overdue yet", async ({ page }) => {
    const { id } = await seedContact({ label: "День срока", frequency: "week", createdAt: daysAgo(7) });
    await expectStatus(page, id, { next: dayText(moscowDay()) });
  });

  test("the day after the due date it is time to reach out: 1 day", async ({ page }) => {
    const { id } = await seedContact({ label: "День после срока", frequency: "week", createdAt: daysAgo(8) });
    await expectStatus(page, id, { overdue: "просрочено на 1 день" });
  });

  test("overdue by several days", async ({ page }) => {
    const { id } = await seedContact({ label: "Просрочен", frequency: "week", createdAt: daysAgo(12) });
    await expectStatus(page, id, { overdue: "просрочено на 5 дней" });
  });

  test("added long ago, no notes or marks: counted from the day it was added", async ({ page }) => {
    const { id } = await seedContact({ label: "Давно добавлен", frequency: "week", createdAt: daysAgo(10) });
    await expectStatus(page, id, { overdue: "просрочено на 3 дня" });
  });

  test("the due date next year shows the year", async ({ page }) => {
    // A year after yesterday is always next year
    const { id } = await seedContact({ label: "Год", frequency: "year", createdAt: daysAgo(1) });
    const expected = dayText(addMonths(moscowDay(-1), 12));
    expect(expected).toMatch(/ \d{4}$/);
    await expectStatus(page, id, { next: expected });
  });

  test("no frequency: no due line, never overdue", async ({ page }) => {
    const { id } = await seedContact({ label: "Без частоты", createdAt: daysAgo(400), noteTimes: [daysAgo(365)] });
    await expectStatus(page, id, "none");
    await expect(frequencyDetail(page)).toContainText("не указано");
  });

  // Fixed dates far in the future keep the calendar arithmetic checks stable: the due date is never overdue
  const arithmetic: Array<[string, Frequency, string, string]> = [
    ["a week", "week", "2099-10-03T12:00:00+03:00", "10 октября 2099"],
    ["a month", "month", "2099-09-14T12:00:00+03:00", "14 октября 2099"],
    ["the end of a short month", "month", "2099-01-31T12:00:00+03:00", "28 февраля 2099"],
    ["a quarter", "quarter", "2099-09-14T12:00:00+03:00", "14 декабря 2099"],
    ["a year", "year", "2099-09-14T12:00:00+03:00", "14 сентября 2100"],
  ];
  for (const [title, frequency, createdAt, expected] of arithmetic) {
    test(`due date arithmetic: ${title}`, async ({ page }) => {
      const { id } = await seedContact({ label: `Арифметика ${frequency}`, frequency, createdAt });
      await expectStatus(page, id, { next: expected });
    });
  }

  test("a note at 23:30 Moscow time belongs to that day, not the next", async ({ page }) => {
    const { id } = await seedContact({
      label: "Поздняя заметка",
      frequency: "month",
      createdAt: "2099-09-01T10:00:00+03:00",
      noteTimes: ["2099-09-14T23:30:00+03:00"],
    });
    await expectStatus(page, id, { next: "14 октября 2099" });
  });

  test("a note at 00:30 Moscow time is still the Moscow day, although it is the previous day in UTC", async ({
    page,
  }) => {
    const { id } = await seedContact({
      label: "Ранняя заметка",
      frequency: "month",
      createdAt: "2099-09-01T10:00:00+03:00",
      noteTimes: ["2099-09-14T00:30:00+03:00"],
    });
    await expectStatus(page, id, { next: "14 октября 2099" });
  });

  test("the last communication is the newest note", async ({ page }) => {
    // Notes 20 and 6 days ago: counted from 6 days ago, so the week ends tomorrow
    const { id } = await seedContact({
      label: "Две заметки",
      frequency: "week",
      createdAt: daysAgo(40),
      noteTimes: [daysAgo(20), daysAgo(6)],
    });
    await expectStatus(page, id, { next: dayText(moscowDay(1)) });
  });

  test("a mark newer than the last note wins", async ({ page }) => {
    const { id } = await seedContact({
      label: "Отметка позже заметки",
      frequency: "week",
      createdAt: daysAgo(40),
      noteTimes: [daysAgo(20)],
      markedAt: daysAgo(6),
    });
    await expectStatus(page, id, { next: dayText(moscowDay(1)) });
  });

  test("a note newer than the last mark wins", async ({ page }) => {
    const { id } = await seedContact({
      label: "Заметка позже отметки",
      frequency: "week",
      createdAt: daysAgo(40),
      noteTimes: [daysAgo(6)],
      markedAt: daysAgo(20),
    });
    await expectStatus(page, id, { next: dayText(moscowDay(1)) });
  });

  test("editing the contact does not move the due date", async ({ page }) => {
    const { id } = await seedContact({ label: "Правка", frequency: "week", createdAt: daysAgo(10) });
    await expectStatus(page, id, { overdue: "просрочено на 3 дня" });
    const [before] = await sql<{ updated_at: Date }[]>`select updated_at from contacts where id = ${id}`;

    await page.getByRole("button", { name: "Изменить" }).click();
    const dialog = page.getByRole("dialog", { name: "Изменить контакт" });
    await dialog.getByLabel("Телефон").fill("+7 900 000-11-22");
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Изменения сохранены")).toBeVisible();

    // The edit is saved (updated_at moved forward), and the contact is still overdue by the same 3 days
    const [after] = await sql<
      { phone: string; updated_at: Date }[]
    >`select phone, updated_at from contacts where id = ${id}`;
    expect(after.phone).toBe("+7 900 000-11-22");
    expect(after.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime());
    await expectStatus(page, id, { overdue: "просрочено на 3 дня" });
  });
});

// --- Requirements: the "Пора связаться" block, its order, when it is hidden, notes and frequency changes ---

function dueBlock(page: Page) {
  return page.getByRole("region", { name: "Пора связаться" });
}

function dueRow(page: Page, name: string) {
  return dueBlock(page).getByRole("listitem").filter({ hasText: name });
}

function contactRows(page: Page) {
  return page.locator('li[id^="contact-"]');
}

async function countContactsInDb() {
  const [row] = await sql<{ count: string }[]>`select count(*) from contacts`;
  return Number(row.count);
}

// "день / дня / дней", written out here so the test does not lean on the app's own plural helper
function daysText(days: number) {
  const lastTwo = days % 100;
  const last = days % 10;
  const word =
    last === 1 && lastTwo !== 11 ? "день" : last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? "дня" : "дней";
  return `${days} ${word}`;
}

// The database may hold real contacts that are due; the block is only empty when none of them are
async function countOtherDueRows(page: Page) {
  await page.goto("/");
  return dueBlock(page).getByRole("listitem").count();
}

async function setFrequencyOnCard(page: Page, id: number, label: string) {
  await page.goto(`/contacts/${id}`);
  await page.getByRole("button", { name: "Изменить" }).click();
  const dialog = page.getByRole("dialog", { name: "Изменить контакт" });
  await chooseFrequency(page, label);
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Изменения сохранены")).toBeVisible();
}

test.describe("«Пора связаться» block", () => {
  test("lists contacts that are due with frequency and days; the main list stays as it is", async ({ page }) => {
    const overdue = await seedContact({ label: "Просрочен", frequency: "week", createdAt: daysAgo(10) });
    const notYet = await seedContact({ label: "СрокВпереди", frequency: "week", createdAt: daysAgo(3) });
    const onDueDay = await seedContact({ label: "ВДеньСрока", frequency: "week", createdAt: daysAgo(7) });
    const noFrequency = await seedContact({ label: "БезЧастоты", createdAt: daysAgo(400) });

    await page.goto("/");
    await expect(dueRow(page, overdue.name)).toContainText("Раз в неделю · просрочено на 3 дня");
    for (const contact of [notYet, onDueDay, noFrequency]) {
      await expect(dueRow(page, contact.name)).toHaveCount(0);
    }

    // Everyone is still in the main list, and the block adds no rows to it
    for (const contact of [overdue, notYet, onDueDay, noFrequency]) {
      await expect(page.locator(`#contact-${contact.id}`)).toHaveCount(1);
    }
    await expect(contactRows(page)).toHaveCount(await countContactsInDb());
  });

  test("a click on the name opens the card", async ({ page }) => {
    const { id, name } = await seedContact({ label: "Переход", frequency: "week", createdAt: daysAgo(10) });

    await page.goto("/");
    await dueRow(page, name).getByRole("link").click();

    await expect(page).toHaveURL(new RegExp(`/contacts/${id}$`));
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  });

  test("the most overdue come first whatever the frequency, equal days go by name", async ({ page }) => {
    // Аня: a week, 10 days overdue. Борис: a year, about 30 days overdue. Вера and Глеб: a week, 5 days each
    const anya = await seedContact({ label: "Аня", frequency: "week", createdAt: daysAgo(17) });
    const borisLastDay = addMonths(moscowDay(-30), -12);
    const boris = await seedContact({ label: "Борис", frequency: "year", createdAt: `${borisLastDay}T12:00:00+03:00` });
    const vera = await seedContact({ label: "Вера", frequency: "week", createdAt: daysAgo(12) });
    const gleb = await seedContact({ label: "Глеб", frequency: "week", createdAt: daysAgo(12) });

    await page.goto("/");
    const borisDays = expectedOverdueDays("year", borisLastDay);
    expect(borisDays).toBeGreaterThan(10);
    await expect(dueRow(page, boris.name)).toContainText(`Раз в год · просрочено на ${daysText(borisDays)}`);
    await expect(dueRow(page, anya.name)).toContainText("Раз в неделю · просрочено на 10 дней");
    await expect(dueRow(page, vera.name)).toContainText("Раз в неделю · просрочено на 5 дней");
    await expect(dueRow(page, gleb.name)).toContainText("Раз в неделю · просрочено на 5 дней");

    // Only these four are compared: the block may hold other contacts
    const rows = await dueBlock(page).getByRole("listitem").allTextContents();
    const position = (name: string) => rows.findIndex((text) => text.includes(name));
    expect(position(boris.name)).toBeGreaterThanOrEqual(0);
    expect(position(boris.name)).toBeLessThan(position(anya.name));
    expect(position(anya.name)).toBeLessThan(position(vera.name));
    expect(position(vera.name)).toBeLessThan(position(gleb.name));
  });

  test("a search hides the block, clearing the search brings it back", async ({ page }) => {
    const { name } = await seedContact({ label: "Поиск", frequency: "week", createdAt: daysAgo(10) });

    await page.goto("/");
    await expect(dueRow(page, name)).toBeVisible();

    await page.getByRole("searchbox", { name: "Поиск по контактам" }).fill(name);
    await expect(page).toHaveURL(/\?q=/);
    await expect(contactRows(page)).toHaveCount(1);
    await expect(dueBlock(page)).toHaveCount(0);

    await page.getByRole("button", { name: "Очистить поиск" }).click();
    await expect(page).not.toHaveURL(/\?q=/);
    await expect(dueRow(page, name)).toBeVisible();
  });

  test("no block when nobody is due", async ({ page }) => {
    const otherDue = await countOtherDueRows(page);
    test.skip(otherDue > 0, `${otherDue} other contacts in this database are due, so the block cannot be empty`);

    await seedContact({ label: "СрокВпереди", frequency: "week", createdAt: daysAgo(3) });
    await seedContact({ label: "БезЧастоты", createdAt: daysAgo(400) });

    await page.goto("/");
    await expect(contactRows(page).first()).toBeVisible();
    await expect(dueBlock(page)).toHaveCount(0);
    await expect(page.getByText("Пора связаться")).toHaveCount(0);
  });

  test("a note moves the due date and takes the contact out of the block", async ({ page }) => {
    const { name } = await seedContact({ label: "Заметка", frequency: "week", createdAt: daysAgo(10) });

    await page.goto("/");
    await dueRow(page, name).getByRole("link").click();
    await expect(page.getByText("Пора связаться — просрочено на 3 дня", { exact: true })).toBeVisible();

    await page.getByLabel("Новая заметка").fill("Созвонились, договорились о встрече");
    await page.getByRole("button", { name: "Добавить заметку" }).click();
    await expect(page.getByText("Заметка сохранена")).toBeVisible();

    // The card shows the new due date at once, without reloading the page
    await expect(page.getByText(`Следующий раз — до ${dayText(moscowDay(7))}`, { exact: true })).toBeVisible();
    await expect(page.getByText("Пора связаться")).toHaveCount(0);

    await test.step("«Назад» opens the home page without the contact in the block", async () => {
      await page.goBack();
      await expect(page.getByRole("heading", { name: "Контакты" })).toBeVisible();
      await expect(dueRow(page, name)).toHaveCount(0);
    });

    await test.step("«Все контакты» does too", async () => {
      await page.goForward();
      await page.getByRole("link", { name: "Все контакты", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Контакты" })).toBeVisible();
      await expect(dueRow(page, name)).toHaveCount(0);
    });
  });

  test("changing the frequency recounts the due date from the same last communication", async ({ page }) => {
    // The last note was 10 days ago: a month is far away, a week is 3 days overdue
    const { id, name } = await seedContact({
      label: "Смена",
      frequency: "month",
      createdAt: daysAgo(40),
      noteTimes: [daysAgo(10)],
    });

    await test.step("«Раз в месяц»: not in the block", async () => {
      await page.goto("/");
      await expect(contactRows(page).first()).toBeVisible();
      await expect(dueRow(page, name)).toHaveCount(0);
    });

    await test.step("more often, «Раз в неделю»: in the block, 3 days overdue", async () => {
      await setFrequencyOnCard(page, id, "Раз в неделю");
      await page.goto("/");
      await expect(dueRow(page, name)).toContainText("Раз в неделю · просрочено на 3 дня");
    });

    await test.step("less often, «Раз в месяц»: out of the block", async () => {
      await setFrequencyOnCard(page, id, "Раз в месяц");
      await page.goto("/");
      await expect(contactRows(page).first()).toBeVisible();
      await expect(dueRow(page, name)).toHaveCount(0);
    });

    await test.step("«Раз в неделю» again, then «Не задано»: out of the block", async () => {
      await setFrequencyOnCard(page, id, "Раз в неделю");
      await page.goto("/");
      await expect(dueRow(page, name)).toBeVisible();

      await setFrequencyOnCard(page, id, "Не задано");
      await page.goto("/");
      await expect(contactRows(page).first()).toBeVisible();
      await expect(dueRow(page, name)).toHaveCount(0);
    });
  });
});

// --- Requirements: the "Связались" check mark in the block and the button on the card, with their undo ---

const UNDO_WINDOW_MS = 5000;
const COLLAPSE_MS = 300;

function checkButton(page: Page, name: string) {
  return dueRow(page, name).getByRole("button", { name: `Связались: ${name}` });
}

async function getMarkedAt(id: number) {
  const [row] = await sql<
    { contact_marked_at: Date | null }[]
  >`select contact_marked_at from contacts where id = ${id}`;
  return row.contact_marked_at;
}

async function countNotes(id: number) {
  const [row] = await sql<{ count: string }[]>`select count(*) from notes where contact_id = ${id}`;
  return Number(row.count);
}

// Timers of the page are driven by the test, so the 5-second windows do not depend on how fast the test runs.
// Call this before the first page.goto(), and freezeTime() once the page is open
async function controlTime(page: Page) {
  await page.clock.install();
}

async function freezeTime(page: Page) {
  await page.clock.pauseAt(new Date(Date.now() + 1000));
}

// A week-contact that is `days` days overdue: the last communication was 7 + days days ago
const overdueWeek = (days: number) => daysAgo(7 + days);

test.describe("«Связались» in the block", () => {
  test("the check mark has no text, saves the mark and neither opens the card nor adds a note", async ({ page }) => {
    const { id, name } = await seedContact({
      label: "Галочка",
      frequency: "month",
      createdAt: daysAgo(100),
      noteTimes: [daysAgo(60), daysAgo(50)],
    });

    await page.goto("/");
    const button = checkButton(page, name);
    await expect(button).toHaveText("");
    await expect(button).toHaveAttribute("title", "Связались");
    expect(await getMarkedAt(id)).toBeNull();

    await button.click();
    await expect(dueRow(page, name)).toContainText("Отметили общение");

    // Still on the home page, the notes are as they were, and the mark is in the database
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Контакты" })).toBeVisible();
    expect(await countNotes(id)).toBe(2);
    expect(await getMarkedAt(id)).not.toBeNull();

    // The due date is counted from the mark
    await page.goto(`/contacts/${id}`);
    await expect(
      page.getByText(`Следующий раз — до ${dayText(addMonths(moscowDay(), 1))}`, { exact: true }),
    ).toBeVisible();
  });

  test("the row turns into a confirmation, no toast, and goes away after 5 seconds", async ({ page, context }) => {
    const target = await seedContact({ label: "Анна", frequency: "week", createdAt: overdueWeek(3) });
    // Less overdue than the target, so it stays right below it
    const neighbour = await seedContact({ label: "Яков", frequency: "week", createdAt: overdueWeek(2) });

    await controlTime(page);
    await page.goto("/");
    await expect(dueRow(page, target.name)).toBeVisible();
    await freezeTime(page);

    await checkButton(page, target.name).click();

    const row = dueRow(page, target.name);
    await expect(row).toContainText("Отметили общение");
    await expect(row).toContainText(target.name);
    await expect(row.getByRole("button", { name: "Отменить" })).toBeVisible();
    await expect(row.getByRole("button", { name: `Связались: ${target.name}` })).toHaveCount(0);
    // The countdown bar is running, and there is no toast at the bottom of the screen
    await expect(row.locator(".bg-mid-green")).toBeVisible();
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);

    await test.step("still there just before the 5 seconds are over", async () => {
      await page.clock.runFor(UNDO_WINDOW_MS - 100);
      await expect(row).toContainText("Отметили общение");
    });

    await test.step("then the row collapses and disappears; the neighbour stays", async () => {
      await page.clock.runFor(100 + COLLAPSE_MS + 100);
      await expect(dueRow(page, target.name)).toHaveCount(0);
      await expect(dueRow(page, neighbour.name)).toContainText("Раз в неделю · просрочено на 2 дня");
    });

    await test.step("after a reload the contact is not in the block either", async () => {
      const fresh = await context.newPage();
      await fresh.goto("/");
      await expect(dueRow(fresh, neighbour.name)).toBeVisible();
      await expect(dueRow(fresh, target.name)).toHaveCount(0);
    });
  });

  test("the last row takes the whole block with it", async ({ page }) => {
    const otherDue = await countOtherDueRows(page);
    test.skip(otherDue > 0, `${otherDue} other contacts in this database are due, so the block would not be empty`);

    const { name } = await seedContact({ label: "Единственный", frequency: "week", createdAt: overdueWeek(3) });

    await controlTime(page);
    await page.goto("/");
    await expect(dueRow(page, name)).toBeVisible();
    await freezeTime(page);

    await checkButton(page, name).click();
    await expect(dueRow(page, name)).toContainText("Отметили общение");
    await expect(dueBlock(page)).toBeVisible();

    await page.clock.runFor(UNDO_WINDOW_MS + COLLAPSE_MS + 100);
    await expect(dueBlock(page)).toHaveCount(0);
    await expect(page.getByText("Пора связаться")).toHaveCount(0);
  });

  test("«Отменить» in the row brings it back with the same overdue days, in the same place", async ({ page }) => {
    const { id, name } = await seedContact({ label: "Отмена", frequency: "week", createdAt: overdueWeek(3) });
    // More overdue, so it is above the contact under test
    const above = await seedContact({ label: "Выше", frequency: "week", createdAt: overdueWeek(4) });
    const previousMark = daysAgo(30);
    await sql`update contacts set contact_marked_at = ${previousMark} where id = ${id}`;
    // The earlier mark is older than this note, so the note decides the due date
    await sql`insert into notes (contact_id, body, created_at) values (${id}, 'Заметка', ${overdueWeek(3)})`;

    await controlTime(page);
    await page.goto("/");
    await expect(dueRow(page, name)).toContainText("просрочено на 3 дня");
    const positionBefore = (await dueBlock(page).getByRole("listitem").allTextContents()).findIndex((text) =>
      text.includes(name),
    );
    await freezeTime(page);

    await checkButton(page, name).click();
    await expect(dueRow(page, name)).toContainText("Отметили общение");
    await dueRow(page, name).getByRole("button", { name: "Отменить" }).click();

    await expect(dueRow(page, name)).toContainText("Раз в неделю · просрочено на 3 дня");
    await expect(checkButton(page, name)).toBeVisible();
    const rows = await dueBlock(page).getByRole("listitem").allTextContents();
    expect(rows.findIndex((text) => text.includes(name))).toBe(positionBefore);
    expect(rows.findIndex((text) => text.includes(above.name))).toBeLessThan(positionBefore);

    // The mark is back to what it was, and the row stays after the old 5 seconds are over
    expect((await getMarkedAt(id))?.toISOString()).toBe(previousMark);
    await page.clock.runFor(UNDO_WINDOW_MS + COLLAPSE_MS + 100);
    await expect(dueRow(page, name)).toContainText("Раз в неделю · просрочено на 3 дня");
  });

  test("several marks in a row: each confirmation has its own «Отменить» and its own 5 seconds", async ({ page }) => {
    const ivan = await seedContact({ label: "Иван", frequency: "week", createdAt: overdueWeek(3) });
    const boris = await seedContact({ label: "Борис", frequency: "week", createdAt: overdueWeek(3) });

    await controlTime(page);
    await page.goto("/");
    await expect(dueRow(page, ivan.name)).toBeVisible();
    await freezeTime(page);

    await checkButton(page, ivan.name).click();
    await expect(dueRow(page, ivan.name)).toContainText("Отметили общение");
    await page.clock.runFor(1000);
    await checkButton(page, boris.name).click();

    for (const { name } of [ivan, boris]) {
      await expect(dueRow(page, name)).toContainText("Отметили общение");
      await expect(dueRow(page, name).getByRole("button", { name: "Отменить" })).toBeVisible();
    }

    // Ivan went first: he goes first, Boris stays for another second
    await page.clock.runFor(UNDO_WINDOW_MS - 1000 + COLLAPSE_MS + 100);
    await expect(dueRow(page, ivan.name)).toHaveCount(0);
    await expect(dueRow(page, boris.name)).toContainText("Отметили общение");

    await page.clock.runFor(1000);
    await expect(dueRow(page, boris.name)).toHaveCount(0);
  });

  test("with «reduce motion» the row changes and goes away without a transition", async ({ page }) => {
    const { name } = await seedContact({ label: "Движение", frequency: "week", createdAt: overdueWeek(3) });

    await page.emulateMedia({ reducedMotion: "reduce" });
    await controlTime(page);
    await page.goto("/");
    await expect(dueRow(page, name)).toBeVisible();
    await freezeTime(page);

    await checkButton(page, name).click();
    const row = dueRow(page, name);
    await expect(row).toContainText("Отметили общение");
    // A bar that jumps to zero would say nothing
    await expect(row.locator(".bg-mid-green")).toBeHidden();

    // Exactly 5 seconds: no extra time for the collapse
    await page.clock.runFor(UNDO_WINDOW_MS);
    await expect(dueRow(page, name)).toHaveCount(0);
  });
});

test.describe("«Связались» on the card", () => {
  test("marks an overdue contact: new due date, no note, gone from the block", async ({ page }) => {
    // A month contact 3 days overdue: the last communication was a month and 3 days ago
    const lastDay = addMonths(moscowDay(-3), -1);
    const { id, name } = await seedContact({
      label: "Карточка",
      frequency: "month",
      createdAt: `${lastDay}T12:00:00+03:00`,
    });

    await expectStatus(page, id, { overdue: "просрочено на 3 дня" });
    await page.getByRole("button", { name: "Связались", exact: true }).click();

    await expect(
      page.getByText(`Следующий раз — до ${dayText(addMonths(moscowDay(), 1))}`, { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Пора связаться")).toHaveCount(0);
    expect(await countNotes(id)).toBe(0);

    await page.goto("/");
    await expect(contactRows(page).first()).toBeVisible();
    await expect(dueRow(page, name)).toHaveCount(0);
  });

  test("marking ahead of time moves the due date a whole period from today", async ({ page }) => {
    // A week contact due in 4 days; marked today, it is due in 7
    const { id } = await seedContact({ label: "Заранее", frequency: "week", createdAt: daysAgo(3) });

    await expectStatus(page, id, { next: dayText(moscowDay(4)) });
    await page.getByRole("button", { name: "Связались", exact: true }).click();

    await expect(page.getByText(`Следующий раз — до ${dayText(moscowDay(7))}`, { exact: true })).toBeVisible();
  });

  test("no button for a contact without a frequency", async ({ page }) => {
    const { id } = await seedContact({ label: "Нет кнопки", createdAt: daysAgo(100) });

    await expectStatus(page, id, "none");
    await expect(page.getByRole("button", { name: "Связались", exact: true })).toHaveCount(0);
  });

  test("a message with «Отменить» appears, and «Отменить» brings the overdue state back", async ({ page }) => {
    const lastDay = addMonths(moscowDay(-3), -1);
    const { id } = await seedContact({
      label: "Отмена карточки",
      frequency: "month",
      createdAt: `${lastDay}T12:00:00+03:00`,
    });

    await expectStatus(page, id, { overdue: "просрочено на 3 дня" });

    await page.getByRole("button", { name: "Связались", exact: true }).click();
    const toast = page.locator("[data-sonner-toast]");
    await expect(toast).toContainText("Отметили общение");
    await expect(
      page.getByText(`Следующий раз — до ${dayText(addMonths(moscowDay(), 1))}`, { exact: true }),
    ).toBeVisible();

    await toast.getByRole("button", { name: "Отменить" }).click();
    await expect(page.getByText("Пора связаться — просрочено на 3 дня", { exact: true })).toBeVisible();
    await expect(page.getByText("Следующий раз")).toHaveCount(0);
    expect(await getMarkedAt(id)).toBeNull();
  });

  test("«Отменить» puts back the earlier mark, not an empty one", async ({ page }) => {
    // Marked 35 days ago: a month contact, overdue by a few days
    const earlierMark = daysAgo(35);
    const { id } = await seedContact({
      label: "Прежняя отметка",
      frequency: "month",
      createdAt: daysAgo(100),
      markedAt: earlierMark,
    });
    const overdue = expectedOverdueDays("month", moscowDay(-35));
    expect(overdue).toBeGreaterThan(0);

    await expectStatus(page, id, { overdue: `просрочено на ${daysText(overdue)}` });

    await page.getByRole("button", { name: "Связались", exact: true }).click();
    await expect(page.getByText("Следующий раз")).toBeVisible();
    expect((await getMarkedAt(id))?.toISOString()).not.toBe(earlierMark);

    await page.locator("[data-sonner-toast]").getByRole("button", { name: "Отменить" }).click();
    await expect(page.getByText(`Пора связаться — просрочено на ${daysText(overdue)}`, { exact: true })).toBeVisible();
    expect((await getMarkedAt(id))?.toISOString()).toBe(earlierMark);
  });

  test("without «Отменить» the mark stays after a reload", async ({ page }) => {
    const lastDay = addMonths(moscowDay(-3), -1);
    const { id, name } = await seedContact({
      label: "Без отмены",
      frequency: "month",
      createdAt: `${lastDay}T12:00:00+03:00`,
    });

    await expectStatus(page, id, { overdue: "просрочено на 3 дня" });
    await page.getByRole("button", { name: "Связались", exact: true }).click();
    await expect(page.locator("[data-sonner-toast]")).toContainText("Отметили общение");

    await page.reload();
    await expect(
      page.getByText(`Следующий раз — до ${dayText(addMonths(moscowDay(), 1))}`, { exact: true }),
    ).toBeVisible();
    await page.goto("/");
    await expect(contactRows(page).first()).toBeVisible();
    await expect(dueRow(page, name)).toHaveCount(0);
  });
});
