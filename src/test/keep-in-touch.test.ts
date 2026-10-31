import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";
import { contacts } from "@/db/schema";
import { listDueContacts } from "@/lib/keep-in-touch";

import { addContact, addGroup, groupId } from "./scenario";

// A due date in the past cannot be set on screen: the contact is moved back to being added a month ago
async function addDueContact(name: string, groupIds: number[]) {
  const id = await addContact(name, { contactFrequency: "week", groupIds });
  await db
    .update(contacts)
    .set({ createdAt: sql`now() - interval '30 days'` })
    .where(eq(contacts.id, id));
  return id;
}

const dueNames = async (groupId?: number) => (await listDueContacts(groupId)).map((contact) => contact.name);

describe("The «Пора связаться» block on the home page", () => {
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
