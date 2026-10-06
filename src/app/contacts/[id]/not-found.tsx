import Link from "next/link";
import { UserXIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function ContactNotFound() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-background px-6 py-14 text-center">
      <UserXIcon className="size-8 text-muted-foreground" />
      <p className="font-medium">Такого контакта нет</p>
      <p className="text-sm text-muted-foreground">Возможно, ссылка неверная.</p>
      <Button asChild variant="outline" className="mt-2">
        <Link href="/">Ко всем контактам</Link>
      </Button>
    </div>
  );
}
