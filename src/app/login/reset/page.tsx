import { ResetPasswordForm } from "@/components/reset-password-form";
import { readLastLoginEmail } from "@/lib/last-login-email";

// Where the link from the email leads. No redirect for somebody who is inside: the link may be opened in a browser
// with an old login, and a new password is needed exactly when that login is in doubt
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  return <ResetPasswordForm token={error ? undefined : token} lastEmail={await readLastLoginEmail()} />;
}
