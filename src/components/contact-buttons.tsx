"use client";

import { useRouter } from "next/navigation";
import { PencilIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { createContact, type ContactActionResult } from "@/app/actions";
import { ContactFormDialog, type ContactFormValues } from "@/components/contact-form-dialog";
import { Button } from "@/components/ui/button";

export function AddContactButton() {
  const router = useRouter();

  return (
    <ContactFormDialog
      trigger={
        <Button size="lg">
          <PlusIcon />
          Добавить контакт
        </Button>
      }
      title="Новый контакт"
      description="Обязательно только имя — остальное можно дописать позже."
      submitLabel="Добавить"
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
  action,
}: {
  contact: ContactFormValues;
  action: (formData: FormData) => Promise<ContactActionResult>;
}) {
  return (
    <ContactFormDialog
      trigger={
        <Button variant="outline">
          <PencilIcon />
          Изменить
        </Button>
      }
      title="Изменить контакт"
      description="Поправьте данные и сохраните."
      submitLabel="Сохранить"
      defaultValues={contact}
      action={action}
      onSuccess={() => toast.success("Изменения сохранены")}
    />
  );
}
