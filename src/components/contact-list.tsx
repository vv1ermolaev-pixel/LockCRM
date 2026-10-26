"use client";

// A client component on purpose: the server sends only row data, not markup for every row,
// which keeps the page small and fast with thousands of contacts.

import { useEffect } from "react";
import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";

import { ContactAvatar } from "@/components/contact-avatar";
import { MatchText } from "@/components/match-text";
import { Badge } from "@/components/ui/badge";
import type { ContactListItem, ContactMatch } from "@/lib/contacts";
import { findPhoneRanges, findWordRanges, parseSearchQuery, phoneMatches, type SearchQuery } from "@/lib/search";
import { cn } from "@/lib/utils";

export function ContactList({
  contacts,
  addedId,
  query,
}: {
  contacts: ContactListItem[];
  addedId: number | null;
  query: string;
}) {
  const search = parseSearchQuery(query);

  useEffect(() => {
    if (addedId) {
      document.getElementById(`contact-${addedId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [addedId]);

  return (
    <ul className="divide-y overflow-hidden rounded-28 bg-card shadow-card">
      {contacts.map((contact) => {
        const isNew = contact.id === addedId;
        // Found by phone: the query's digits are not words, so "8" is not marked in "grigoriy78@…"
        const foundByPhone = Boolean(search.phone && contact.phone && phoneMatches(contact.phone, search.phone));
        const marked = (text: string) => (
          <MatchText text={text} ranges={foundByPhone ? [] : findWordRanges(text, search.words)} />
        );
        return (
          <li key={contact.id} id={`contact-${contact.id}`} className="scroll-mt-24">
            <Link
              href={`/contacts/${contact.id}`}
              className={cn(
                "flex items-center gap-3.5 px-4 py-3.5 transition-colors duration-150 hover:bg-muted focus-visible:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:px-5",
                isNew && "bg-butter hover:bg-butter",
              )}
            >
              <ContactAvatar name={contact.name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-bold">{marked(contact.name)}</span>
                  {isNew && <Badge>Новый</Badge>}
                </div>
                {contact.about && <p className="truncate text-sm text-muted-foreground">{marked(contact.about)}</p>}
                {contact.match && <MatchLine match={contact.match} search={search} />}
              </div>
              <div className="hidden shrink-0 text-right text-sm text-muted-foreground sm:block">
                {contact.phone && (
                  <div className="tabular-nums">
                    <MatchText text={contact.phone} ranges={findPhoneRanges(contact.phone, search.phone)} />
                  </div>
                )}
                {contact.email && <div className="max-w-56 truncate">{marked(contact.email)}</div>}
              </div>
              <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

const matchLabels: Record<ContactMatch["field"], string> = {
  note: "Заметка",
  howWeMet: "Откуда знакомы",
  phone: "Телефон",
  email: "Почта",
};

// Why the contact was found. Wider screens already show phone and email on the right, marked,
// so for those the line is shown on phones only
function MatchLine({ match, search }: { match: ContactMatch; search: SearchQuery }) {
  const isPhone = match.field === "phone";
  const isContactField = isPhone || match.field === "email";
  const ranges = isPhone ? findPhoneRanges(match.text, search.phone) : findWordRanges(match.text, search.words);
  return (
    <p
      className={cn(
        "text-sm text-muted-foreground",
        isContactField ? "truncate sm:hidden" : "line-clamp-2 break-words",
        isPhone && "tabular-nums",
      )}
    >
      <span className="font-semibold text-copy">{matchLabels[match.field]}:</span>{" "}
      <MatchText text={match.text} ranges={ranges} />
    </p>
  );
}
