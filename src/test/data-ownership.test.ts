import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  addNote,
  createContact,
  deleteContact,
  deleteGroup,
  markContacted,
  renameGroup,
  reorderGroups,
  setGroupColor,
  undoMarkContacted,
  updateContact,
} from "@/app/actions";
import { db } from "@/db";
import { contacts, groups } from "@/db/schema";
import { countContacts, getContact, getListContact, listContacts, listNotes } from "@/lib/contacts";
import { loadContactsPage } from "@/lib/contacts-page";
import { getContactGroupIds, listGroups } from "@/lib/groups";
import { listDueContacts } from "@/lib/keep-in-touch";
import { getCurrentUser } from "@/lib/session";

import { contactForm } from "./forms";
import { addContact, addGroup } from "./scenario";
import { signInAs } from "./sign-in";
import { switchBrowser } from "./stubs/next-headers";

// Two people, each in a browser of their own. The test acts as one of them with asA() and asB()
async function twoPeople() {
  await signInAs("a@example.com");
  const a = (await getCurrentUser())!.id;
  await signInAs("b@example.com");
  const b = (await getCurrentUser())!.id;
  return { a, b, asA: () => switchBrowser("a@example.com"), asB: () => switchBrowser("b@example.com") };
}

function noteForm(body: string) {
  const formData = new FormData();
  formData.set("body", body);
  return formData;
}

function nameForm(name: string) {
  const formData = new FormData();
  formData.set("name", name);
  return formData;
}

// A due contact with a note: the data of person A that B must never see
async function annaOfA() {
  const id = await addContact("Анна Тестова", { contactFrequency: "week", about: "Дизайнер" });
  await addNote(id, noteForm("Обещала вернуть книгу"));
  // A due date in the past cannot be set on screen: the contact is moved back to being added a month ago
  await db
    .update(contacts)
    .set({ createdAt: sql`now() - interval '30 days'`, updatedAt: sql`now() - interval '30 days'` })
    .where(eq(contacts.id, id));
  await db.execute(sql`update notes set created_at = now() - interval '30 days' where contact_id = ${id}`);
  return id;
}

const deleted = { ok: false, contactDeleted: true };

describe("Everybody sees only their own contacts", () => {
  it("keeps the contact of A out of the list, the counter and the page of B", async () => {
    const { a, b, asA, asB } = await twoPeople();
    asA();
    const id = await annaOfA();
    asB();

    expect(await listContacts(b, "")).toEqual([]);
    expect(await countContacts(b)).toBe(0);
    expect(await getListContact(b, id)).toBeUndefined();
    const page = await loadContactsPage(b, {});
    expect(page).toMatchObject({ contacts: [], total: 0, listCount: 0 });
    // A, for comparison, sees the contact in all of these
    expect((await listContacts(a, "")).map((contact) => contact.name)).toEqual(["Анна Тестова"]);
    expect(await countContacts(a)).toBe(1);
  });

  it("finds nothing of A for B when B searches «Тестова» and «книгу»", async () => {
    const { a, b, asA, asB } = await twoPeople();
    asA();
    await annaOfA();
    asB();

    expect(await listContacts(b, "Тестова")).toEqual([]);
    expect(await listContacts(b, "книгу")).toEqual([]);
    expect(await countContacts(b, null, "Тестова")).toBe(0);
    expect(await countContacts(b, null, "книгу")).toBe(0);
    expect((await loadContactsPage(b, { q: "книгу" })).listCount).toBe(0);
    expect(await listContacts(a, "книгу")).toHaveLength(1);
  });

  it("shows the due contact of A in «Пора связаться» of A and not of B", async () => {
    const { a, b, asA, asB } = await twoPeople();
    asA();
    await annaOfA();
    asB();

    expect(await listDueContacts(b)).toEqual([]);
    expect((await loadContactsPage(b, {})).dueContacts).toEqual([]);
    expect((await listDueContacts(a)).map((contact) => contact.name)).toEqual(["Анна Тестова"]);
  });

  it("shows B no card and no notes for the number of the contact of A", async () => {
    const { a, b, asA, asB } = await twoPeople();
    asA();
    const id = await annaOfA();
    asB();

    expect(await getContact(b, id)).toBeUndefined();
    expect(await listNotes(b, id)).toEqual([]);
    expect(await getContact(a, id)).toMatchObject({ name: "Анна Тестова" });
    expect(await listNotes(a, id)).toHaveLength(1);
  });

  it("shows A the same contact in another browser under the same email", async () => {
    await signInAs("a@example.com", { browser: "computer" });
    const id = await addContact("Анна Тестова");
    await signInAs("a@example.com", { browser: "phone" });
    const a = (await getCurrentUser())!.id;

    expect((await listContacts(a, "")).map((contact) => contact.id)).toEqual([id]);
  });

  it("gives a contact and a group made in the contact window to the one who made them", async () => {
    const { a, b, asA, asB } = await twoPeople();
    asA();
    const id = await addContact("Анна", { newGroups: ["Теннис"] });
    asB();

    expect((await listGroups(a)).map((group) => group.name)).toContain("Теннис");
    expect((await listGroups(b)).map((group) => group.name)).not.toContain("Теннис");
    expect(await getContactGroupIds(b, id)).toEqual([]);
  });
});

describe("An action on the contact of somebody else", () => {
  async function annaWithNote() {
    const people = await twoPeople();
    people.asA();
    const id = await addContact("Анна Тестова", { about: "Дизайнер", contactFrequency: "week" });
    await addNote(id, noteForm("Обещала вернуть книгу"));
    const before = await getContact(people.a, id);
    people.asB();
    return { ...people, id, before };
  }

  it("answers B as for a deleted contact when B changes it, and changes nothing", async () => {
    const { a, id, before } = await annaWithNote();

    expect(await updateContact(id, contactForm({ name: "Взломана", about: "x" }))).toEqual(deleted);

    expect(await getContact(a, id)).toEqual(before);
  });

  it("answers B as for a deleted contact when B marks «Связались», and sets no mark", async () => {
    const { a, id, before } = await annaWithNote();

    expect(await markContacted(id)).toEqual(deleted);

    expect(await getContact(a, id)).toEqual(before);
  });

  it("changes no mark when B presses «Отменить» for the contact of A", async () => {
    const { a, id, asA, asB } = await annaWithNote();
    asA();
    await markContacted(id);
    const marked = await getContact(a, id);
    asB();

    expect(await undoMarkContacted(id, null)).toEqual({ ok: true });

    expect(await getContact(a, id)).toEqual(marked);
  });

  it("answers B as for a deleted contact when B adds a note, and adds none", async () => {
    const { a, id } = await annaWithNote();

    expect(await addNote(id, noteForm("Чужая заметка"))).toEqual(deleted);

    expect((await listNotes(a, id)).map((note) => note.body)).toEqual(["Обещала вернуть книгу"]);
  });

  it("answers B «done» when B deletes it, and the contact and its notes stay", async () => {
    const { a, id, before } = await annaWithNote();

    expect(await deleteContact(id)).toEqual({ ok: true });

    expect(await getContact(a, id)).toEqual(before);
    expect(await listNotes(a, id)).toHaveLength(1);
  });
});

describe("Groups of everybody are their own", () => {
  it("lets A and B both have «Друзья» and «Теннис», and A's group does not show B's people", async () => {
    const { a, b, asA, asB } = await twoPeople();
    asA();
    const aTennis = await addGroup("Теннис");
    const annaOfTennis = await addContact("Анна", { groupIds: [aTennis] });
    asB();
    const bTennis = await addGroup("Теннис");

    expect(bTennis).not.toBe(aTennis);
    expect((await listGroups(a)).find((group) => group.name === "Теннис")).toMatchObject({ contactCount: 1 });
    expect((await listGroups(b)).find((group) => group.name === "Теннис")).toMatchObject({ contactCount: 0 });
    expect((await listGroups(b)).filter((group) => group.name === "Друзья")).toHaveLength(1);
    expect(await getContactGroupIds(b, annaOfTennis)).toEqual([]);
  });

  it("lets B create «Теннис» without the error «Такая группа уже есть» when A has it", async () => {
    const { asA, asB } = await twoPeople();
    asA();
    await addGroup("Теннис");
    asB();

    await expect(addGroup("теннис")).resolves.toEqual(expect.any(Number));
  });

  it("does not let B rename, recolor, reorder or delete a group of A", async () => {
    const { a, asA, asB } = await twoPeople();
    asA();
    const tennis = await addGroup("Теннис");
    const before = await listGroups(a);
    asB();

    await renameGroup(tennis, nameForm("Взломан"));
    await setGroupColor(tennis, "gray");
    await reorderGroups([tennis]);
    await deleteGroup(tennis);

    expect(await listGroups(a)).toEqual(before);
  });

  it("does not move the groups of A when B reorders the groups with the ids of both", async () => {
    const { a, b, asA, asB } = await twoPeople();
    asA();
    const aIds = (await listGroups(a)).map((group) => group.id);
    asB();
    const bIds = (await listGroups(b)).map((group) => group.id);

    await reorderGroups([...aIds.toReversed(), ...bIds.toReversed()]);

    expect((await listGroups(a)).map((group) => group.id)).toEqual(aIds);
    expect((await listGroups(b)).map((group) => group.id)).toEqual(bIds.toReversed());
  });

  it("skips the number of a group of A when B saves a contact, and the contact of B is in no group", async () => {
    const { a, asA, asB } = await twoPeople();
    asA();
    const tennis = await addGroup("Теннис");
    asB();

    const result = await createContact(contactForm({ name: "Борис", groupIds: [tennis] }));

    expect(result.ok).toBe(true);
    const bId = (result as { id: number }).id;
    expect(await getContactGroupIds((await getCurrentUser())!.id, bId)).toEqual([]);
    expect((await listGroups(a)).find((group) => group.id === tennis)?.contactCount).toBe(0);
  });

  it("opens the whole list of B when the address names a group of A", async () => {
    const { b, asA, asB } = await twoPeople();
    asA();
    const tennis = await addGroup("Теннис");
    asB();
    await addContact("Борис");
    await addContact("Вера");

    const page = await loadContactsPage(b, { group: String(tennis) });

    expect(page.group).toBeNull();
    expect(page.contacts.map((contact) => contact.name)).toEqual(["Борис", "Вера"]);
  });

  it("does not put the group of B in the table of A", async () => {
    const { a, asB } = await twoPeople();
    asB();
    await addGroup("Теннис");

    const rows = await db.select({ ownerId: groups.ownerId }).from(groups).where(eq(groups.name, "Теннис"));
    expect(rows).toHaveLength(1);
    expect(rows[0].ownerId).not.toBe(a);
  });
});
