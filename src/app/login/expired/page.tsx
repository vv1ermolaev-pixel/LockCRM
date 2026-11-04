import { redirect } from "next/navigation";
import { Link2OffIcon } from "lucide-react";

import { LoginForm } from "@/components/login-form";
import { readLastLoginEmail } from "@/lib/last-login-email";
import { getCurrentUser } from "@/lib/session";

// Where a link that does not work leads: old, used, or damaged. One page for every cause
export default async function ExpiredLinkPage() {
  if (await getCurrentUser()) redirect("/");

  return (
    <LoginForm
      icon={<Link2OffIcon aria-hidden />}
      title="Ссылка устарела"
      text="Запросите новую — она придёт на почту."
      submitLabel="Отправить ссылку повторно"
      // The address this browser asked a link for last, if it did so in the last 7 days
      initialEmail={await readLastLoginEmail()}
    />
  );
}
