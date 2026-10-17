import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, NotebookPenIcon } from "lucide-react";

import { addNote, updateContact } from "@/app/actions";
import { ContactAvatar } from "@/components/contact-avatar";
import { EditContactButton } from "@/components/contact-buttons";
import { Highlight } from "@/components/highlight";
import { NoteForm } from "@/components/note-form";
import { Button } from "@/components/ui/button";
import { getContact, listNotes } from "@/lib/contacts";
import { formatDateTime, pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";

export default async function ContactPage({ params }: PageProps<"/contacts/[id]">) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const [contact, notes] = await Promise.all([getContact(id), listNotes(id)]);
  if (!contact) notFound();

  return (
    <div className="grid gap-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="rounded-full bg-plate pr-4 pl-3 hover:bg-card">
          <Link href="/">
            <ArrowLeftIcon />
            Все контакты
          </Link>
        </Button>
      </div>

      <section className="rounded-28 bg-card p-5 shadow-card sm:rounded-32 sm:p-7">
        <div className="flex flex-wrap items-start gap-4">
          <ContactAvatar name={contact.name} className="size-16 text-xl" />
          {/* basis-52 lets the edit button wrap to its own line on narrow screens instead of squeezing the name */}
          <div className="min-w-0 flex-1 basis-52 self-center">
            <h1 className="font-display text-name font-semibold break-words sm:text-name-lg">{contact.name}</h1>
            {contact.about && <p className="mt-1.5 text-lead text-copy">{contact.about}</p>}
          </div>
          <EditContactButton
            contact={{
              name: contact.name,
              about: contact.about,
              howWeMet: contact.howWeMet,
              phone: contact.phone,
              email: contact.email,
            }}
            action={updateContact.bind(null, contact.id)}
          />
        </div>

        <dl className="mt-6 grid gap-x-6 gap-y-4 rounded-18 bg-muted p-4 sm:grid-cols-2 sm:p-5">
          <Detail label="Откуда знакомы" className="sm:col-span-2">
            {contact.howWeMet}
          </Detail>
          <Detail label="Телефон">
            {contact.phone && (
              <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} className="tabular-nums hover:underline">
                {contact.phone}
              </a>
            )}
          </Detail>
          <Detail label="Почта">
            {contact.email && (
              <a href={`mailto:${contact.email}`} className="break-all hover:underline">
                {contact.email}
              </a>
            )}
          </Detail>
        </dl>
      </section>

      <section className="grid gap-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-heading font-semibold sm:text-heading-lg">
            <Highlight className="rounded-10 px-2 sm:rounded-12 sm:px-2.5">Заметки</Highlight>
          </h2>
          {notes.length > 0 && (
            <span className="text-sm font-semibold text-copy">
              {pluralize(notes.length, ["заметка", "заметки", "заметок"])}
            </span>
          )}
        </div>

        <div className="grid gap-7 rounded-28 bg-card p-5 shadow-card sm:rounded-32 sm:p-7">
          <NoteForm action={addNote.bind(null, contact.id)} />

          {notes.length > 0 ? (
            // Timeline like the history card on the landing: the newest note is highlighted
            <ol className="relative grid pl-6.5 before:absolute before:top-2 before:bottom-2 before:left-1.5 before:w-0.5 before:rounded-full before:bg-mint-line">
              {notes.map((note, index) => {
                const isLatest = index === 0;
                return (
                  <li
                    key={note.id}
                    className={cn("relative grid justify-items-start gap-1.5", index < notes.length - 1 && "pb-5")}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "absolute top-1 -left-6.5 size-3.5 rounded-full",
                        isLatest ? "border-3 border-pistachio bg-ink" : "border-2 border-sage-dot bg-card",
                      )}
                    />
                    <time
                      dateTime={note.createdAt.toISOString()}
                      className={cn(
                        "py-0.5 font-display text-xs font-semibold",
                        isLatest ? "rounded-6 bg-pistachio px-2" : "text-muted-foreground",
                      )}
                    >
                      {formatDateTime(note.createdAt)}
                    </time>
                    <p
                      className={cn(
                        "text-base leading-note break-words whitespace-pre-wrap sm:text-17",
                        !isLatest && "text-copy",
                      )}
                    >
                      {note.body}
                    </p>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="flex items-center gap-3 rounded-18 bg-muted p-4 text-15 text-copy">
              <NotebookPenIcon className="size-5 shrink-0" />
              Заметок пока нет. Запишите, о чём поговорили, — чтобы не забыть контекст.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function Detail({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-13 font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words whitespace-pre-wrap">
        {children || <span className="text-muted-foreground/70">не указано</span>}
      </dd>
    </div>
  );
}
