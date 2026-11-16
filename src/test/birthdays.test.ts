import { eq, sql } from "drizzle-orm";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, inject, it } from "vitest";

import { createContact, updateContact } from "@/app/actions";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { moscowToday } from "@/lib/birthdays";
import { readContactForm, toFieldErrors, type ContactField } from "@/lib/validation";

import {
  countContacts,
  getContact,
  listUpcomingBirthdays,
  loadContactsPage,
  signInTestUser,
  TEST_USER_EMAIL,
} from "./as-user";
import { applyPendingMigrations, resetTestDatabaseUpTo } from "./database";
import { contactForm, type ContactFormFields } from "./forms";
import { addContact, addGroup, groupId } from "./scenario";
import { signInAs } from "./sign-in";
import { switchBrowser } from "./stubs/next-headers";

const testUrl = inject("testDatabaseUrl");

// Today in Moscow and the days around it, as the user would pick them in the form
const today = moscowToday();
const shiftDays = (days: number) => {
  const date = new Date(Date.UTC(today.year, today.month - 1, today.day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
};
const formDate = ({ year, month, day }: { year: number; month: number; day: number }) => ({
  birthDay: String(day),
  birthMonth: String(month),
  birthYear: String(year),
});

type BirthFields = Pick<ContactFormFields, "birthDay" | "birthMonth" | "birthYear">;

// What the server reads from the form: the parsed birth date, or the error under the field
function readBirthDate(fields: BirthFields) {
  const parsed = readContactForm(contactForm({ name: "Анна", ...fields }));
  if (parsed.success) return { birthDate: parsed.data.birthDate };
  return { error: toFieldErrors<ContactField>(parsed.error).birthDate };
}

const YEAR_ERROR = `Год — от 1900 до ${today.year}`;

describe("Birth date validation", () => {
  it("is no birth date when everything is empty", () => {
    expect(readBirthDate({})).toEqual({ birthDate: { birthDay: null, birthMonth: null, birthYear: null } });
  });

  it("takes a date with a year", () => {
    expect(readBirthDate({ birthDay: "14", birthMonth: "3", birthYear: "1990" })).toEqual({
      birthDate: { birthDay: 14, birthMonth: 3, birthYear: 1990 },
    });
  });

  it("takes a date without a year, and trims spaces around the year", () => {
    expect(readBirthDate({ birthDay: "14", birthMonth: "3", birthYear: "  " })).toEqual({
      birthDate: { birthDay: 14, birthMonth: 3, birthYear: null },
    });
    expect(readBirthDate({ birthDay: "14", birthMonth: "3", birthYear: " 1990 " })).toEqual({
      birthDate: { birthDay: 14, birthMonth: 3, birthYear: 1990 },
    });
  });

  it("asks for the day and the month when only one part is set", () => {
    const error = { error: "Укажите день и месяц" };
    expect(readBirthDate({ birthDay: "14" })).toEqual(error);
    expect(readBirthDate({ birthMonth: "3" })).toEqual(error);
    expect(readBirthDate({ birthYear: "1990" })).toEqual(error);
    expect(readBirthDate({ birthDay: "14", birthYear: "1990" })).toEqual(error);
  });

  it("asks for the day and the month when a request skips the form and sends something not from the lists", () => {
    const error = { error: "Укажите день и месяц" };
    expect(readBirthDate({ birthDay: "32", birthMonth: "3" })).toEqual(error);
    expect(readBirthDate({ birthDay: "abc", birthMonth: "3" })).toEqual(error);
    expect(readBirthDate({ birthDay: "0", birthMonth: "3" })).toEqual(error);
    expect(readBirthDate({ birthDay: "14", birthMonth: "13" })).toEqual(error);
    expect(readBirthDate({ birthDay: "14.5", birthMonth: "3" })).toEqual(error);
    expect(readBirthDate({ birthDay: "", birthMonth: "" })).toEqual({
      birthDate: { birthDay: null, birthMonth: null, birthYear: null },
    });
  });

  it("has no 31 April", () => {
    expect(readBirthDate({ birthDay: "31", birthMonth: "4" })).toEqual({ error: "Такой даты нет" });
    expect(readBirthDate({ birthDay: "31", birthMonth: "4", birthYear: "1990" })).toEqual({ error: "Такой даты нет" });
  });

  it("has no 29 February 2023", () => {
    expect(readBirthDate({ birthDay: "29", birthMonth: "2", birthYear: "2023" })).toEqual({ error: "Такой даты нет" });
  });

  it("takes 29 February without a year", () => {
    expect(readBirthDate({ birthDay: "29", birthMonth: "2" })).toEqual({
      birthDate: { birthDay: 29, birthMonth: 2, birthYear: null },
    });
  });

  it("takes a year from 1900 to the current one only", () => {
    const date = { birthDay: "14", birthMonth: "3" };
    expect(readBirthDate({ ...date, birthYear: "1899" })).toEqual({ error: YEAR_ERROR });
    expect(readBirthDate({ ...date, birthYear: String(today.year + 1) })).toEqual({ error: YEAR_ERROR });
    expect(readBirthDate({ ...date, birthYear: "90" })).toEqual({ error: YEAR_ERROR });
    expect(readBirthDate({ ...date, birthYear: "19900" })).toEqual({ error: YEAR_ERROR });
    expect(readBirthDate({ ...date, birthYear: "1990.0" })).toEqual({ error: YEAR_ERROR });
    expect(readBirthDate({ ...date, birthYear: "1900" })).toEqual({
      birthDate: { birthDay: 14, birthMonth: 3, birthYear: 1900 },
    });
  });

  // On 31 December tomorrow is next year, and the year check answers first: there is no future day this year
  it.skipIf(shiftDays(1).year !== today.year)("refuses tomorrow of the current year", () => {
    expect(readBirthDate(formDate(shiftDays(1)))).toEqual({ error: "Дата рождения не может быть в будущем" });
  });

  it("takes today", () => {
    expect(readBirthDate(formDate(today))).toEqual({
      birthDate: { birthDay: today.day, birthMonth: today.month, birthYear: today.year },
    });
  });
});

describe("Existing contacts after the deploy", () => {
  let client: postgres.Sql;

  beforeEach(() => {
    client = postgres(testUrl, { max: 1, onnotice: () => {} });
  });

  afterEach(async () => {
    await client.end();
  });

  it("leaves a contact added before the feature with no birth date and the same fields, note and group", async () => {
    // The release before birthdays: plain SQL, because the current schema has columns this table does not have yet
    await resetTestDatabaseUpTo(testUrl, "0005_login_password_attempts");
    const [user] = await client`
      insert into users (id, name, email, email_verified) values ('user-1', 'Owner', 'owner@example.com', true)
      returning id
    `;
    const [group] = await client`
      insert into groups (owner_id, name, color, position) values (${user.id}, 'Друзья', 'green', 1) returning id
    `;
    const [contact] = await client`
      insert into contacts (owner_id, name, about, how_we_met, phone, email, contact_frequency, created_at, updated_at)
      values (${user.id}, 'Анна Смирнова', 'Дизайнер', 'На курсах', '+7 900 111-22-33', 'anna@example.com', 'week',
        '2025-01-10T09:00:00Z', '2025-01-11T09:00:00Z')
      returning id
    `;
    await client`
      insert into notes (contact_id, body, created_at) values (${contact.id}, 'Обсудили отпуск', '2025-02-01T10:00:00Z')
    `;
    await client`insert into contact_groups (contact_id, group_id) values (${contact.id}, ${group.id})`;
    const contactBefore = (await client`select * from contacts where id = ${contact.id}`)[0];
    const notesBefore = await client`select * from notes order by id`;
    const linksBefore = await client`select * from contact_groups`;

    await applyPendingMigrations(testUrl);

    const [contactAfter] = await client`select * from contacts where id = ${contact.id}`;
    // Everything that was there stays, and the three new columns are empty
    expect(contactAfter).toEqual({ ...contactBefore, birth_day: null, birth_month: null, birth_year: null });
    expect(await client`select * from notes order by id`).toEqual(notesBefore);
    expect(await client`select * from contact_groups`).toEqual(linksBefore);
  });

  it("refuses a day without a month, a month without a day and a year without a day and month", async () => {
    await resetTestDatabaseUpTo(testUrl, "0005_login_password_attempts");
    await client`insert into users (id, name, email, email_verified) values ('user-1', 'Owner', 'owner@example.com', true)`;
    await applyPendingMigrations(testUrl);

    const insert = (day: number | null, month: number | null, year: number | null) =>
      client`
        insert into contacts (owner_id, name, birth_day, birth_month, birth_year)
        values ('user-1', 'Анна', ${day}, ${month}, ${year})
      `;

    await expect(insert(14, null, null)).rejects.toThrow();
    await expect(insert(null, 3, null)).rejects.toThrow();
    await expect(insert(null, null, 1990)).rejects.toThrow();
    await expect(insert(null, 3, 1990)).rejects.toThrow();
    await expect(insert(14, null, 1990)).rejects.toThrow();
    await expect(insert(32, 3, null)).rejects.toThrow();
    await expect(insert(0, 3, null)).rejects.toThrow();
    await expect(insert(14, 13, null)).rejects.toThrow();
    await expect(insert(14, 0, null)).rejects.toThrow();

    await insert(null, null, null);
    await insert(14, 3, null);
    await insert(14, 3, 1990);
    expect(await client`select 1 from contacts`).toHaveLength(3);
  });
});

describe("Saving the birth date", () => {
  beforeEach(signInTestUser);

  const birthDateOf = async (id: number) => {
    const contact = await getContact(id);
    return { birthDay: contact?.birthDay, birthMonth: contact?.birthMonth, birthYear: contact?.birthYear };
  };

  it("saves a date with a year, and the edit window gets it back", async () => {
    const id = await addContact("Анна", { birthDay: "14", birthMonth: "3", birthYear: "1990" });

    expect(await birthDateOf(id)).toEqual({ birthDay: 14, birthMonth: 3, birthYear: 1990 });
  });

  it("saves a date without a year", async () => {
    const id = await addContact("Анна", { birthDay: "14", birthMonth: "3" });

    expect(await birthDateOf(id)).toEqual({ birthDay: 14, birthMonth: 3, birthYear: null });
  });

  it("saves a contact with no birth date when the field is not touched", async () => {
    const id = await addContact("Анна");

    expect(await birthDateOf(id)).toEqual({ birthDay: null, birthMonth: null, birthYear: null });
  });

  it("changes 14 March to 15 March", async () => {
    const id = await addContact("Анна", { birthDay: "14", birthMonth: "3", birthYear: "1990" });

    const result = await updateContact(
      id,
      contactForm({ name: "Анна", birthDay: "15", birthMonth: "3", birthYear: "1990" }),
    );

    expect(result.ok).toBe(true);
    expect(await birthDateOf(id)).toEqual({ birthDay: 15, birthMonth: 3, birthYear: 1990 });
  });

  it("clears the date", async () => {
    const id = await addContact("Анна", { birthDay: "14", birthMonth: "3", birthYear: "1990" });

    const result = await updateContact(id, contactForm({ name: "Анна" }));

    expect(result.ok).toBe(true);
    expect(await birthDateOf(id)).toEqual({ birthDay: null, birthMonth: null, birthYear: null });
  });

  it("shows the same date in another browser", async () => {
    const id = await addContact("Анна", { birthDay: "14", birthMonth: "3", birthYear: "1990" });

    await signInAs(TEST_USER_EMAIL, { browser: "another browser" });

    expect(await birthDateOf(id)).toEqual({ birthDay: 14, birthMonth: 3, birthYear: 1990 });
  });

  it("does not create a contact with a wrong date and says what is wrong under the field", async () => {
    const result = await createContact(contactForm({ name: "Анна", birthDay: "31", birthMonth: "4" }));

    expect(result).toEqual({ ok: false, errors: { birthDate: "Такой даты нет" } });
    expect(await countContacts()).toBe(0);
  });

  it("keeps the saved date and the other fields when an edit has a wrong date", async () => {
    const id = await addContact("Анна", { birthDay: "14", birthMonth: "3", birthYear: "1990", about: "Дизайнер" });

    const result = await updateContact(
      id,
      contactForm({ name: "Анна Смирнова", about: "Художник", birthDay: "14", birthYear: "1990" }),
    );

    expect(result).toEqual({ ok: false, errors: { birthDate: "Укажите день и месяц" } });
    expect(await birthDateOf(id)).toEqual({ birthDay: 14, birthMonth: 3, birthYear: 1990 });
    expect(await getContact(id)).toMatchObject({ name: "Анна", about: "Дизайнер" });
  });
});

describe("Upcoming birthdays", () => {
  beforeEach(signInTestUser);

  // Born 30 years before this year, so the age is known and the date is never in the future
  const bornYear = today.year - 30;
  const bornOn = (days: number, { withYear = true } = {}) => {
    const date = shiftDays(days);
    return { birthDay: String(date.day), birthMonth: String(date.month), birthYear: withYear ? String(bornYear) : "" };
  };
  const names = async (groupId: number | null = null) =>
    (await listUpcomingBirthdays(groupId, today)).map((item) => item.name);

  it("lists today and the next 6 days, and not the 7th day or yesterday", async () => {
    await addContact("Анна", bornOn(0));
    await addContact("Борис", bornOn(6));
    await addContact("Вера", bornOn(7));
    await addContact("Глеб", bornOn(-1));

    expect(await names()).toEqual(["Анна", "Борис"]);
  });

  it("gives when the birthday is and the age that is reached", async () => {
    const id = await addContact("Анна", bornOn(2));
    const date = shiftDays(2);

    expect(await listUpcomingBirthdays(null, today)).toEqual([
      { id, name: "Анна", daysUntil: 2, date, turningAge: date.year - bornYear },
    ]);
  });

  it("leaves out contacts without a birth date", async () => {
    await addContact("Анна");

    expect(await names()).toEqual([]);
  });

  it("lists a birthday without a year, with no age", async () => {
    await addContact("Егор", bornOn(2, { withYear: false }));

    expect(await listUpcomingBirthdays(null, today)).toMatchObject([{ name: "Егор", daysUntil: 2, turningAge: null }]);
  });

  it("puts the nearest first and the same day by name", async () => {
    await addContact("Анна", bornOn(4));
    await addContact("Глеб", bornOn(1));
    await addContact("Вера", bornOn(1));
    await addContact("Борис", bornOn(0));

    expect(await names()).toEqual(["Борис", "Вера", "Глеб", "Анна"]);
  });

  it("lists only the people of the chosen group", async () => {
    const family = await groupId("Семья");
    const tennis = await addGroup("Теннис");
    await addContact("Мама", { ...bornOn(1), groupIds: [family] });
    await addContact("Борис", { ...bornOn(2), groupIds: [tennis] });

    expect(await names(family)).toEqual(["Мама"]);
    expect(await names(tennis)).toEqual(["Борис"]);
    expect(await names()).toEqual(["Мама", "Борис"]);
  });

  it("does not list a contact of another user, even with a birthday today", async () => {
    await signInAs("other@example.com");
    await addContact("Чужая Анна", bornOn(0));
    switchBrowser(TEST_USER_EMAIL);
    await addContact("Борис", bornOn(1));

    expect(await names()).toEqual(["Борис"]);
  });
});

describe("Upcoming birthdays on the home page", () => {
  beforeEach(signInTestUser);

  const tomorrow = () => {
    const date = shiftDays(1);
    return { birthDay: String(date.day), birthMonth: String(date.month), birthYear: "" };
  };
  const upcomingNames = async (params: Record<string, string> = {}) =>
    (await loadContactsPage(params)).upcomingBirthdays.map((item) => item.name);

  it("shows a contact whose birthday is tomorrow", async () => {
    await addContact("Анна", tomorrow());

    expect(await upcomingNames()).toEqual(["Анна"]);
  });

  it("is empty while a search is on", async () => {
    await addContact("Анна", tomorrow());

    expect(await upcomingNames({ q: "Анна" })).toEqual([]);
    expect(await upcomingNames({ q: "Иван" })).toEqual([]);
  });

  it("has only the people of the chosen group", async () => {
    const family = await groupId("Семья");
    const tennis = await addGroup("Теннис");
    await addContact("Мама", { ...tomorrow(), groupIds: [family] });
    await addContact("Борис", { ...tomorrow(), groupIds: [tennis] });

    expect(await upcomingNames({ group: String(family) })).toEqual(["Мама"]);
    expect(await upcomingNames()).toEqual(["Борис", "Мама"]);
  });

  it("leaves the contact in the main list and in «Пора связаться»", async () => {
    const id = await addContact("Анна", { ...tomorrow(), contactFrequency: "week" });
    // A due date in the past cannot be set on screen: the contact is moved back to being added a month ago
    await db
      .update(contacts)
      .set({ createdAt: sql`now() - interval '30 days'` })
      .where(eq(contacts.id, id));

    const page = await loadContactsPage({});

    expect(page.upcomingBirthdays.map((item) => item.id)).toEqual([id]);
    expect(page.contacts.map((item) => item.id)).toEqual([id]);
    expect(page.dueContacts.map((item) => item.id)).toEqual([id]);
  });
});
