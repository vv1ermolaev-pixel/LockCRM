import { Logo } from "@/components/logo";

// The login pages: the logo in the middle, no email and no «Выйти», nobody is inside yet
export default function LoginLayout({ children }: LayoutProps<"/login">) {
  return (
    <>
      <header className="mx-auto flex h-17 w-full max-w-3xl items-center justify-center px-4 sm:h-22">
        <Logo />
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-12 sm:pb-16">{children}</main>
    </>
  );
}
