import { redirect } from "next/navigation";

import { LoginPanel } from "@/components/login-panel";
import { readLoginMethod } from "@/lib/login-method";
import { getCurrentUser } from "@/lib/session";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ password?: string; email?: string }>;
}) {
  // Somebody who is inside already has nothing to do here
  if (await getCurrentUser()) redirect("/");

  const { password, email } = await searchParams;

  if (password === "changed") {
    return <LoginPanel initialMethod="password" notice="Пароль изменён. Войдите с новым паролем." />;
  }

  return (
    <LoginPanel
      initialMethod={await readLoginMethod()}
      notice={email === "changed" ? "Почта изменена. Войдите с новой почтой." : undefined}
    />
  );
}
