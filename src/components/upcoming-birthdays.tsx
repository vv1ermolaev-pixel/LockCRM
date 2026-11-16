// The "Скоро день рождения" block on the home page. A server component: its rows have no actions, only links.
// It looks like "Пора связаться" (due-contacts.tsx): a heading with the count, a card with one row per person

import Link from "next/link";

import { ContactAvatar } from "@/components/contact-avatar";
import { Highlight } from "@/components/highlight";
import { contactForms, formatBirthdayWhen, pluralize } from "@/lib/format";
import { contactHref } from "@/lib/pagination";
import type { UpcomingBirthday } from "@/lib/upcoming-birthdays";

// Rows get no `id` on purpose: the tests count the rows of the main list by `li[id^="contact-"]`.
// `groupId` and `page` go into the card link, so the card's "Все контакты" brings back the same list
export function UpcomingBirthdays({
  contacts,
  groupId,
  page,
}: {
  contacts: UpcomingBirthday[];
  groupId: number | null;
  page: number;
}) {
  if (contacts.length === 0) return null;

  return (
    <section aria-labelledby="upcoming-birthdays-title" className="grid gap-3.5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="upcoming-birthdays-title" className="font-display text-heading font-semibold sm:text-heading-lg">
          <Highlight className="rounded-10 px-2 sm:rounded-12 sm:px-2.5">Скоро день рождения</Highlight>
        </h2>
        <span className="text-sm font-bold text-copy sm:text-15">{pluralize(contacts.length, contactForms)}</span>
      </div>

      <ul className="divide-y overflow-hidden rounded-28 bg-card shadow-card">
        {contacts.map((contact) => (
          <li key={contact.id}>
            <Link
              href={contactHref(contact.id, { groupId, page })}
              className="group flex min-h-18 items-center gap-3 py-3 pr-3 pl-4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:min-h-19 sm:gap-3.5 sm:py-3.5 sm:pr-4 sm:pl-5"
            >
              <ContactAvatar name={contact.name} />
              <span className="grid min-w-0 flex-1 gap-1">
                <span className="truncate font-bold group-hover:underline">{contact.name}</span>
                <span className="text-sm text-copy-muted">{formatBirthdayWhen(contact)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
