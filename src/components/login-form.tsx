"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, MailCheckIcon } from "lucide-react";

import { requestLoginLink, requestPasswordResetLink } from "@/app/login/actions";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { failureMessage } from "@/lib/action-messages";

// What the emailed link is for: to log in, or to set a new password
export type LinkPurpose = "login" | "password";

const purposes = {
  login: {
    request: requestLoginLink,
    sentText: (email: string) => `Отправили ссылку для входа на ${email}. Ссылка работает 15 минут.`,
  },
  password: {
    request: requestPasswordResetLink,
    // The same for an address with an account and without: nothing here tells which one it is
    sentText: (email: string) =>
      `Если для ${email} есть аккаунт, мы отправили на неё ссылку для смены пароля. Ссылка работает 15 минут.`,
  },
};

export function LoginCard({
  title,
  text,
  icon,
  children,
}: {
  title: string;
  text?: string;
  // Above the title; «Проверьте почту» has an icon of its own
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-6 rounded-28 bg-card p-6 shadow-card sm:rounded-32 sm:p-8">
      <div className="grid gap-3">
        {icon && (
          <div className="flex size-14 items-center justify-center rounded-full bg-muted [&_svg]:size-6">{icon}</div>
        )}
        <h1 className="font-display text-heading font-semibold sm:text-heading-lg">{title}</h1>
        {text && <p className="text-lead text-copy">{text}</p>}
      </div>
      {children}
    </div>
  );
}

// Takes the place of the form after sending. The form comes back with the same address:
// a typo is fixed without typing it all again
export function EmailSentNotice({
  purpose,
  email,
  onBack,
}: {
  purpose: LinkPurpose;
  email: string;
  onBack: () => void;
}) {
  return (
    <EmptyState
      icon={<MailCheckIcon />}
      title="Проверьте почту"
      text={purposes[purpose].sentText(email)}
      action={
        <Button variant="secondary" onClick={onBack}>
          Ввести другую почту
        </Button>
      }
    />
  );
}

// The field and the button that ask for an emailed link: for «Вход по ссылке», «Забыли пароль?» and «Ссылка устарела»
export function EmailRequestForm({
  purpose,
  submitLabel,
  email,
  onEmailChange,
  onSent,
}: {
  purpose: LinkPurpose;
  submitLabel: string;
  email: string;
  onEmailChange: (email: string) => void;
  onSent: (email: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        const result = await purposes[purpose].request(formData);
        if (result.ok) {
          setError(null);
          onSent(result.email);
        } else {
          setError(result.error);
        }
      } catch {
        setError(failureMessage("отправить ссылку"));
      }
    });
  }

  return (
    // noValidate: the hint of the browser would replace the error text of the app
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
          onChange={(event) => onEmailChange(event.target.value)}
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
  );
}

// A card of its own with the form, for the pages of an old link
export function LoginForm({
  purpose = "login",
  title,
  text,
  submitLabel,
  initialEmail = "",
  icon,
}: {
  purpose?: LinkPurpose;
  title: string;
  text: string;
  submitLabel: string;
  initialEmail?: string;
  icon?: React.ReactNode;
}) {
  const [email, setEmail] = useState(initialEmail);
  // The address the link was sent to; while it is set, «Проверьте почту» takes the place of the form
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (sentTo) {
    return <EmailSentNotice purpose={purpose} email={sentTo} onBack={() => setSentTo(null)} />;
  }

  return (
    <LoginCard title={title} text={text} icon={icon}>
      <EmailRequestForm
        purpose={purpose}
        submitLabel={submitLabel}
        email={email}
        onEmailChange={setEmail}
        onSent={(address) => {
          setEmail(address);
          setSentTo(address);
        }}
      />
    </LoginCard>
  );
}
