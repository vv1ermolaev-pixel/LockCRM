import { SearchXIcon, UsersIcon } from "lucide-react";

import { AddContactButton } from "@/components/contact-buttons";
import { ContactList } from "@/components/contact-list";
import { ContactSearch } from "@/components/contact-search";
import { EmptyState } from "@/components/empty-state";
import { Highlight } from "@/components/highlight";
import { countContacts, listContacts } from "@/lib/contacts";
import { formatNumber, pluralize } from "@/lib/format";

const contactForms: [string, string, string] = ["контакт", "контакта", "контактов"];

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ContactsPage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const query = (firstParam(params.q) ?? "").trim();
  const addedId = Number(firstParam(params.added)) || null;

  const [contacts, total] = await Promise.all([listContacts(query), countContacts()]);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-5">
        <div className="grid gap-3">
          <h1 className="font-display text-title font-semibold sm:text-title-lg">
            <Highlight className="rounded-12 px-2.5 sm:rounded-16 sm:px-3.5">Контакты</Highlight>
          </h1>
          <p className="text-lead text-copy">
            {query
              ? `Найдено: ${formatNumber(contacts.length)} из ${formatNumber(total)}`
              : total > 0
                ? pluralize(total, contactForms)
                : "Здесь будут люди, которых вы знаете лично"}
          </p>
        </div>
        <AddContactButton />
      </div>

      {total > 0 && <ContactSearch />}

      {contacts.length > 0 ? (
        <ContactList contacts={contacts} addedId={addedId} />
      ) : query ? (
        <EmptyState
          icon={<SearchXIcon />}
          title={`Никого не нашли по запросу «${query}»`}
          text="Проверьте написание или поищите по фамилии."
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
