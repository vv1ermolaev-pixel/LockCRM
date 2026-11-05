import Link from "next/link";
import { redirect } from "next/navigation";

import { Logo } from "@/components/logo";
import { SignOutButton } from "@/components/sign-out-button";
import { getCurrentUser } from "@/lib/session";

// Every page of the app: the header with the email of the person and «Выйти», and the page itself.
// Each page checks the session on its own as well (requireUserId): a layout is not rendered again when the person
// moves between pages, so it is not the place for the check that protects data
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <>
      <header className="mx-auto flex h-17 w-full max-w-3xl items-center justify-between gap-3 px-4 sm:h-22">
        <Link
          href="/"
          aria-label="Tribe — все контакты"
          className="shrink-0 rounded-12 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <Logo />
        </Link>
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          <Link
            href="/settings"
            title={user.email}
            className="flex min-h-11 min-w-0 items-center rounded-12 text-13 text-copy-muted underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:text-15"
          >
            <span className="truncate">{user.email}</span>
          </Link>
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-12 sm:pb-16">{children}</main>
    </>
  );
}
