import { SearchXIcon, UsersIcon } from "lucide-react";

import { AddContactButton } from "@/components/contact-buttons";
import { ContactList } from "@/components/contact-list";
import { ContactSearch } from "@/components/contact-search";
import { DueContacts } from "@/components/due-contacts";
import { EmptyState } from "@/components/empty-state";
import { GroupFilter } from "@/components/group-filter";
import { Highlight } from "@/components/highlight";
import { loadContactsPage } from "@/lib/contacts-page";
import { contactForms, formatNumber, pluralize } from "@/lib/format";

export default async function ContactsPage({ searchParams }: PageProps<"/">) {
  const { query, page, groups, group, addedId, added, contacts, hasMore, total, scopeCount, listCount, dueContacts } =
    await loadContactsPage(await searchParams);
  const groupId = group?.id ?? null;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-5">
        <div className="grid gap-3">
          <h1 className="font-display text-title font-semibold sm:text-title-lg">
            <Highlight className="rounded-12 px-2.5 sm:rounded-16 sm:px-3.5">Контакты</Highlight>
          </h1>
          <p className="text-lead text-copy">
            {query
              ? `Найдено: ${formatNumber(listCount)} из ${formatNumber(scopeCount)}`
              : group
                ? `В группе «${group.name}» — ${pluralize(listCount, contactForms)}`
                : total > 0
                  ? pluralize(total, contactForms)
                  : "Здесь будут люди, которых вы знаете лично"}
          </p>
        </div>
        <AddContactButton groups={groups} />
      </div>

      {total > 0 && <GroupFilter groups={groups} selectedId={groupId} />}

      {/* Keyed by the group: the block keeps its own rows (see due-contacts.tsx) and must start over for another group */}
      {!query && <DueContacts key={groupId ?? "all"} contacts={dueContacts} groupId={groupId} page={page} />}

      {total > 0 && <ContactSearch />}

      {added || contacts.length > 0 ? (
        <ContactList
          contacts={contacts}
          added={added}
          hasMore={hasMore}
          page={page}
          groups={groups}
          groupId={groupId}
          addedId={addedId}
          query={query}
        />
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
