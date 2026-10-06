import { SearchXIcon, UsersIcon } from "lucide-react";

import { AddContactButton } from "@/components/contact-buttons";
import { ContactList } from "@/components/contact-list";
import { ContactSearch } from "@/components/contact-search";
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
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Контакты</h1>
          <p className="text-sm text-muted-foreground">
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

function EmptyState({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-background px-6 py-14 text-center">
      <div className="mb-1 text-muted-foreground [&_svg]:size-8">{icon}</div>
      <p className="font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
