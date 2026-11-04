import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { getCurrentUser } from "@/lib/session";

export default async function LoginPage() {
  // Somebody who is inside already has nothing to do here
  if (await getCurrentUser()) redirect("/");

  return (
    <LoginForm
      title="Вход в приложение"
      text="Введите почту — пришлём ссылку для входа. Пароль не нужен."
      submitLabel="Получить ссылку для входа"
    />
  );
}
