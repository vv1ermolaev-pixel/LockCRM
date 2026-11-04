"use client";

import { useTransition } from "react";
import { Loader2Icon } from "lucide-react";

import { signOut } from "@/app/login/actions";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await signOut();
      // A full page load, not a client navigation: the router cache must not keep the contacts for «Назад»
      window.location.replace("/login");
    });
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleClick} disabled={isPending} className="shrink-0">
      {isPending && <Loader2Icon className="animate-spin" />}
      Выйти
    </Button>
  );
}
