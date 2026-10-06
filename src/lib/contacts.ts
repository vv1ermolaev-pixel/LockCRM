import "server-only";

import { and, asc, count, desc, eq, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { contacts, notes } from "@/db/schema";

// Case-insensitive and treats "ё" as "е", so "Петр" finds "Пётр"
function normalizeForSearch(value: SQL | string) {
  return sql`replace(lower(${value}), 'ё', 'е')`;
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function nameMatches(query: string) {
  // Every word must appear in the name, in any order: "петров иван" finds "Иван Петров"
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return undefined;
  return and(
    ...words.map(
      (word) =>
        sql`${normalizeForSearch(sql`${contacts.name}`)} like ${normalizeForSearch(`%${escapeLikePattern(word)}%`)}`,
    ),
  );
}

export async function listContacts(query: string) {
  return db
    .select({
      id: contacts.id,
      name: contacts.name,
      about: contacts.about,
      phone: contacts.phone,
      email: contacts.email,
    })
    .from(contacts)
    .where(nameMatches(query))
    .orderBy(asc(contacts.name), asc(contacts.id));
}

export type ContactListItem = Awaited<ReturnType<typeof listContacts>>[number];

export async function countContacts() {
  const [row] = await db.select({ value: count() }).from(contacts);
  return row.value;
}

export async function getContact(id: number) {
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
  return contact;
}

export async function listNotes(contactId: number) {
  return db
    .select()
    .from(notes)
    .where(eq(notes.contactId, contactId))
    .orderBy(desc(notes.createdAt), desc(notes.id));
}
