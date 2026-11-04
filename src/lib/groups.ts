import "server-only";

import { and, asc, count, eq, inArray, max, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { contactGroups, contacts, groups } from "@/db/schema";
import { pickNewGroupColor, type GroupColor } from "@/lib/group-colors";
import { groupNameSchema } from "@/lib/validation";

// Writes take the database or an open transaction: the "Группы" window writes on its own,
// and saving a contact writes its groups in the same transaction as the contact
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

// The groups every new user starts with, in this order (positions 1 to 4). The same names and colors as
// drizzle/0003_default_groups.sql, which gave them to the first installation
export const defaultGroups = [
  { name: "Семья", color: "pink" },
  { name: "Друзья", color: "green" },
  { name: "Знакомые", color: "yellow" },
  { name: "Коллеги", color: "blue" },
] as const satisfies readonly { name: string; color: GroupColor }[];

export type GroupListItem = {
  id: number;
  name: string;
  color: GroupColor;
  contactCount: number;
};

// The user's order: every list of groups on every screen comes from here
const userOrder = [asc(groups.position), asc(groups.id)];

// Every query on groups has this condition: a person sees and changes only their own groups
const ownedBy = (userId: string) => eq(groups.ownerId, userId);

export async function listGroups(userId: string): Promise<GroupListItem[]> {
  return db
    .select({ id: groups.id, name: groups.name, color: groups.color, contactCount: count(contactGroups.contactId) })
    .from(groups)
    .leftJoin(contactGroups, eq(contactGroups.groupId, groups.id))
    .where(ownedBy(userId))
    .groupBy(groups.id)
    .orderBy(...userOrder);
}

// The one condition for the home page filter: the list, its count and the "Пора связаться" block
// use it, so they always agree. No group means no condition
export function contactInGroup(userId: string, groupId: number | null | undefined) {
  if (groupId == null) return undefined;
  return inArray(
    contacts.id,
    db
      .select({ contactId: contactGroups.contactId })
      .from(contactGroups)
      .innerJoin(groups, eq(groups.id, contactGroups.groupId))
      .where(and(eq(contactGroups.groupId, groupId), ownedBy(userId))),
  );
}

// In the user's order of groups
export async function getContactGroupIds(userId: string, contactId: number): Promise<number[]> {
  const rows = await db
    .select({ id: groups.id })
    .from(contactGroups)
    .innerJoin(groups, eq(groups.id, contactGroups.groupId))
    .where(and(eq(contactGroups.contactId, contactId), ownedBy(userId)))
    .orderBy(...userOrder);
  return rows.map((row) => row.id);
}

// Same rule as the unique index on groups and groupNameKey() in validation.ts
function nameKey(name: SQL | string) {
  return sql`replace(lower(${name}), 'ё', 'е')`;
}

async function findGroupByName(executor: Executor, userId: string, name: string) {
  const [group] = await executor
    .select({ id: groups.id })
    .from(groups)
    .where(and(ownedBy(userId), sql`${nameKey(sql`${groups.name}`)} = ${nameKey(name)}`));
  return group?.id;
}

// A new group goes to the end of the user's order, in the least used color
async function newGroupValues(executor: Executor, userId: string, name: string) {
  const [[{ last }], used] = await Promise.all([
    executor
      .select({ last: max(groups.position) })
      .from(groups)
      .where(ownedBy(userId)),
    executor.select({ color: groups.color }).from(groups).where(ownedBy(userId)),
  ]);
  return {
    ownerId: userId,
    name,
    color: pickNewGroupColor(used.map((group) => group.color)),
    position: (last ?? 0) + 1,
  };
}

// The existing group with this name, or a new one. A group with the same name created at the same moment
// elsewhere is taken as well, instead of failing on the unique index
async function findOrCreateGroup(executor: Executor, userId: string, name: string) {
  const existing = await findGroupByName(executor, userId, name);
  if (existing) return existing;

  const [created] = await executor
    .insert(groups)
    .values(await newGroupValues(executor, userId, name))
    .onConflictDoNothing()
    .returning({ id: groups.id });
  return created?.id ?? (await findGroupByName(executor, userId, name))!;
}

export type GroupResult = { ok: true; id: number } | { ok: false; error: string };

const DUPLICATE_NAME = "Такая группа уже есть";

// Drizzle wraps the driver error, so the Postgres code may be on the error or on its cause
function isUniqueViolation(error: unknown) {
  const codeOf = (value: unknown) => (value as { code?: string } | undefined)?.code;
  return codeOf(error) === "23505" || codeOf((error as { cause?: unknown } | undefined)?.cause) === "23505";
}

// Checks the name and the duplicate first to show the error under the field; the unique index catches
// a duplicate saved at the same moment elsewhere
async function saveGroupName(
  userId: string,
  rawName: string,
  excludeId: number | null,
  save: (name: string) => Promise<number>,
): Promise<GroupResult> {
  const parsed = groupNameSchema.safeParse(rawName);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const existing = await findGroupByName(db, userId, parsed.data);
  if (existing && existing !== excludeId) return { ok: false, error: DUPLICATE_NAME };
  try {
    return { ok: true, id: await save(parsed.data) };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: DUPLICATE_NAME };
    throw error;
  }
}

export async function createGroup(userId: string, rawName: string): Promise<GroupResult> {
  return saveGroupName(userId, rawName, null, async (name) => {
    const [created] = await db
      .insert(groups)
      .values(await newGroupValues(db, userId, name))
      .returning({ id: groups.id });
    return created.id;
  });
}

// Renaming a group to its own name in another case is allowed: it is not a different group
export async function renameGroup(userId: string, id: number, rawName: string): Promise<GroupResult> {
  return saveGroupName(userId, rawName, id, async (name) => {
    await db
      .update(groups)
      .set({ name })
      .where(and(eq(groups.id, id), ownedBy(userId)));
    return id;
  });
}

export async function setGroupColor(userId: string, id: number, color: GroupColor) {
  await db
    .update(groups)
    .set({ color })
    .where(and(eq(groups.id, id), ownedBy(userId)));
}

// Its members stay in contacts: only their rows in contact_groups go (on delete cascade).
// Positions of the other groups are left as they are, so their order does not change
export async function deleteGroup(userId: string, id: number) {
  await db.delete(groups).where(and(eq(groups.id, id), ownedBy(userId)));
}

// Writes positions one after another in the given order. The list may be stale, sent from a tab opened earlier:
// ids of groups that are gone are skipped, and groups it does not have (made in another tab) go after the rest
// in their previous order. So nothing is lost and nothing fails; the last reorder wins
export async function reorderGroups(userId: string, orderedIds: number[]) {
  await db.transaction(async (tx) => {
    const current = await tx
      .select({ id: groups.id })
      .from(groups)
      .where(ownedBy(userId))
      .orderBy(...userOrder)
      .for("update");
    const currentIds = current.map((group) => group.id);
    const sent = [...new Set(orderedIds)].filter((id) => currentIds.includes(id));
    const order = [...sent, ...currentIds.filter((id) => !sent.includes(id))];
    for (const [index, id] of order.entries()) {
      await tx
        .update(groups)
        .set({ position: index + 1 })
        .where(and(eq(groups.id, id), ownedBy(userId)));
    }
  });
}

// Replaces the contact's groups with the checked ones plus the typed new names. Groups deleted meanwhile
// in another tab are skipped: the insert takes only ids that still exist and belong to this user, so the number
// of a group of somebody else is skipped as well. The caller has checked that the contact is this user's
export async function setContactGroups(
  executor: Executor,
  userId: string,
  contactId: number,
  { groupIds, newNames }: { groupIds: number[]; newNames: string[] },
) {
  const ids = new Set(groupIds);
  // One by one: two typed names may be the same group
  for (const name of newNames) {
    ids.add(await findOrCreateGroup(executor, userId, name));
  }

  await executor.delete(contactGroups).where(eq(contactGroups.contactId, contactId));
  if (ids.size === 0) return;
  await executor.insert(contactGroups).select(
    executor
      .select({ contactId: sql<number>`${contactId}::integer`.as("contact_id"), groupId: groups.id })
      .from(groups)
      .where(and(inArray(groups.id, [...ids]), ownedBy(userId))),
  );
}
