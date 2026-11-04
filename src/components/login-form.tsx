"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, MailCheckIcon } from "lucide-react";

import { requestLoginLink } from "@/app/login/actions";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { failureMessage } from "@/lib/action-messages";

// One form for «Вход в приложение» and «Ссылка устарела»: only the title, the text, the button label
// and the email in the field at the start differ
export function LoginForm({
  title,
  text,
  submitLabel,
  initialEmail = "",
  icon,
}: {
  title: string;
  text: string;
  submitLabel: string;
  initialEmail?: string;
  // Above the title, while the form is shown; «Проверьте почту» has an icon of its own
  icon?: React.ReactNode;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);
  // The address the link was sent to; while it is set, «Проверьте почту» takes the place of the form
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        const result = await requestLoginLink(formData);
        if (result.ok) {
          setError(null);
          setEmail(result.email);
          setSentTo(result.email);
        } else {
          setError(result.error);
        }
      } catch {
        setError(failureMessage("отправить ссылку"));
      }
    });
  }

  if (sentTo) {
    return (
      <EmptyState
        icon={<MailCheckIcon />}
        title="Проверьте почту"
        text={`Отправили ссылку для входа на ${sentTo}. Ссылка работает 15 минут.`}
        action={
          // The form comes back with the same address: a typo is fixed without typing it all again
          <Button variant="secondary" onClick={() => setSentTo(null)}>
            Ввести другую почту
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid gap-6 rounded-28 bg-card p-6 shadow-card sm:rounded-32 sm:p-8">
      <div className="grid gap-3">
        {icon && (
          <div className="flex size-14 items-center justify-center rounded-full bg-muted [&_svg]:size-6">{icon}</div>
        )}
        <h1 className="font-display text-heading font-semibold sm:text-heading-lg">{title}</h1>
        <p className="text-lead text-copy">{text}</p>
      </div>
      {/* noValidate: the hint of the browser would replace the error text of the app */}
      <form onSubmit={handleSubmit} noValidate className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="login-email">Почта</Label>
          <Input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "login-email-error" : undefined}
          />
          {error && (
            <p id="login-email-error" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <Button type="submit" size="lg" disabled={isPending}>
          {isPending && <Loader2Icon className="animate-spin" />}
          {submitLabel}
        </Button>
      </form>
    </div>
  );
}
