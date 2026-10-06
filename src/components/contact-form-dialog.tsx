"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Loader2Icon } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import type { ContactField, ContactFieldErrors } from "@/lib/validation";

export type ContactFormValues = Partial<Record<ContactField, string | null>>;

type ContactFormDialogProps = {
  trigger: ReactNode;
  title: string;
  description: string;
  submitLabel: string;
  defaultValues?: ContactFormValues;
  action: (formData: FormData) => Promise<ContactActionResult>;
  onSuccess: (result: { id: number; name: string }) => void;
};

export function ContactFormDialog({
  trigger,
  title,
  description,
  submitLabel,
  defaultValues = {},
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
        <form id="contact-form" noValidate onSubmit={handleSubmit} className="grid gap-4">
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
          <div className="grid gap-4 sm:grid-cols-2">
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

type FieldProps = {
  name: ContactField;
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
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {multiline ? (
        <Textarea {...shared} placeholder={inputProps.placeholder} className="min-h-16" />
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
