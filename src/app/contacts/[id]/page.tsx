import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, MailIcon, NotebookPenIcon, PhoneIcon, UsersIcon } from "lucide-react";

import { addNote, updateContact } from "@/app/actions";
import { ContactAvatar } from "@/components/contact-avatar";
import { EditContactButton } from "@/components/contact-buttons";
import { NoteForm } from "@/components/note-form";
import { Button } from "@/components/ui/button";
import { getContact, listNotes } from "@/lib/contacts";
import { formatDateTime, pluralize } from "@/lib/format";

export default async function ContactPage({ params }: PageProps<"/contacts/[id]">) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const [contact, notes] = await Promise.all([getContact(id), listNotes(id)]);
  if (!contact) notFound();

  return (
    <div className="grid gap-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2.5 text-muted-foreground">
          <Link href="/">
            <ArrowLeftIcon />
            Все контакты
          </Link>
        </Button>
      </div>

      <section className="rounded-xl border bg-background p-5 sm:p-6">
        <div className="flex flex-wrap items-start gap-4">
          <ContactAvatar name={contact.name} className="size-14 text-lg" />
          {/* basis-52 lets the edit button wrap to its own line on narrow screens instead of squeezing the name */}
          <div className="min-w-0 flex-1 basis-52">
            <h1 className="text-2xl font-semibold tracking-tight break-words">{contact.name}</h1>
            {contact.about && <p className="text-muted-foreground">{contact.about}</p>}
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

        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <Detail icon={<UsersIcon />} label="Откуда знакомы" className="sm:col-span-2">
            {contact.howWeMet}
          </Detail>
          <Detail icon={<PhoneIcon />} label="Телефон">
            {contact.phone && (
              <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} className="tabular-nums hover:underline">
                {contact.phone}
              </a>
            )}
          </Detail>
          <Detail icon={<MailIcon />} label="Почта">
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
          <h2 className="text-lg font-semibold tracking-tight">Заметки</h2>
          {notes.length > 0 && (
            <span className="text-sm text-muted-foreground">
              {pluralize(notes.length, ["заметка", "заметки", "заметок"])}
            </span>
          )}
        </div>

        <NoteForm action={addNote.bind(null, contact.id)} />

        {notes.length > 0 ? (
          <ol className="grid gap-3">
            {notes.map((note) => (
              <li key={note.id} className="rounded-xl border bg-background p-4">
                <time dateTime={note.createdAt.toISOString()} className="text-xs text-muted-foreground">
                  {formatDateTime(note.createdAt)}
                </time>
                <p className="mt-1 whitespace-pre-wrap break-words">{note.body}</p>
              </li>
            ))}
          </ol>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-dashed bg-background p-4 text-sm text-muted-foreground">
            <NotebookPenIcon className="size-5 shrink-0" />
            Заметок пока нет. Запишите, о чём поговорили, — чтобы не забыть контекст.
          </div>
        )}
      </section>
    </div>
  );
}

function Detail({
  icon,
  label,
  children,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="flex items-center gap-1.5 text-sm text-muted-foreground [&_svg]:size-4">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 whitespace-pre-wrap break-words">
        {children || <span className="text-muted-foreground/70">не указано</span>}
      </dd>
    </div>
  );
}
