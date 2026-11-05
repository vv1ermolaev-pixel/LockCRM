"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2Icon } from "lucide-react";

import { requestEmailChange } from "@/app/(app)/settings/actions";
import { PasswordInput } from "@/components/password-input";
import { SettingsCard, SettingsMessage } from "@/components/settings-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { failureMessage } from "@/lib/action-messages";

type FieldErrors = { newEmail?: string; currentPassword?: string };

export function EmailSettings({ email, withPassword }: { email: string; withPassword: boolean }) {
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await requestEmailChange(formData);
        if (result.ok) {
          setErrors({});
          setMessage(
            `Отправили ссылку на ${result.email}. Почта сменится, когда вы её откроете. Ссылка работает 15 минут.`,
          );
          formRef.current?.reset();
        } else {
          setErrors({ [result.field]: result.error });
        }
      } catch {
        setErrors({ currentPassword: failureMessage("сменить почту") });
      }
    });
  }

  return (
    <SettingsCard title="Почта">
      <p className="text-15 break-words text-copy">{email}</p>
      {message && <SettingsMessage>{message}</SettingsMessage>}
      {withPassword ? (
        <form ref={formRef} aria-label="Смена почты" onSubmit={handleSubmit} noValidate className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="new-email">Новая почта</Label>
            <Input
              id="new-email"
              name="newEmail"
              type="email"
              autoComplete="email"
              inputMode="email"
              aria-invalid={errors.newEmail ? true : undefined}
              aria-describedby={errors.newEmail ? "new-email-error" : undefined}
            />
            {errors.newEmail && (
              <p id="new-email-error" className="text-sm text-destructive">
                {errors.newEmail}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email-current-password">Текущий пароль</Label>
            <PasswordInput
              id="email-current-password"
              name="currentPassword"
              autoComplete="current-password"
              aria-invalid={errors.currentPassword ? true : undefined}
              aria-describedby={errors.currentPassword ? "email-current-password-error" : undefined}
            />
            {errors.currentPassword && (
              <p id="email-current-password-error" className="text-sm text-destructive">
                {errors.currentPassword}
              </p>
            )}
          </div>
          <Button type="submit" disabled={isPending} className="justify-self-start">
            {isPending && <Loader2Icon className="animate-spin" />}
            Сменить почту
          </Button>
        </form>
      ) : (
        <p className="text-15 text-copy">Чтобы сменить почту, сначала задайте пароль</p>
      )}
    </SettingsCard>
  );
}
