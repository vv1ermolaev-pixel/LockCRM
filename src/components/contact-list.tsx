"use client";

// A client component on purpose: the server sends only row data, not markup for every row,
// which keeps the page small and fast with thousands of contacts.

import { useEffect } from "react";
import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";

import { ContactAvatar } from "@/components/contact-avatar";
import { Badge } from "@/components/ui/badge";
import type { ContactListItem } from "@/lib/contacts";
import { cn } from "@/lib/utils";

export function ContactList({ contacts, addedId }: { contacts: ContactListItem[]; addedId: number | null }) {
  useEffect(() => {
    if (addedId) {
      document.getElementById(`contact-${addedId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [addedId]);

  return (
    <ul className="divide-y overflow-hidden rounded-28 bg-card shadow-card">
      {contacts.map((contact) => {
        const isNew = contact.id === addedId;
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
                  <span className="truncate font-bold">{contact.name}</span>
                  {isNew && <Badge>Новый</Badge>}
                </div>
                {contact.about && <p className="truncate text-sm text-muted-foreground">{contact.about}</p>}
              </div>
              <div className="hidden shrink-0 text-right text-sm text-muted-foreground sm:block">
                {contact.phone && <div className="tabular-nums">{contact.phone}</div>}
                {contact.email && <div className="max-w-56 truncate">{contact.email}</div>}
              </div>
              <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
