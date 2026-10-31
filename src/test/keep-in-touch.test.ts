import { eq, sql } from "drizzle-orm";
import { describe, expect, inject, it } from "vitest";

import { updateContact } from "@/app/actions";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { getContact, listContacts, listNotes } from "@/lib/contacts";
import { listDueContacts } from "@/lib/keep-in-touch";

import { applyPendingMigrations, resetTestDatabaseUpTo } from "./database";
import { contactForm } from "./forms";
import { addContact, addGroup, groupId } from "./scenario";

// A due date in the past cannot be set on screen: the contact is moved back to being added a month ago
async function addDueContact(name: string, groupIds: number[] = []) {
  const id = await addContact(name, { contactFrequency: "week", groupIds });
  await db
    .update(contacts)
    .set({ createdAt: sql`now() - interval '30 days'` })
    .where(eq(contacts.id, id));
  return id;
}

const dueNames = async (groupId?: number) => (await listDueContacts(groupId)).map((contact) => contact.name);

describe("Existing contacts after the deploy", () => {
  it("leaves a contact added before the feature with no frequency, no mark, and the same fields and notes", async () => {
    const testUrl = inject("testDatabaseUrl");
    // The release before keep-in-touch: only the first migration, and a contact with two notes in it.
    // Plain SQL: the current schema has columns that table does not have yet
    await resetTestDatabaseUpTo(testUrl, "0000_init");
    const addedAt = "2025-01-10T09:00:00Z";
    const [{ id }] = await db.execute<{ id: number }>(sql`
      insert into contacts (name, about, how_we_met, phone, email, created_at, updated_at)
      values ('Анна Смирнова', 'Дизайнер', 'На курсах', '+7 900 111-22-33', 'anna@example.com', ${addedAt}, ${addedAt})
      returning id
    `);
    await db.execute(sql`
      insert into notes (contact_id, body, created_at) values
        (${id}, 'Обсудили отпуск', '2025-02-01T10:00:00Z'),
        (${id}, 'Поздравил с днём рождения', '2025-03-15T18:00:00Z')
    `);

    await applyPendingMigrations(testUrl);

    expect(await getContact(id)).toEqual({
      id,
      name: "Анна Смирнова",
      about: "Дизайнер",
      howWeMet: "На курсах",
      phone: "+7 900 111-22-33",
      email: "anna@example.com",
      contactFrequency: null,
      contactMarkedAt: null,
      createdAt: new Date(addedAt),
      updatedAt: new Date(addedAt),
    });
    expect((await listNotes(id)).map(({ body, createdAt }) => ({ body, createdAt }))).toEqual([
      { body: "Поздравил с днём рождения", createdAt: new Date("2025-03-15T18:00:00Z") },
      { body: "Обсудили отпуск", createdAt: new Date("2025-02-01T10:00:00Z") },
    ]);
    expect(await dueNames()).toEqual([]);
  });
});

describe("Contact frequency is stored on the server", () => {
  it("reads «Раз в месяц», then «Раз в неделю» after a change, on a fresh read, as another browser would", async () => {
    const id = await addContact("Анна", { contactFrequency: "month" });
    expect((await getContact(id)).contactFrequency).toBe("month");

    const result = await updateContact(id, contactForm({ name: "Анна", contactFrequency: "week" }));
    expect(result.ok).toBe(true);
    expect((await getContact(id)).contactFrequency).toBe("week");
  });
});

describe("The «Пора связаться» block on the home page", () => {
  it("keeps Борис, who is due, in the contact list in his place by name: Анна, Борис, Вера", async () => {
    await addContact("Вера", { contactFrequency: "week" });
    await addDueContact("Борис");
    await addContact("Анна");

    expect(await dueNames()).toEqual(["Борис"]);
    expect((await listContacts("")).map((contact) => contact.name)).toEqual(["Анна", "Борис", "Вера"]);
  });

  it("is empty when nobody is due: a week contact added today and a contact without a frequency added a year ago", async () => {
    await addContact("Анна", { contactFrequency: "week" });
    const noFrequency = await addContact("Борис");
    await db
      .update(contacts)
      .set({ createdAt: sql`now() - interval '1 year'` })
      .where(eq(contacts.id, noFrequency));

    expect(await dueNames()).toEqual([]);
  });

  it("shows only Мама when «Семья» is chosen and Борис from «Теннис» is also due", async () => {
    const family = await groupId("Семья");
    await addDueContact("Мама", [family]);
    await addDueContact("Борис", [await addGroup("Теннис")]);

    expect(await dueNames(family)).toEqual(["Мама"]);
  });

  it("is empty when nobody in the chosen «Теннис» is due while others are", async () => {
    const tennis = await addGroup("Теннис");
    await addContact("Анна", { contactFrequency: "week", groupIds: [tennis] });
    await addDueContact("Мама", [await groupId("Семья")]);

    expect(await dueNames(tennis)).toEqual([]);
  });

  it("shows everybody who is due again when the filter is cleared with «Все»", async () => {
    await addDueContact("Мама", [await groupId("Семья")]);
    await addDueContact("Борис", [await addGroup("Теннис")]);

    expect((await dueNames()).sort()).toEqual(["Борис", "Мама"]);
  });
});
