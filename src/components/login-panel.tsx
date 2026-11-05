"use client";

import { useState, useTransition } from "react";
import { Loader2Icon } from "lucide-react";

import { signInWithPassword } from "@/app/login/actions";
import { EmailRequestForm, EmailSentNotice, LoginCard, type LinkPurpose } from "@/components/login-form";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { failureMessage } from "@/lib/action-messages";
import type { LoginMethod } from "@/lib/login-method";
import { LOGIN_EMAIL_ERROR } from "@/lib/validation";

const YEAR_SECONDS = 365 * 24 * 60 * 60;

// Read on the server (src/lib/login-method.ts), so the right tab is in the first HTML and does not flicker.
// Set here, in the browser, because only the browser knows the tab was switched. No personal data in it
function rememberLoginMethod(method: LoginMethod) {
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `login_method=${method}; path=/login; max-age=${YEAR_SECONDS}; samesite=lax${secure}`;
}

function PasswordLoginForm({
  email,
  onEmailChange,
  onForgot,
  onUseLink,
}: {
  email: string;
  onEmailChange: (email: string) => void;
  onForgot: () => void;
  onUseLink: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        const result = await signInWithPassword(formData);
        if (result.ok) {
          // A full page load, as after «Выйти»: nothing of the login page stays in the router cache
          window.location.replace("/");
          return;
        }
        setError(result.error);
        // A typo in the address says nothing about the password: it stays
        if (result.error !== LOGIN_EMAIL_ERROR) setPassword("");
      } catch {
        setError(failureMessage("войти"));
      }
    });
  }

  return (
    <div className="grid gap-4">
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
            onChange={(event) => onEmailChange(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="login-password">Пароль</Label>
          <PasswordInput
            id="login-password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" size="lg" disabled={isPending}>
          {isPending && <Loader2Icon className="animate-spin" />}
          Войти
        </Button>
      </form>
      <Button variant="ghost" onClick={onForgot}>
        Забыли пароль?
      </Button>
      <p className="flex flex-wrap items-center justify-center gap-x-1 text-15 text-copy">
        Ещё не зарегистрированы?
        <Button variant="link" className="h-11 px-1" onClick={onUseLink}>
          Войти по ссылке
        </Button>
      </p>
    </div>
  );
}

export function LoginPanel({ initialMethod, notice }: { initialMethod: LoginMethod; notice?: string }) {
  const [method, setMethod] = useState(initialMethod);
  // One address for both tabs and «Забыли пароль?». It stays here, out of the address of the page
  const [email, setEmail] = useState("");
  const [forgot, setForgot] = useState(false);
  const [sent, setSent] = useState<{ purpose: LinkPurpose; email: string } | null>(null);

  function chooseMethod(value: LoginMethod) {
    setMethod(value);
    rememberLoginMethod(value);
  }

  function showSent(purpose: LinkPurpose, address: string) {
    setEmail(address);
    setSent({ purpose, email: address });
  }

  if (sent) {
    return <EmailSentNotice purpose={sent.purpose} email={sent.email} onBack={() => setSent(null)} />;
  }

  if (forgot) {
    return (
      <LoginCard title="Забыли пароль?" text="Пришлём на почту ссылку, чтобы задать новый пароль.">
        <div className="grid gap-4">
          <EmailRequestForm
            purpose="password"
            submitLabel="Получить ссылку для смены пароля"
            email={email}
            onEmailChange={setEmail}
            onSent={(address) => showSent("password", address)}
          />
          <Button variant="ghost" onClick={() => setForgot(false)}>
            Вернуться ко входу
          </Button>
        </div>
      </LoginCard>
    );
  }

  return (
    <LoginCard title="Вход в приложение">
      {notice && (
        <p role="status" className="rounded-14 bg-muted px-4 py-3 text-15 text-copy">
          {notice}
        </p>
      )}
      <Tabs value={method} onValueChange={(value) => chooseMethod(value as LoginMethod)}>
        <TabsList aria-label="Способ входа">
          <TabsTrigger value="link">Вход по ссылке</TabsTrigger>
          <TabsTrigger value="password">Почта и пароль</TabsTrigger>
        </TabsList>
        <TabsContent value="link" className="grid gap-4">
          <p className="text-lead text-copy">Введите почту — пришлём ссылку для входа. Пароль не нужен.</p>
          <EmailRequestForm
            purpose="login"
            submitLabel="Получить ссылку для входа"
            email={email}
            onEmailChange={setEmail}
            onSent={(address) => showSent("login", address)}
          />
        </TabsContent>
        <TabsContent value="password">
          <PasswordLoginForm
            email={email}
            onEmailChange={setEmail}
            onForgot={() => setForgot(true)}
            onUseLink={() => chooseMethod("link")}
          />
        </TabsContent>
      </Tabs>
    </LoginCard>
  );
}
