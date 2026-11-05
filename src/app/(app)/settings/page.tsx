import { EmailSettings } from "@/components/email-settings";
import { Highlight } from "@/components/highlight";
import { PasswordSettings } from "@/components/password-settings";
import { hasPassword } from "@/lib/password";
import { requireUser } from "@/lib/session";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const user = await requireUser();
  const { email } = await searchParams;
  const withPassword = await hasPassword(user.id);

  return (
    <div className="grid gap-6">
      <h1 className="font-display text-title font-semibold sm:text-title-lg">
        <Highlight className="rounded-12 px-2.5 sm:rounded-16 sm:px-3.5">Настройки</Highlight>
      </h1>
      {email === "changed" && (
        <p role="status" className="rounded-14 bg-card px-4 py-3 text-15 text-copy">
          Почта изменена
        </p>
      )}
      <EmailSettings email={user.email} withPassword={withPassword} />
      <PasswordSettings withPassword={withPassword} />
    </div>
  );
}
