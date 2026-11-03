"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import type { NoteActionResult } from "@/app/actions";
import { ContactDeletedNotice } from "@/components/contact-deleted-notice";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { failureMessage } from "@/lib/action-messages";

// `listHref` is where "К списку контактов" leads when the contact turns out to be deleted
export function NoteForm({
  action,
  listHref,
}: {
  action: (formData: FormData) => Promise<NoteActionResult>;
  listHref: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [contactDeleted, setContactDeleted] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      try {
        const result = await action(formData);
        if (!result.ok) {
          // The text stays in the field: the form is not reset
          setContactDeleted("contactDeleted" in result);
          setError("error" in result ? result.error : null);
          return;
        }
        setError(null);
        setContactDeleted(false);
        form.reset();
        toast.success("Заметка сохранена");
      } catch {
        toast.error(failureMessage("сохранить заметку"));
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="grid gap-3">
      <label htmlFor="note-body" className="sr-only">
        Новая заметка
      </label>
      <Textarea
        id="note-body"
        name="body"
        placeholder="О чём поговорили, о чём договорились…"
        className="min-h-24"
        aria-invalid={error || contactDeleted ? true : undefined}
        aria-describedby={error ? "note-body-error" : contactDeleted ? "note-body-deleted" : undefined}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            formRef.current?.requestSubmit();
          }
        }}
      />
      {contactDeleted ? (
        <ContactDeletedNotice id="note-body-deleted" listHref={listHref} />
      ) : (
        error && (
          <p id="note-body-error" className="text-sm text-destructive">
            {error}
          </p>
        )
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="hidden text-13 text-muted-foreground sm:block">Ctrl + Enter — сохранить</p>
        <Button type="submit" disabled={isPending} className="ml-auto">
          {isPending && <Loader2Icon className="animate-spin" />}
          Добавить заметку
        </Button>
      </div>
    </form>
  );
}
