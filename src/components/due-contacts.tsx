"use client";

// A client component: after "Связались" a row turns into a confirmation with "Отменить" and goes away on its own timer.
//
// The block keeps its own list of rows, taken from the server when the block is shown, and does not follow
// later changes of `contacts`. The server drops a contact from the list as soon as it is marked, but its
// confirmation must stay where the row was until the timer ends; rows that stay put also make "Отменить"
// bring the row back in the same place. Coming back to the home page shows a fresh list from the server.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckIcon, Loader2Icon, Undo2Icon } from "lucide-react";
import { toast } from "sonner";

import { markContacted, undoMarkContacted } from "@/app/actions";
import { ContactAvatar } from "@/components/contact-avatar";
import { Highlight } from "@/components/highlight";
import { Button } from "@/components/ui/button";
import { contactFrequencyLabels } from "@/lib/contact-frequency";
import { contactForms, formatOverdue, pluralize } from "@/lib/format";
import type { DueContact } from "@/lib/keep-in-touch";
import { UNDO_WINDOW_MS } from "@/lib/mark-contacted";
import { cn } from "@/lib/utils";

// Keep in step with the collapse transition (duration-300) in DueRow
const COLLAPSE_MS = 300;

type RowState =
  | { kind: "due" }
  // "Связались" is being saved
  | { kind: "saving" }
  // Confirmation; `run` is new for every confirmation, which restarts the countdown bar after a failed undo
  | { kind: "marked"; previous: string | null; run: number }
  // "Отменить" is being saved
  | { kind: "undoing"; previous: string | null; run: number }
  // Collapsing; the row is removed when the transition is over
  | { kind: "leaving" };

type Row = { contact: DueContact; state: RowState };

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Rows get no `id` on purpose: the tests count the rows of the main list by `li[id^="contact-"]`
// `groupId` is the group chosen in the filter: the card's "Все контакты" brings it back
export function DueContacts({ contacts, groupId }: { contacts: DueContact[]; groupId: number | null }) {
  const [rows, setRows] = useState<Row[]>(() => contacts.map((contact) => ({ contact, state: { kind: "due" } })));
  // One timer per row, so several marks in a row do not disturb each other
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const runs = useRef(0);
  const nextRun = () => (runs.current += 1);

  useEffect(() => {
    const active = timers.current;
    return () => {
      active.forEach(clearTimeout);
      active.clear();
    };
  }, []);

  function setRowState(id: number, state: RowState) {
    setRows((current) => current.map((row) => (row.contact.id === id ? { ...row, state } : row)));
  }

  function startTimer(id: number, ms: number, callback: () => void) {
    clearTimeout(timers.current.get(id));
    timers.current.set(id, setTimeout(callback, ms));
  }

  function remove(id: number) {
    timers.current.delete(id);
    setRows((current) => current.filter((row) => row.contact.id !== id));
  }

  function leave(id: number) {
    // No transition with "reduce motion": nothing to wait for
    if (prefersReducedMotion()) {
      remove(id);
      return;
    }
    setRowState(id, { kind: "leaving" });
    startTimer(id, COLLAPSE_MS, () => remove(id));
  }

  function showConfirmation(id: number, previous: string | null) {
    setRowState(id, { kind: "marked", previous, run: nextRun() });
    startTimer(id, UNDO_WINDOW_MS, () => leave(id));
  }

  async function handleMark(id: number) {
    setRowState(id, { kind: "saving" });
    try {
      const { previous } = await markContacted(id);
      showConfirmation(id, previous);
    } catch {
      setRowState(id, { kind: "due" });
      toast.error("Не удалось отметить общение. Проверьте, что база данных запущена, и попробуйте ещё раз.");
    }
  }

  async function handleUndo(id: number, previous: string | null, run: number) {
    clearTimeout(timers.current.get(id));
    setRowState(id, { kind: "undoing", previous, run });
    try {
      await undoMarkContacted(id, previous);
      setRowState(id, { kind: "due" });
    } catch {
      toast.error("Не удалось отменить. Проверьте, что база данных запущена, и попробуйте ещё раз.");
      // The mark is still saved: offer "Отменить" again for another few seconds
      showConfirmation(id, previous);
    }
  }

  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="due-contacts-title" className="grid gap-3.5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="due-contacts-title" className="font-display text-heading font-semibold sm:text-heading-lg">
          <Highlight className="rounded-10 px-2 sm:rounded-12 sm:px-2.5">Пора связаться</Highlight>
        </h2>
        <span className="text-sm font-bold text-copy sm:text-15">{pluralize(rows.length, contactForms)}</span>
      </div>

      <ul className="divide-y overflow-hidden rounded-28 bg-card shadow-card">
        {rows.map(({ contact, state }) => (
          <DueRow key={contact.id} leaving={state.kind === "leaving"}>
            {state.kind === "marked" || state.kind === "undoing" ? (
              <Confirmation
                key={state.run}
                name={contact.name}
                undoing={state.kind === "undoing"}
                onUndo={() => handleUndo(contact.id, state.previous, state.run)}
              />
            ) : (
              <div className="flex min-h-18 items-center gap-2.5 py-3 pr-3 pl-4 sm:min-h-19 sm:gap-3 sm:py-3.5 sm:pr-4 sm:pl-5">
                <Link
                  href={`/contacts/${contact.id}${groupId ? `?group=${groupId}` : ""}`}
                  className="group flex min-w-0 flex-1 items-center gap-3 rounded-12 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring sm:gap-3.5"
                >
                  <ContactAvatar name={contact.name} />
                  <span className="grid min-w-0 flex-1 gap-1">
                    <span className="truncate font-bold group-hover:underline">{contact.name}</span>
                    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-copy-muted">
                      {contactFrequencyLabels[contact.contactFrequency]} ·{" "}
                      <span className="rounded-6 bg-butter px-1.75 py-px text-13 font-bold text-ink">
                        {formatOverdue(contact.overdueDays)}
                      </span>
                    </span>
                  </span>
                </Link>
                {/* Next to the link, not inside it: a button in a link is invalid and the press would also open the card */}
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label={`Связались: ${contact.name}`}
                  title="Связались"
                  disabled={state.kind === "saving"}
                  onClick={() => handleMark(contact.id)}
                >
                  {state.kind === "saving" ? (
                    <Loader2Icon className="animate-spin" />
                  ) : (
                    <CheckIcon className="size-5" strokeWidth={2.5} />
                  )}
                </Button>
              </div>
            )}
          </DueRow>
        ))}
      </ul>
    </section>
  );
}

// The row collapses by its height: the grid row goes from 1fr to 0fr, which a plain `height` cannot animate
function DueRow({ leaving, children }: { leaving: boolean; children: React.ReactNode }) {
  return (
    <li
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300 motion-reduce:transition-none",
        leaving ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
      )}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </li>
  );
}

function Confirmation({ name, undoing, onUndo }: { name: string; undoing: boolean; onUndo: () => void }) {
  return (
    <div className="relative flex min-h-18 items-center gap-2.5 bg-muted py-3 pr-3 pl-4 duration-200 animate-in fade-in motion-reduce:animate-none sm:min-h-19 sm:gap-3 sm:pr-4 sm:pl-5">
      <span
        aria-hidden
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ink text-pistachio"
      >
        <CheckIcon className="size-5.5" strokeWidth={3} />
      </span>
      <div role="status" className="grid min-w-0 flex-1 gap-0.5">
        <span className="font-bold">Отметили общение</span>
        <span className="truncate text-sm text-copy-muted">{name}</span>
      </div>
      <Button
        variant="outline"
        className="gap-1.5 bg-card px-3 text-sm hover:bg-pistachio-hover sm:px-3.5"
        disabled={undoing}
        onClick={onUndo}
      >
        {/* The icon is dropped on phones: without it "Отметили общение" fits on one line at 375-390 px */}
        {undoing ? (
          <Loader2Icon className="size-4 animate-spin" />
        ) : (
          <Undo2Icon className="hidden size-4 sm:block" strokeWidth={2.5} />
        )}
        Отменить
      </Button>
      <CountdownBar />
    </div>
  );
}

// Shrinks from the full width to nothing over the undo window. Hidden with "reduce motion": a bar that
// jumps to zero would say nothing
function CountdownBar() {
  const [started, setStarted] = useState(false);

  // Two frames, so the full-width bar is painted once before the transition starts
  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setStarted(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, []);

  return (
    <span
      aria-hidden
      className={cn(
        "absolute bottom-0 left-0 h-0.75 rounded-r-full bg-mid-green transition-[width] ease-linear motion-reduce:hidden",
        started ? "w-0" : "w-full",
      )}
      style={{ transitionDuration: `${UNDO_WINDOW_MS}ms` }}
    />
  );
}
