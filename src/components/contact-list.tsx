"use client";

// A client component on purpose: the server sends only row data, not markup for every row,
// which keeps the page small and fast with thousands of contacts.

import { useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronRightIcon, Loader2Icon } from "lucide-react";

import { ContactAvatar } from "@/components/contact-avatar";
import { GroupBadge } from "@/components/group-badge";
import { MatchText } from "@/components/match-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ContactListItem, ContactMatch } from "@/lib/contacts";
import type { GroupListItem } from "@/lib/groups";
import { contactHref } from "@/lib/pagination";
import { findPhoneRanges, findWordRanges, parseSearchQuery, phoneMatches, type SearchQuery } from "@/lib/search";
import { cn } from "@/lib/utils";

export function ContactList({
  contacts,
  added,
  hasMore,
  page,
  groups,
  groupId,
  addedId,
  query,
}: {
  contacts: ContactListItem[];
  // The contact just added, shown above the rest; it is not among `contacts` then
  added: ContactListItem | null;
  // More rows behind «Показать ещё»
  hasMore: boolean;
  // How many parts of the list are shown (?page=N)
  page: number;
  // All groups in the user's order: labels take names, colors and order from here
  groups: GroupListItem[];
  // The group chosen in the filter: the card's "Все контакты" brings it back
  groupId: number | null;
  addedId: number | null;
  query: string;
}) {
  const search = parseSearchQuery(query);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isLoadingMore, startTransition] = useTransition();
  const listRef = useRef<HTMLUListElement>(null);
  // Rows shown when «Показать ещё» was pressed: after the last part the focus goes to the first new one
  const rowsBeforeMore = useRef<number | null>(null);
  const rows = added ? [added, ...contacts] : contacts;

  useEffect(() => {
    if (addedId) {
      document.getElementById(`contact-${addedId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [addedId]);

  // The button is gone after the last part, and the focus would fall to the page: it moves to the first new row
  useEffect(() => {
    if (isLoadingMore || rowsBeforeMore.current === null) return;
    const firstNew = rowsBeforeMore.current;
    rowsBeforeMore.current = null;
    if (!hasMore) listRef.current?.querySelectorAll<HTMLElement>(":scope > li > a")[firstNew]?.focus();
  }, [isLoadingMore, hasMore]);

  // The address says how many parts are shown, so a reload, "Back" and a copied link show as many.
  // Replaced, not pushed: "Back" leaves the page instead of taking parts away
  function showMore() {
    if (isLoadingMore) return;
    rowsBeforeMore.current = rows.length;
    const params = new URLSearchParams(searchParams);
    params.set("page", String(page + 1));
    startTransition(() => {
      router.replace(`${pathname}?${params}`, { scroll: false });
    });
  }

  return (
    <div className="grid gap-4">
      <ul ref={listRef} className="divide-y overflow-hidden rounded-28 bg-card shadow-card">
        {rows.map((contact) => {
          const isNew = contact.id === addedId;
          // Found by phone: the query's digits are not words, so "8" is not marked in "grigoriy78@…"
          const foundByPhone = Boolean(search.phone && contact.phone && phoneMatches(contact.phone, search.phone));
          const contactGroups = groups.filter((group) => contact.groupIds.includes(group.id));
          const marked = (text: string) => (
            <MatchText text={text} ranges={foundByPhone ? [] : findWordRanges(text, search.words)} />
          );
          return (
            <li key={contact.id} id={`contact-${contact.id}`} className="scroll-mt-24">
              <Link
                // The part shown belongs to the search results, not to the list "Все контакты" goes back to
                href={contactHref(contact.id, { groupId, page: query ? 1 : page })}
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
                  {contactGroups.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {contactGroups.map((group) => (
                        <GroupBadge key={group.id} name={group.name} color={group.color} />
                      ))}
                    </div>
                  )}
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
      {hasMore && (
        // Not `disabled` while loading: the browser would take the focus off a disabled button
        <Button
          variant="outline"
          size="lg"
          className="w-full bg-card shadow-mock"
          aria-disabled={isLoadingMore || undefined}
          onClick={showMore}
        >
          {isLoadingMore && <Loader2Icon className="animate-spin" aria-hidden />}
          Показать ещё
        </Button>
      )}
    </div>
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
