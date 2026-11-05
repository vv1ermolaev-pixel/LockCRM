"use client";

import { useState, useTransition } from "react";
import { Link2OffIcon, Loader2Icon } from "lucide-react";

import { resetPassword } from "@/app/login/actions";
import { LoginCard, LoginForm } from "@/components/login-form";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { failureMessage } from "@/lib/action-messages";

// The page of the link to change the password. Without a working token, or when the link runs out while the page
// is open, it becomes «Ссылка устарела». The address there is the one this browser asked a link for last
export function ResetPasswordForm({ token, lastEmail }: { token?: string; lastEmail: string }) {
  const [expired, setExpired] = useState(!token);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("token", token ?? "");
    startTransition(async () => {
      try {
        const result = await resetPassword(formData);
        if (result.ok) {
          // A full page load: the login page shows the message with the sessions already gone
          window.location.replace("/login?password=changed");
        } else if ("expired" in result) {
          setExpired(true);
        } else {
          setError(result.error);
        }
      } catch {
        setError(failureMessage("сохранить пароль"));
      }
    });
  }

  if (expired) {
    return (
      <LoginForm
        purpose="password"
        icon={<Link2OffIcon aria-hidden />}
        title="Ссылка устарела"
        text="Запросите новую — она придёт на почту."
        submitLabel="Отправить ссылку повторно"
        initialEmail={lastEmail}
      />
    );
  }

  return (
    <LoginCard title="Новый пароль">
      <form onSubmit={handleSubmit} noValidate className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="new-password">Новый пароль</Label>
          <PasswordInput
            id="new-password"
            name="password"
            autoComplete="new-password"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "new-password-error" : undefined}
          />
          {error && (
            <p id="new-password-error" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <Button type="submit" size="lg" disabled={isPending}>
          {isPending && <Loader2Icon className="animate-spin" />}
          Сохранить пароль
        </Button>
      </form>
    </LoginCard>
  );
}
