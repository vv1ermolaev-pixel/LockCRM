import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, CalendarIcon, ClockIcon, NotebookPenIcon } from "lucide-react";

import { addNote, deleteContact, updateContact } from "@/app/actions";
import { ContactAvatar } from "@/components/contact-avatar";
import { DeleteContactButton, EditContactButton } from "@/components/contact-buttons";
import { GroupBadge } from "@/components/group-badge";
import { Highlight } from "@/components/highlight";
import { MarkContactedButton } from "@/components/mark-contacted-button";
import { NoteForm } from "@/components/note-form";
import { Button } from "@/components/ui/button";
import { contactFrequencyLabels } from "@/lib/contact-frequency";
import { getContact, listNotes } from "@/lib/contacts";
import { getContactGroupIds, listGroups } from "@/lib/groups";
import { formatCalendarDay, formatDateTime, formatOverdue, pluralize } from "@/lib/format";
import { getKeepInTouchStatus, type KeepInTouchStatus } from "@/lib/keep-in-touch";
import { cn } from "@/lib/utils";

export default async function ContactPage({ params, searchParams }: PageProps<"/contacts/[id]">) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  // The group chosen in the filter on the home page, so "Все контакты" goes back to it
  const fromGroup = Number((await searchParams).group);
  const backHref = Number.isInteger(fromGroup) && fromGroup > 0 ? `/?group=${fromGroup}` : "/";

  const [contact, notes, keepInTouch, groups, groupIds] = await Promise.all([
    getContact(id),
    listNotes(id),
    getKeepInTouchStatus(id),
    listGroups(),
    getContactGroupIds(id),
  ]);
  if (!contact) notFound();
  // In the user's order of groups
  const contactGroups = groups.filter((group) => groupIds.includes(group.id));

  return (
    <div className="grid gap-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="rounded-full bg-plate pr-4 pl-3 hover:bg-card">
          <Link href={backHref}>
            <ArrowLeftIcon />
            Все контакты
          </Link>
        </Button>
      </div>

      <section className="rounded-28 bg-card p-5 shadow-card sm:rounded-32 sm:p-7">
        <div className="flex flex-wrap items-start gap-4">
          <ContactAvatar name={contact.name} className="size-16 text-xl" />
          {/* basis-52 lets the buttons wrap to their own line on narrow screens instead of squeezing the name */}
          <div className="min-w-0 flex-1 basis-52 self-center">
            <h1 className="font-display text-name font-semibold break-words sm:text-name-lg">{contact.name}</h1>
            {contact.about && <p className="mt-1.5 text-lead text-copy">{contact.about}</p>}
          </div>
          <div className="flex gap-2">
            <EditContactButton
              contact={{
                name: contact.name,
                about: contact.about,
                howWeMet: contact.howWeMet,
                phone: contact.phone,
                email: contact.email,
                contactFrequency: contact.contactFrequency,
                groupIds,
              }}
              groups={groups}
              action={updateContact.bind(null, contact.id)}
            />
            <DeleteContactButton
              name={contact.name}
              notesCount={notes.length}
              action={deleteContact.bind(null, contact.id)}
            />
          </div>
        </div>

        <dl className="mt-6 grid gap-x-6 gap-y-4 rounded-18 bg-muted p-4 sm:grid-cols-2 sm:p-5">
          <Detail label="Откуда знакомы" className="sm:col-span-2">
            {contact.howWeMet}
          </Detail>
          <Detail label="Группы" className="sm:col-span-2">
            {contactGroups.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {contactGroups.map((group) => (
                  <GroupBadge key={group.id} name={group.name} color={group.color} className="h-7 px-2.5 text-sm" />
                ))}
              </div>
            )}
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
          <Detail label="Как часто общаться" className="sm:col-span-2">
            {contact.contactFrequency && (
              <div className="flex flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
                <span>{contactFrequencyLabels[contact.contactFrequency]}</span>
                {keepInTouch && <DueLine status={keepInTouch} />}
                <MarkContactedButton contactId={contact.id} />
              </div>
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

function DueLine({ status }: { status: KeepInTouchStatus }) {
  if (status.overdueDays > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-10 bg-butter px-2.5 py-1 text-sm font-bold">
        <ClockIcon className="size-4 shrink-0" aria-hidden />
        Пора связаться — {formatOverdue(status.overdueDays)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-copy">
      <CalendarIcon className="size-4 shrink-0" aria-hidden />
      Следующий раз — до {formatCalendarDay(status.dueDate, status.today)}
    </span>
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
