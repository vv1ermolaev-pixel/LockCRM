import { inArray, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { deleteContact } from "@/app/actions";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { loadContactsPage, type ContactsPageData } from "@/lib/contacts-page";

import { addContact, addGroup } from "./scenario";

// "Контакт 01" … "Контакт 45": zero-padded numbers sort the same way in any collation
const numbered = (count: number, prefix = "Контакт") =>
  Array.from({ length: count }, (_, index) => `${prefix} ${String(index + 1).padStart(String(count).length, "0")}`);

async function addContacts(names: string[], fields: Parameters<typeof addContact>[1] = {}) {
  const ids: number[] = [];
  for (const name of names) ids.push(await addContact(name, fields));
  return ids;
}

const rowNames = (data: ContactsPageData) => data.contacts.map((contact) => contact.name);

describe("The list in parts of 20", () => {
  it("shows the first 20 of 45 by name and «Показать ещё»", async () => {
    const names = numbered(45);
    await addContacts(names);

    const data = await loadContactsPage({});
    expect(rowNames(data)).toEqual(names.slice(0, 20));
    expect(data.hasMore).toBe(true);
  });

  it("shows the same 20 and the next 20 below after «Показать ещё» (page=2), the button still there", async () => {
    const names = numbered(45);
    await addContacts(names);

    const data = await loadContactsPage({ page: "2" });
    expect(rowNames(data)).toEqual(names.slice(0, 40));
    expect(data.hasMore).toBe(true);
  });

  it("shows all 45 and no button after the last «Показать ещё» (page=3)", async () => {
    const names = numbered(45);
    await addContacts(names);

    const data = await loadContactsPage({ page: "3" });
    expect(rowNames(data)).toEqual(names);
    expect(data.hasMore).toBe(false);
  });

  it("shows all of exactly 20 contacts and no button", async () => {
    const names = numbered(20);
    await addContacts(names);

    const data = await loadContactsPage({});
    expect(rowNames(data)).toEqual(names);
    expect(data.hasMore).toBe(false);
  });

  it("has no rows and no button when there are no contacts", async () => {
    const data = await loadContactsPage({});
    expect(data.contacts).toEqual([]);
    expect(data.hasMore).toBe(false);
  });
});

describe("How many are shown is in the address", () => {
  it.each(["0", "-3", "abc"])("shows the first 20 for page=%s, without an error", async (page) => {
    const names = numbered(45);
    await addContacts(names);

    const data = await loadContactsPage({ page });
    expect(rowNames(data)).toEqual(names.slice(0, 20));
    expect(data.hasMore).toBe(true);
  });

  it("shows all 45 and no button for page=10, more than there are", async () => {
    const names = numbered(45);
    await addContacts(names);

    const data = await loadContactsPage({ page: "10" });
    expect(rowNames(data)).toEqual(names);
    expect(data.hasMore).toBe(false);
  });
});

// 145 people: 25 «Иван …», 12 «Алла …» whose «about» says «Брат Ивана», and 108 others, 52 of them in «Теннис».
// The search «Иван» finds 37; by name alone the «Алла» ones would come first
async function addPeople() {
  const tennis = await addGroup("Теннис");
  const ivans = numbered(25, "Иван");
  const allas = numbered(12, "Алла");
  const others = numbered(108);
  await addContacts(ivans);
  await addContacts(allas, { about: "Брат Ивана" });
  await addContacts(others.slice(0, 52), { groupIds: [tennis] });
  await addContacts(others.slice(52));
  return { tennis, ivans, allas, tennisNames: others.slice(0, 52) };
}

describe("The subtitle counts everybody, not the rows shown", () => {
  it("says 145 for the whole list with the first 20 shown", async () => {
    await addPeople();

    const data = await loadContactsPage({});
    expect(data.contacts).toHaveLength(20);
    expect(data.total).toBe(145);
  });

  it("says 52 for «Теннис» with the first 20 of it shown", async () => {
    const { tennis } = await addPeople();

    const data = await loadContactsPage({ group: String(tennis) });
    expect(data.contacts).toHaveLength(20);
    expect(data.group?.name).toBe("Теннис");
    expect(data.listCount).toBe(52);
  });

  it("says «Найдено: 37 из 145» for «Иван» with the first 20 found shown", async () => {
    await addPeople();

    const data = await loadContactsPage({ q: "Иван" });
    expect(data.contacts).toHaveLength(20);
    expect({ found: data.listCount, outOf: data.scopeCount }).toEqual({ found: 37, outOf: 145 });
  });
});

describe("Search results and a group in parts", () => {
  it("shows the first 20 of 37 found for «Иван», then all 37 with no button after «Показать ещё»", async () => {
    const { ivans, allas } = await addPeople();

    const first = await loadContactsPage({ q: "Иван" });
    expect(rowNames(first)).toEqual(ivans.slice(0, 20));
    expect(first.hasMore).toBe(true);

    // People with «Иван» in the name stay first across the border of the parts
    const all = await loadContactsPage({ q: "Иван", page: "2" });
    expect(rowNames(all)).toEqual([...ivans, ...allas]);
    expect(all.hasMore).toBe(false);
  });

  it("shows the first 20 people of «Теннис» by name and «Показать ещё»", async () => {
    const { tennis, tennisNames } = await addPeople();

    const data = await loadContactsPage({ group: String(tennis) });
    expect(rowNames(data)).toEqual(tennisNames.slice(0, 20));
    expect(data.hasMore).toBe(true);
  });
});

describe("A new contact is the first row", () => {
  it("puts «Яна Юдина», last by name, first with the first 20 others below and «Показать ещё»", async () => {
    const names = numbered(45);
    await addContacts(names);
    const yana = await addContact("Яна Юдина");

    const data = await loadContactsPage({ added: String(yana) });
    expect(data.added?.name).toBe("Яна Юдина");
    expect(rowNames(data)).toEqual(names.slice(0, 20));
    expect(data.hasMore).toBe(true);
  });

  it("puts «Анна Белова», 3rd by name, first and not again among the 20 below: 21 rows", async () => {
    const names = ["Агата", "Алла", ...numbered(45)];
    await addContacts(names);
    const anna = await addContact("Анна Белова");

    const data = await loadContactsPage({ added: String(anna) });
    expect(data.added?.name).toBe("Анна Белова");
    expect(rowNames(data)).toEqual(names.slice(0, 20));
    expect(rowNames(data)).not.toContain("Анна Белова");
  });

  it("keeps «Яна Юдина» first after «Показать ещё» (page=2) with 40 others below and not again among them", async () => {
    const names = numbered(45);
    await addContacts(names);
    const yana = await addContact("Яна Юдина");

    const data = await loadContactsPage({ added: String(yana), page: "2" });
    expect(data.added?.name).toBe("Яна Юдина");
    expect(rowNames(data)).toEqual(names.slice(0, 40));
  });

  it("puts «Яна Юдина» back in her place when a search is on: not on top, highlighted where she is", async () => {
    await addContacts(["Анна Юдина", "Борис Юдин"]);
    const yana = await addContact("Яна Юдина");

    const data = await loadContactsPage({ added: String(yana), q: "Юдин" });
    expect(data.added).toBeNull();
    expect(rowNames(data)).toEqual(["Анна Юдина", "Борис Юдин", "Яна Юдина"]);
    expect(data.addedId).toBe(yana);
  });

  it("puts «Яна Юдина» back in her place when a group is chosen", async () => {
    const tennis = await addGroup("Теннис");
    await addContacts(["Анна", "Борис"], { groupIds: [tennis] });
    const yana = await addContact("Яна Юдина", { groupIds: [tennis] });

    const data = await loadContactsPage({ added: String(yana), group: String(tennis) });
    expect(data.added).toBeNull();
    expect(rowNames(data)).toEqual(["Анна", "Борис", "Яна Юдина"]);
  });

  it("shows the usual list when the new contact has been deleted", async () => {
    const names = numbered(45);
    await addContacts(names);
    const yana = await addContact("Яна Юдина");
    await deleteContact(yana);

    const data = await loadContactsPage({ added: String(yana) });
    expect(data.added).toBeNull();
    expect(rowNames(data)).toEqual(names.slice(0, 20));
    expect(data.hasMore).toBe(true);
  });
});

describe("The «Пора связаться» block is not split into parts", () => {
  it("has all 25 due of 60, while the list shows 20 and «Показать ещё», which does not change the block", async () => {
    const due = numbered(25, "Должник");
    const ids = await addContacts(due, { contactFrequency: "week" });
    await addContacts(numbered(35));
    // A due date in the past cannot be set on screen: the contacts are moved back to being added a month ago
    await db
      .update(contacts)
      .set({ createdAt: sql`now() - interval '30 days'` })
      .where(inArray(contacts.id, ids));

    const first = await loadContactsPage({});
    expect(first.dueContacts.map((contact) => contact.name).sort()).toEqual(due);
    expect(first.contacts).toHaveLength(20);
    expect(first.hasMore).toBe(true);

    const next = await loadContactsPage({ page: "2" });
    expect(next.dueContacts).toHaveLength(25);
    expect(next.contacts).toHaveLength(40);
  });
});
