"use client";

// The "Группы" window: every group with its number of people; create, rename, recolor and delete.
// Groups come from the server in the user's order; after each action the page is re-rendered
// (revalidatePath) and the window gets the fresh list. Rename and delete happen inside the row,
// not in a second window on top: on a phone that is cramped and confuses the focus.

import { useState, useTransition } from "react";
import { CheckIcon, Loader2Icon, PencilIcon, TagsIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { createGroup, deleteGroup, renameGroup, setGroupColor } from "@/app/actions";
import { GroupBadge } from "@/components/group-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { pluralize } from "@/lib/format";
import { groupColorClasses, groupColorLabels, groupColors, type GroupColor } from "@/lib/group-colors";
import type { GroupListItem } from "@/lib/groups";
import { cn } from "@/lib/utils";

const peopleForms: [string, string, string] = ["человек", "человека", "человек"];
const NETWORK_ERROR = "Не удалось сохранить. Проверьте, что база данных запущена, и попробуйте ещё раз.";

// One row at a time is open for a color, a new name or a delete confirmation
type OpenRow = { id: number; mode: "color" | "rename" | "delete" } | null;

export function GroupsDialog({ groups }: { groups: GroupListItem[] }) {
  const [open, setOpen] = useState(false);
  const [rowState, setOpenRow] = useState<OpenRow>(null);
  // A deleted group's row is gone: nothing is open then, and Escape closes the window again
  const openRow = rowState && groups.some((group) => group.id === rowState.id) ? rowState : null;

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) setOpenRow(null);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-10 rounded-full border-transparent bg-plate px-4 text-sm hover:bg-card">
          <TagsIcon />
          Группы
        </Button>
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-md"
        // Escape first closes the open row: the rename or the confirmation is cancelled, the window stays
        onEscapeKeyDown={(event) => {
          if (openRow) {
            event.preventDefault();
            setOpenRow(null);
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Группы</DialogTitle>
          <DialogDescription>Порядок групп меняется перетаскиванием в ряду фильтра на главной.</DialogDescription>
        </DialogHeader>
        {groups.length > 0 && (
          <ul className="grid divide-y rounded-18 bg-muted">
            {groups.map((group) => (
              <GroupRow
                key={group.id}
                group={group}
                mode={openRow?.id === group.id ? openRow.mode : null}
                onModeChange={(mode) => setOpenRow(mode ? { id: group.id, mode } : null)}
              />
            ))}
          </ul>
        )}
        <NewGroupForm />
      </DialogContent>
    </Dialog>
  );
}

function GroupRow({
  group,
  mode,
  onModeChange,
}: {
  group: GroupListItem;
  mode: "color" | "rename" | "delete" | null;
  onModeChange: (mode: "color" | "rename" | "delete" | null) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<void>) {
    startTransition(async () => {
      try {
        await action();
      } catch {
        toast.error(NETWORK_ERROR);
      }
    });
  }

  function changeMode(next: typeof mode) {
    setError(null);
    onModeChange(next);
  }

  function handleColor(color: GroupColor) {
    run(async () => {
      await setGroupColor(group.id, color);
      changeMode(null);
    });
  }

  function handleRename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    run(async () => {
      const result = await renameGroup(group.id, formData);
      if (result.ok) {
        changeMode(null);
      } else {
        setError(result.error);
      }
    });
  }

  function handleDelete() {
    // The row goes away with the fresh list from the server
    run(async () => {
      await deleteGroup(group.id);
    });
  }

  const people = pluralize(group.contactCount, peopleForms);

  if (mode === "delete") {
    return (
      <li className="grid gap-3 p-3 sm:p-4" role="group" aria-label={`Удаление группы «${group.name}»`}>
        <p className="text-15">
          Удалить группу «{group.name}»?{" "}
          {group.contactCount > 0
            ? `${pluralize(group.contactCount, ["человек останется", "человека останутся", "человек останутся"])} в контактах, просто без этой группы.`
            : "В ней пока никого нет."}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" disabled={isPending} onClick={() => changeMode(null)} autoFocus>
            Отмена
          </Button>
          <Button variant="destructive" size="sm" disabled={isPending} onClick={handleDelete}>
            {isPending && <Loader2Icon className="animate-spin" />}
            Удалить
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="grid gap-2.5 p-3 sm:p-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={mode === "color"}
          aria-label={`Цвет группы «${group.name}»: ${groupColorLabels[group.color]}. Сменить цвет`}
          onClick={() => changeMode(mode === "color" ? null : "color")}
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          <span className={cn("size-6 rounded-full ring-1 ring-rule", groupColorClasses[group.color])} />
        </button>
        {mode === "rename" ? (
          <form className="grid min-w-0 flex-1 gap-2" onSubmit={handleRename} noValidate>
            <Input
              name="name"
              aria-label={`Новое название группы «${group.name}»`}
              defaultValue={group.name}
              autoFocus
              autoComplete="off"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `group-${group.id}-error` : undefined}
            />
            {error && (
              <p id={`group-${group.id}-error`} className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => changeMode(null)}>
                Отмена
              </Button>
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending && <Loader2Icon className="animate-spin" />}
                Сохранить
              </Button>
            </div>
          </form>
        ) : (
          <>
            <p className="min-w-0 flex-1">
              <GroupBadge name={group.name} color={group.color} className="h-7 px-2.5 text-sm" />
              <span className="ml-2 text-sm whitespace-nowrap text-copy-muted">· {people}</span>
            </p>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Переименовать группу «${group.name}»`}
              onClick={() => changeMode("rename")}
            >
              <PencilIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Удалить группу «${group.name}»`}
              className="text-destructive hover:text-destructive"
              onClick={() => changeMode("delete")}
            >
              <Trash2Icon />
            </Button>
          </>
        )}
      </div>
      {mode === "color" && (
        <div role="group" aria-label={`Цвет группы «${group.name}»`} className="flex flex-wrap gap-1.5 pl-1">
          {groupColors.map((color) => {
            const selected = color === group.color;
            return (
              <button
                key={color}
                type="button"
                aria-label={groupColorLabels[color]}
                aria-pressed={selected}
                disabled={isPending}
                onClick={() => handleColor(color)}
                className={cn(
                  "flex size-11 items-center justify-center rounded-full border-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  groupColorClasses[color],
                  selected ? "border-ink" : "border-transparent",
                )}
              >
                {selected && <CheckIcon className="size-4.5 text-ink" strokeWidth={3} aria-hidden />}
              </button>
            );
          })}
        </div>
      )}
    </li>
  );
}

function NewGroupForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      try {
        const result = await createGroup(formData);
        if (result.ok) {
          setError(null);
          form.reset();
        } else {
          setError(result.error);
        }
      } catch {
        toast.error(NETWORK_ERROR);
      }
    });
  }

  return (
    <form className="grid gap-2" onSubmit={handleSubmit} noValidate>
      <div className="flex gap-2">
        <Input
          name="name"
          aria-label="Новая группа"
          placeholder="Новая группа, например: Аналитики"
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "new-group-error" : undefined}
        />
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2Icon className="animate-spin" />}
          Добавить
        </Button>
      </div>
      {error && (
        <p id="new-group-error" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
