import "server-only";

import { and, asc, desc, eq, max, sql } from "drizzle-orm";

import { db } from "@/db";
import { contacts, notes } from "@/db/schema";
import type { ContactFrequency } from "@/lib/contact-frequency";
import { contactInGroup } from "@/lib/groups";

// Days are counted in one fixed zone: the server runs in UTC, where a day starts at 03:00 Moscow time,
// and a note written at 01:00 would land on the previous day. Moscow has no daylight saving time.
const TIME_ZONE = "Europe/Moscow";

// The same expressions drive the "Пора связаться" block and the contact card, so they never disagree.
// Built with the query builder, not raw sql, for the same reason as bestNoteBody() in contacts.ts:
// in a single-table select Drizzle drops table names from columns, and an unqualified "id" would mean notes.id
const lastNoteAt = db
  .select({ value: max(notes.createdAt) })
  .from(notes)
  .where(eq(notes.contactId, contacts.id));

// The later of the last note and the last "Связались" mark; with neither, the day the contact was added.
// greatest() skips NULLs, so it is right when there are no notes, no mark, or neither.
const lastContactAt = sql`coalesce(greatest(${lastNoteAt}, ${contacts.contactMarkedAt}), ${contacts.createdAt})`;

const period = sql`case ${contacts.contactFrequency}
  when 'week' then interval '7 days'
  when 'month' then interval '1 month'
  when 'quarter' then interval '3 months'
  when 'year' then interval '1 year'
end`;

const zone = sql.raw(`'${TIME_ZONE}'`);
const lastContactDay = sql`(${lastContactAt} at time zone ${zone})::date`;
// Postgres adds calendar months itself and stops at the end of a short month: 31 January + 1 month = 28 February
const dueDate = sql`(${lastContactDay} + ${period})::date`;
const today = sql`(now() at time zone ${zone})::date`;
// Whole days from the due date to today; above zero means it is time to reach out. NULL without a frequency
const overdueDays = sql`(${today} - ${dueDate})`;

export type DueContact = {
  id: number;
  name: string;
  contactFrequency: ContactFrequency;
  overdueDays: number;
};

// Contacts whose due date has passed, the most overdue first; with a group, only the people in it
export async function listDueContacts(groupId?: number | null): Promise<DueContact[]> {
  const rows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      contactFrequency: contacts.contactFrequency,
      overdueDays: sql<number>`${overdueDays}`,
    })
    .from(contacts)
    // No frequency means overdueDays is NULL, and NULL > 0 is not true: those contacts are never listed
    .where(and(sql`${overdueDays} > 0`, contactInGroup(groupId)))
    .orderBy(desc(overdueDays), asc(contacts.name), asc(contacts.id));

  return rows.flatMap(({ contactFrequency, ...contact }) =>
    contactFrequency ? [{ ...contact, contactFrequency }] : [],
  );
}

export type KeepInTouchStatus = {
  // "YYYY-MM-DD" calendar days, as strings, so the server's own time zone cannot shift them
  dueDate: string;
  today: string;
  // Zero or less while the due date has not passed
  overdueDays: number;
};

// null when the contact has no frequency
export async function getKeepInTouchStatus(contactId: number): Promise<KeepInTouchStatus | null> {
  const [row] = await db
    .select({
      dueDate: sql<string | null>`to_char(${dueDate}, 'YYYY-MM-DD')`,
      today: sql<string>`to_char(${today}, 'YYYY-MM-DD')`,
      overdueDays: sql<number | null>`${overdueDays}`,
    })
    .from(contacts)
    .where(eq(contacts.id, contactId));

  if (!row || row.dueDate === null || row.overdueDays === null) return null;
  return { dueDate: row.dueDate, today: row.today, overdueDays: row.overdueDays };
}
