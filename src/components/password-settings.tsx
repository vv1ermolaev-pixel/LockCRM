"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2Icon } from "lucide-react";

import { changePassword, sendPasswordResetToMe, setFirstPassword } from "@/app/(app)/settings/actions";
import { PasswordInput } from "@/components/password-input";
import { SettingsCard, SettingsMessage } from "@/components/settings-card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { failureMessage } from "@/lib/action-messages";

type FieldErrors = { currentPassword?: string; newPassword?: string };

function PasswordField({
  id,
  name,
  label,
  autoComplete,
  error,
}: {
  id: string;
  name: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  error?: string;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <PasswordInput
        id={id}
        name={name}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

// The block shows the first password or the change of it, whichever fits. The message stays above the form
// when the first turns into the second after saving
export function PasswordSettings({ withPassword }: { withPassword: boolean }) {
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [resetError, setResetError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isSendingLink, startSendingLink] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function succeed(text: string) {
    setErrors({});
    setMessage(text);
    formRef.current?.reset();
  }

  function handleFirstPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await setFirstPassword(formData);
        if (result.ok) succeed("Пароль сохранён");
        else setErrors({ newPassword: result.error });
      } catch {
        setErrors({ newPassword: failureMessage("сохранить пароль") });
      }
    });
  }

  function handleChange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await changePassword(formData);
        if (result.ok) succeed("Пароль изменён");
        else setErrors({ [result.field]: result.error });
      } catch {
        setErrors({ newPassword: failureMessage("сменить пароль") });
      }
    });
  }

  function handleForgot() {
    setMessage(null);
    setResetError(null);
    startSendingLink(async () => {
      try {
        const result = await sendPasswordResetToMe();
        if (result.ok) {
          setMessage(`Отправили ссылку для смены пароля на ${result.email}. Ссылка работает 15 минут.`);
        } else {
          setResetError(result.error);
        }
      } catch {
        setResetError(failureMessage("отправить ссылку"));
      }
    });
  }

  if (!withPassword) {
    return (
      <SettingsCard title="Задать пароль">
        <p className="text-15 text-copy">С паролем можно входить без письма.</p>
        {message && <SettingsMessage>{message}</SettingsMessage>}
        <form ref={formRef} onSubmit={handleFirstPassword} noValidate className="grid gap-4">
          <PasswordField
            id="first-password"
            name="password"
            label="Новый пароль"
            autoComplete="new-password"
            error={errors.newPassword}
          />
          <Button type="submit" disabled={isPending} className="justify-self-start">
            {isPending && <Loader2Icon className="animate-spin" />}
            Сохранить пароль
          </Button>
        </form>
      </SettingsCard>
    );
  }

  return (
    <SettingsCard title="Сменить пароль">
      {message && <SettingsMessage>{message}</SettingsMessage>}
      <form ref={formRef} onSubmit={handleChange} noValidate className="grid gap-4">
        <PasswordField
          id="change-current-password"
          name="currentPassword"
          label="Текущий пароль"
          autoComplete="current-password"
          error={errors.currentPassword}
        />
        <PasswordField
          id="change-new-password"
          name="newPassword"
          label="Новый пароль"
          autoComplete="new-password"
          error={errors.newPassword}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2Icon className="animate-spin" />}
            Сменить пароль
          </Button>
          <Button type="button" variant="ghost" onClick={handleForgot} disabled={isSendingLink}>
            {isSendingLink && <Loader2Icon className="animate-spin" />}
            Забыли текущий пароль?
          </Button>
        </div>
        {resetError && <p className="text-sm text-destructive">{resetError}</p>}
      </form>
    </SettingsCard>
  );
}
