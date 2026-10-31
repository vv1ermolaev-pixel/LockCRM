"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { createContact, type ContactActionResult } from "@/app/actions";
import { ContactFormDialog, type ContactFormValues } from "@/components/contact-form-dialog";
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
import { pluralize } from "@/lib/format";
import type { GroupListItem } from "@/lib/groups";

export function AddContactButton({ groups }: { groups: GroupListItem[] }) {
  const router = useRouter();

  return (
    <ContactFormDialog
      trigger={
        // Full width on phones, like the main button on the landing
        <Button size="lg" className="w-full sm:w-auto">
          <PlusIcon />
          Добавить контакт
        </Button>
      }
      title="Новый контакт"
      description="Обязательно только имя — остальное можно дописать позже."
      submitLabel="Добавить"
      groups={groups}
      action={createContact}
      onSuccess={({ id, name }) => {
        toast.success(`Контакт «${name}» добавлен`, {
          action: { label: "Открыть", onClick: () => router.push(`/contacts/${id}`) },
        });
        // Show the full list with the new contact highlighted
        router.push(`/?added=${id}`, { scroll: false });
      }}
    />
  );
}

export function EditContactButton({
  contact,
  groups,
  action,
}: {
  contact: ContactFormValues;
  groups: GroupListItem[];
  action: (formData: FormData) => Promise<ContactActionResult>;
}) {
  return (
    <ContactFormDialog
      trigger={
        <Button variant="secondary">
          <PencilIcon />
          Изменить
        </Button>
      }
      title="Изменить контакт"
      description="Поправьте данные и сохраните."
      submitLabel="Сохранить"
      defaultValues={contact}
      groups={groups}
      action={action}
      onSuccess={() => toast.success("Изменения сохранены")}
    />
  );
}

export function DeleteContactButton({
  name,
  notesCount,
  action,
}: {
  name: string;
  notesCount: number;
  action: () => Promise<{ ok: true }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(nextOpen: boolean) {
    if (isPending) return;
    setOpen(nextOpen);
  }

  function handleDelete() {
    startTransition(async () => {
      try {
        await action();
        toast.success(`Контакт «${name}» удалён`);
        // Replace, not push: "Back" must not lead to the card that no longer exists
        router.replace("/");
      } catch {
        toast.error("Не удалось удалить. Проверьте, что база данных запущена, и попробуйте ещё раз.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="destructive">
          <Trash2Icon />
          Удалить
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Удалить контакт?</DialogTitle>
          <DialogDescription>
            Контакт «{name}» удалится насовсем
            {notesCount > 0 && ` вместе с ${pluralize(notesCount, ["заметкой", "заметками", "заметками"])}`}. Вернуть не
            получится.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isPending}>
              Отмена
            </Button>
          </DialogClose>
          <Button variant="destructive" disabled={isPending} onClick={handleDelete}>
            {isPending && <Loader2Icon className="animate-spin" />}
            Удалить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
