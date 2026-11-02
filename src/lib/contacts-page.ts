import "server-only";

import { countContacts, getListContact, listFirstContacts, type ContactListItem } from "@/lib/contacts";
import { listGroups, type GroupListItem } from "@/lib/groups";
import { listDueContacts, type DueContact } from "@/lib/keep-in-touch";
import { PAGE_SIZE, parsePage } from "@/lib/pagination";

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export type ContactsPageData = {
  query: string;
  page: number;
  groups: GroupListItem[];
  group: GroupListItem | null;
  // The contact just added (?added=<id>): highlighted wherever it is in the list
  addedId: number | null;
  // The same contact shown above the list, on the whole list only. It is not among `contacts` then
  added: ContactListItem | null;
  contacts: ContactListItem[];
  // More rows behind «Показать ещё»
  hasMore: boolean;
  // Everybody
  total: number;
  // Who the list is taken from: the people of the chosen group, or everybody. "Найдено: … из <scopeCount>"
  scopeCount: number;
  // Everybody in the list, shown or not: found by the search, or the whole scope
  listCount: number;
  // The "Пора связаться" block: never split into parts, and not read while a search is on (it is hidden then)
  dueContacts: DueContact[];
};

// Everything the home page shows, read from its address as the browser sent it
export async function loadContactsPage(params: SearchParams): Promise<ContactsPageData> {
  const query = (firstParam(params.q) ?? "").trim();
  const page = parsePage(params.page);
  const addedId = Number(firstParam(params.added)) || null;
  const requestedGroupId = Number(firstParam(params.group)) || null;

  // The group is checked against the list first: one that is gone (deleted, or a stale link) means no filter
  const groups = await listGroups();
  const group = groups.find((item) => item.id === requestedGroupId) ?? null;
  const groupId = group?.id ?? null;

  // After adding, the new contact goes on top of the whole list, outside the 20 rows of a part.
  // With a search or a group it stays in its place by name
  const pinnedId = addedId && !query && !groupId ? addedId : null;

  const [{ contacts, hasMore }, added, total, groupCount, foundCount, dueContacts] = await Promise.all([
    listFirstContacts(query, groupId, { limit: page * PAGE_SIZE, excludeId: pinnedId }),
    pinnedId ? getListContact(pinnedId) : undefined,
    countContacts(),
    groupId ? countContacts(groupId) : 0,
    query ? countContacts(groupId, query) : 0,
    query ? [] : listDueContacts(groupId),
  ]);
  const scopeCount = group ? groupCount : total;

  return {
    query,
    page,
    groups,
    group,
    addedId,
    added: added ?? null,
    contacts,
    hasMore,
    total,
    scopeCount,
    listCount: query ? foundCount : scopeCount,
    dueContacts,
  };
}
