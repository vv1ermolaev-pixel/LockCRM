import "server-only";

import { and, asc, count, desc, eq, inArray, ne, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { contactGroups, contacts, groups, notes } from "@/db/schema";
import { contactInGroup } from "@/lib/groups";
import {
  makeSnippet,
  normalizeText,
  parseSearchQuery,
  phoneMatches,
  type PhoneQuery,
  type SearchQuery,
} from "@/lib/search";

// Case-insensitive and treats "ё" as "е", so "Петр" finds "Пётр"
function normalizeForSearch(value: SQL | string) {
  return sql`replace(lower(${value}), 'ё', 'е')`;
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function fieldContains(field: AnyColumn, word: string) {
  return sql`${normalizeForSearch(sql`${field}`)} like ${normalizeForSearch(`%${escapeLikePattern(word)}%`)}`;
}

// A word may be in any field of the contact or in any of its notes, so words of one query
// can match different fields: "иван стоматолог" finds Иван whose "about" says Стоматолог
function wordCondition(word: string) {
  return or(
    fieldContains(contacts.name, word),
    fieldContains(contacts.about, word),
    fieldContains(contacts.howWeMet, word),
    fieldContains(contacts.email, word),
    inArray(contacts.id, db.select({ contactId: notes.contactId }).from(notes).where(fieldContains(notes.body, word))),
  );
}

// Same rule as phoneKey() in search.ts: digits only, a leading "8" read as "+7"
const phoneKeySql = sql`regexp_replace(regexp_replace(${contacts.phone}, '[^0-9]', '', 'g'), '^8', '7')`;

function phoneCondition(phone: PhoneQuery) {
  return or(
    sql`${phoneKeySql} like ${`%${phone.anywhere}%`}`,
    phone.start ? sql`${phoneKeySql} like ${`${phone.start}%`}` : undefined,
  );
}

function searchCondition(search: SearchQuery) {
  const text = and(...search.words.map(wordCondition));
  return search.phone ? or(phoneCondition(search.phone), text) : text;
}

function nameHasAllWords(words: string[]) {
  return and(...words.map((word) => fieldContains(contacts.name, word)))!;
}

// The note that best explains the match: most query words the name and "about" don't show, then the newest.
// Built with the query builder, not raw sql: in a single-table select Drizzle drops table names
// from columns in the select list, and "contacts"."id" would turn into "id", that is notes.id
function bestNoteBody(words: string[]) {
  const explainedWords = sql.join(
    words.map(
      (word) =>
        sql`(${fieldContains(notes.body, word)} and not coalesce(${fieldContains(contacts.name, word)} or ${fieldContains(contacts.about, word)}, false))::int`,
    ),
    sql` + `,
  );
  return db
    .select({ body: notes.body })
    .from(notes)
    .where(and(eq(notes.contactId, contacts.id), or(...words.map((word) => fieldContains(notes.body, word)))))
    .orderBy(desc(explainedWords), desc(notes.createdAt), desc(notes.id))
    .limit(1);
}

// Why the contact was found, when its row in the list doesn't show it
export type ContactMatch = { field: "note" | "howWeMet" | "phone" | "email"; text: string };

export type ContactListItem = {
  id: number;
  name: string;
  about: string | null;
  phone: string | null;
  email: string | null;
  // In the user's order of groups. Names and colors come from the list of groups the page sends once,
  // so renaming or recoloring a group does not change the rows
  groupIds: number[];
  match?: ContactMatch;
};

type FoundContact = Omit<ContactListItem, "match"> & { howWeMet: string | null; bestNote: string | null };

function explainMatch(contact: FoundContact, search: SearchQuery): ContactMatch | undefined {
  if (search.phone && contact.phone && phoneMatches(contact.phone, search.phone)) {
    return { field: "phone", text: contact.phone };
  }

  const visible = normalizeText(`${contact.name} ${contact.about ?? ""}`);
  const hiddenWords = search.words.filter((word) => !visible.includes(word));
  if (hiddenWords.length === 0) return undefined;

  // The field that holds the most hidden words; on a tie the earlier one wins
  const candidates = [
    { field: "note", text: contact.bestNote },
    { field: "howWeMet", text: contact.howWeMet },
    { field: "email", text: contact.email },
  ] as const;
  let best: { field: ContactMatch["field"]; text: string; words: string[] } | undefined;
  for (const { field, text } of candidates) {
    if (!text) continue;
    const normalized = normalizeText(text);
    const words = hiddenWords.filter((word) => normalized.includes(word));
    if (words.length > (best?.words.length ?? 0)) best = { field, text, words };
  }
  if (!best) return undefined;

  return { field: best.field, text: best.field === "email" ? best.text : makeSnippet(best.text, best.words) };
}

// Built with the query builder for the same reason as bestNoteBody().
// The standalone builder, not db: this runs on import, and the build imports modules with no database settings
const contactGroupIds = new QueryBuilder()
  .select({
    ids: sql`coalesce(array_agg(${contactGroups.groupId} order by ${groups.position}, ${groups.id}), '{}')`,
  })
  .from(contactGroups)
  .innerJoin(groups, eq(groups.id, contactGroups.groupId))
  .where(eq(contactGroups.contactId, contacts.id));

const listFields = {
  id: contacts.id,
  name: contacts.name,
  about: contacts.about,
  phone: contacts.phone,
  email: contacts.email,
  groupIds: sql<number[]>`${contactGroupIds}`,
};

export type ContactListPart = { contacts: ContactListItem[]; hasMore: boolean };

// The first `limit` rows of the list (all without a limit), and whether there are more.
// With a group, only the people in it; `excludeId` leaves one contact out (the new one shown above the list).
// The order ends with the id, so it is stable and parts read one after another never overlap
export async function listFirstContacts(
  query: string,
  groupId?: number | null,
  { limit, excludeId }: { limit?: number; excludeId?: number | null } = {},
): Promise<ContactListPart> {
  const search = parseSearchQuery(query);
  const notExcluded = excludeId == null ? undefined : ne(contacts.id, excludeId);
  // One row more than shown answers "are there more" without a separate count
  const take = limit === undefined ? undefined : limit + 1;
  const trim = <T>(rows: T[]) => ({
    rows: limit === undefined ? rows : rows.slice(0, limit),
    hasMore: limit !== undefined && rows.length > limit,
  });

  if (search.words.length === 0) {
    const listed = db
      .select(listFields)
      .from(contacts)
      .where(and(contactInGroup(groupId), notExcluded))
      .orderBy(asc(contacts.name), asc(contacts.id))
      .$dynamic();
    const { rows, hasMore } = trim(await (take === undefined ? listed : listed.limit(take)));
    return { contacts: rows, hasMore };
  }

  const found = db
    .select({
      ...listFields,
      howWeMet: contacts.howWeMet,
      bestNote: sql<string | null>`${bestNoteBody(search.words)}`,
    })
    .from(contacts)
    .where(and(searchCondition(search), contactInGroup(groupId), notExcluded))
    // People whose name has every word come first: searching "Маша" puts Маша above notes that mention her
    .orderBy(desc(nameHasAllWords(search.words)), asc(contacts.name), asc(contacts.id))
    .$dynamic();
  const { rows, hasMore } = trim(await (take === undefined ? found : found.limit(take)));

  // Notes and "how we met" stay on the server: the list gets one short line at most.
  // Explained after trimming, only for the rows that are shown
  return {
    contacts: rows.map(({ howWeMet, bestNote, ...contact }) => {
      const match = explainMatch({ ...contact, howWeMet, bestNote }, search);
      return match ? { ...contact, match } : contact;
    }),
    hasMore,
  };
}

// One contact as a row of the list: the new contact shown above it. Undefined when it is gone
export async function getListContact(id: number): Promise<ContactListItem | undefined> {
  const [contact] = await db.select(listFields).from(contacts).where(eq(contacts.id, id));
  return contact;
}

// The whole list: with a group, only the people in it
export async function listContacts(query: string, groupId?: number | null): Promise<ContactListItem[]> {
  return (await listFirstContacts(query, groupId)).contacts;
}

// With a query, only the people it finds: the same condition as the list, so "Найдено: N" counts the whole result
export async function countContacts(groupId?: number | null, query = "") {
  const search = parseSearchQuery(query);
  const [row] = await db
    .select({ value: count() })
    .from(contacts)
    .where(and(search.words.length > 0 ? searchCondition(search) : undefined, contactInGroup(groupId)));
  return row.value;
}

export async function getContact(id: number) {
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
  return contact;
}

export async function listNotes(contactId: number) {
  return db.select().from(notes).where(eq(notes.contactId, contactId)).orderBy(desc(notes.createdAt), desc(notes.id));
}
