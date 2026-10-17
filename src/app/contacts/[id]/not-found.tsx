import Link from "next/link";
import { UserXIcon } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export default function ContactNotFound() {
  return (
    <EmptyState
      icon={<UserXIcon />}
      title="Такого контакта нет"
      text="Возможно, ссылка неверная."
      action={
        <Button asChild>
          <Link href="/">Ко всем контактам</Link>
        </Button>
      }
    />
  );
}
