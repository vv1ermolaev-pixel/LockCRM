import type { Metadata } from "next";
import { Manrope, Unbounded } from "next/font/google";
import Link from "next/link";

import { Logo } from "@/components/logo";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

// Same fonts as the landing: Manrope for text, Unbounded for headings
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
});

const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: "Tribe — мои контакты",
  description: "Личная CRM: люди, которых я знаю, и о чём мы договорились",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${manrope.variable} ${unbounded.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="mx-auto flex h-17 w-full max-w-3xl items-center justify-center px-4 sm:h-22">
          <Link
            href="/"
            aria-label="Tribe — все контакты"
            className="rounded-12 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            <Logo />
          </Link>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-12 sm:pb-16">{children}</main>
        <Toaster theme="light" position="bottom-right" closeButton />
      </body>
    </html>
  );
}
