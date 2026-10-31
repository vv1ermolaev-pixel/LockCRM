import { SearchXIcon, UsersIcon } from "lucide-react";

import { AddContactButton } from "@/components/contact-buttons";
import { ContactList } from "@/components/contact-list";
import { ContactSearch } from "@/components/contact-search";
import { DueContacts } from "@/components/due-contacts";
import { EmptyState } from "@/components/empty-state";
import { GroupFilter } from "@/components/group-filter";
import { Highlight } from "@/components/highlight";
import { countContacts, listContacts } from "@/lib/contacts";
import { contactForms, formatNumber, pluralize } from "@/lib/format";
import { listGroups } from "@/lib/groups";
import { listDueContacts } from "@/lib/keep-in-touch";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ContactsPage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const query = (firstParam(params.q) ?? "").trim();
  const addedId = Number(firstParam(params.added)) || null;
  const requestedGroupId = Number(firstParam(params.group)) || null;

  // The group is checked against the list first: one that is gone (deleted, or a stale link) means no filter
  const groups = await listGroups();
  const group = groups.find((item) => item.id === requestedGroupId) ?? null;
  const groupId = group?.id ?? null;

  // The "Пора связаться" block is hidden while a search is on, so it is not even read then
  const [contacts, total, groupTotal, dueContacts] = await Promise.all([
    listContacts(query, groupId),
    countContacts(),
    groupId ? countContacts(groupId) : 0,
    query ? [] : listDueContacts(groupId),
  ]);
  // What "Найдено: … из …" counts from: the whole list, or the people of the chosen group
  const shownTotal = group ? groupTotal : total;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-5">
        <div className="grid gap-3">
          <h1 className="font-display text-title font-semibold sm:text-title-lg">
            <Highlight className="rounded-12 px-2.5 sm:rounded-16 sm:px-3.5">Контакты</Highlight>
          </h1>
          <p className="text-lead text-copy">
            {query
              ? `Найдено: ${formatNumber(contacts.length)} из ${formatNumber(shownTotal)}`
              : group
                ? `В группе «${group.name}» — ${pluralize(groupTotal, contactForms)}`
                : total > 0
                  ? pluralize(total, contactForms)
                  : "Здесь будут люди, которых вы знаете лично"}
          </p>
        </div>
        <AddContactButton groups={groups} />
      </div>

      {total > 0 && <GroupFilter groups={groups} selectedId={groupId} />}

      {/* Keyed by the group: the block keeps its own rows (see due-contacts.tsx) and must start over for another group */}
      {!query && <DueContacts key={groupId ?? "all"} contacts={dueContacts} groupId={groupId} />}

      {total > 0 && <ContactSearch />}

      {contacts.length > 0 ? (
        <ContactList contacts={contacts} groups={groups} groupId={groupId} addedId={addedId} query={query} />
      ) : query ? (
        <EmptyState
          icon={<SearchXIcon />}
          title={
            group
              ? `Никого не нашли по запросу «${query}» в группе «${group.name}»`
              : `Никого не нашли по запросу «${query}»`
          }
          text="Проверьте написание или поищите иначе: по телефону, почте или слову из заметки."
        />
      ) : group ? (
        <EmptyState
          icon={<UsersIcon />}
          title={`В группе «${group.name}» пока никого нет`}
          text="Добавить человека в группу можно в окне «Изменить» на его карточке."
        />
      ) : (
        <EmptyState
          icon={<UsersIcon />}
          title="Пока нет ни одного контакта"
          text="Нажмите «Добавить контакт», чтобы записать первого человека."
        />
      )}
    </div>
  );
}
