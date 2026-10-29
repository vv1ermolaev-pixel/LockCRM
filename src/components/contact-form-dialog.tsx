"use client";

import { useState, useTransition, type ReactNode } from "react";
import { CheckIcon, Loader2Icon, PlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import type { ContactActionResult } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { contactFrequencies, contactFrequencyLabels, noContactFrequency } from "@/lib/contact-frequency";
import { groupColorClasses } from "@/lib/group-colors";
import type { GroupListItem } from "@/lib/groups";
import { cn } from "@/lib/utils";
import { groupNameKey, type ContactField, type ContactFieldErrors } from "@/lib/validation";

type TextField = Exclude<ContactField, "groupIds" | "newGroups">;

export type ContactFormValues = Partial<Record<TextField, string | null>> & { groupIds?: number[] };

type ContactFormDialogProps = {
  trigger: ReactNode;
  title: string;
  description: string;
  submitLabel: string;
  defaultValues?: ContactFormValues;
  // All groups in the user's order
  groups: GroupListItem[];
  action: (formData: FormData) => Promise<ContactActionResult>;
  onSuccess: (result: { id: number; name: string }) => void;
};

export function ContactFormDialog({
  trigger,
  title,
  description,
  submitLabel,
  defaultValues = {},
  groups,
  action,
  onSuccess,
}: ContactFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<ContactFieldErrors>({});
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(nextOpen: boolean) {
    if (isPending) return;
    setOpen(nextOpen);
    if (!nextOpen) setErrors({});
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        const result = await action(formData);
        if (!result.ok) {
          setErrors(result.errors);
          return;
        }
        setErrors({});
        setOpen(false);
        onSuccess(result);
      } catch {
        toast.error("Не удалось сохранить. Проверьте, что база данных запущена, и попробуйте ещё раз.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form id="contact-form" noValidate onSubmit={handleSubmit} className="grid gap-4.5">
          <Field
            name="name"
            label="Имя"
            required
            autoFocus
            autoComplete="off"
            placeholder="Например: Анна Смирнова"
            defaultValue={defaultValues.name}
            error={errors.name}
          />
          <Field
            name="about"
            label="Кто это"
            placeholder="Например: дизайнер, бывшая коллега"
            defaultValue={defaultValues.about}
            error={errors.about}
          />
          <Field
            name="howWeMet"
            label="Откуда знакомы"
            multiline
            placeholder="Например: вместе учились на курсах английского в 2021"
            defaultValue={defaultValues.howWeMet}
            error={errors.howWeMet}
          />
          <div className="grid gap-4.5 sm:grid-cols-2">
            <Field
              name="phone"
              label="Телефон"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder="+7 900 123-45-67"
              defaultValue={defaultValues.phone}
              error={errors.phone}
            />
            <Field
              name="email"
              label="Почта"
              type="email"
              autoComplete="off"
              placeholder="anna@example.com"
              defaultValue={defaultValues.email}
              error={errors.email}
            />
          </div>
          <FrequencyField defaultValue={defaultValues.contactFrequency} error={errors.contactFrequency} />
          <GroupsField
            groups={groups}
            defaultGroupIds={defaultValues.groupIds ?? []}
            error={errors.newGroups ?? errors.groupIds}
          />
        </form>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isPending}>
              Отмена
            </Button>
          </DialogClose>
          <Button type="submit" form="contact-form" disabled={isPending}>
            {isPending && <Loader2Icon className="animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FrequencyField({ defaultValue, error }: { defaultValue?: string | null; error?: string }) {
  const id = "contact-contactFrequency";
  const errorId = `${id}-error`;

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Как часто общаться</Label>
      {/* With `name`, Radix Select adds a hidden <select>, so the value goes into FormData like other fields */}
      <Select name="contactFrequency" defaultValue={defaultValue ?? noContactFrequency}>
        <SelectTrigger
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={noContactFrequency}>Не задано</SelectItem>
          {contactFrequencies.map((frequency) => (
            <SelectItem key={frequency} value={frequency}>
              {contactFrequencyLabels[frequency]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

// The dialog content unmounts on close, so the checks start again from the saved groups every time it opens:
// "Отмена" and closing the window change nothing
function GroupsField({
  groups,
  defaultGroupIds,
  error,
}: {
  groups: GroupListItem[];
  defaultGroupIds: number[];
  error?: string;
}) {
  const [checkedIds, setCheckedIds] = useState(() => new Set(defaultGroupIds));
  // Typed names of groups that do not exist yet; the server creates them on save
  const [newNames, setNewNames] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const labelId = "contact-groups-label";
  const errorId = "contact-groups-error";

  function toggle(id: number) {
    setCheckedIds((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function addDraft() {
    const name = draft.trim();
    if (!name) return;
    const key = groupNameKey(name);
    const existing = groups.find((group) => groupNameKey(group.name) === key);
    if (existing) {
      setCheckedIds((current) => new Set(current).add(existing.id));
    } else if (!newNames.some((newName) => groupNameKey(newName) === key)) {
      setNewNames((current) => [...current, name]);
    }
    setDraft("");
  }

  return (
    <div className="grid gap-2">
      <Label id={labelId} asChild>
        <p>Группы</p>
      </Label>
      <div
        role="group"
        aria-labelledby={labelId}
        aria-describedby={error ? errorId : undefined}
        className="flex flex-wrap gap-2"
      >
        {groups.map((group) => {
          const checked = checkedIds.has(group.id);
          return (
            <button
              key={group.id}
              type="button"
              aria-pressed={checked}
              onClick={() => toggle(group.id)}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-12 border-2 px-3 text-sm font-bold text-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                groupColorClasses[group.color],
                checked ? "border-ink" : "border-transparent",
              )}
            >
              {checked && <CheckIcon className="size-4" strokeWidth={3} aria-hidden />}
              {group.name}
            </button>
          );
        })}
        {newNames.map((name) => (
          // No color yet: the server gives one on save
          <span
            key={name}
            className="inline-flex h-9 items-center gap-1 rounded-12 border-2 border-ink bg-card pr-1 pl-3 text-sm font-bold text-ink"
          >
            <CheckIcon className="size-4" strokeWidth={3} aria-hidden />
            {name}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Убрать новую группу «${name}»`}
              onClick={() => setNewNames((current) => current.filter((newName) => newName !== name))}
            >
              <XIcon />
            </Button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          aria-label="Новая группа"
          placeholder="Новая группа, например: Теннис"
          autoComplete="off"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter adds the group instead of submitting the whole form
            if (event.key === "Enter") {
              event.preventDefault();
              addDraft();
            }
          }}
        />
        <Button type="button" variant="secondary" size="icon" aria-label="Отметить группу" onClick={addDraft}>
          <PlusIcon />
        </Button>
      </div>
      {groups.map(
        (group) => checkedIds.has(group.id) && <input key={group.id} type="hidden" name="groupIds" value={group.id} />,
      )}
      {newNames.map((name) => (
        <input key={name} type="hidden" name="newGroups" value={name} />
      ))}
      {/* A name typed but not added with "+" is saved too: the person meant it */}
      {draft.trim() && <input type="hidden" name="newGroups" value={draft} />}
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

type FieldProps = {
  name: TextField;
  label: string;
  error?: string;
  multiline?: boolean;
  defaultValue?: string | null;
} & Omit<React.ComponentProps<"input">, "name" | "defaultValue">;

function Field({ name, label, error, multiline, required, defaultValue, ...inputProps }: FieldProps) {
  const id = `contact-${name}`;
  const errorId = `${id}-error`;
  const shared = {
    id,
    name,
    defaultValue: defaultValue ?? "",
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? errorId : undefined,
  };

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {multiline ? (
        <Textarea {...shared} placeholder={inputProps.placeholder} className="min-h-20" />
      ) : (
        <Input {...shared} {...inputProps} required={required} />
      )}
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
