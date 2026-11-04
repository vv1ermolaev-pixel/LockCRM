import type { Metadata } from "next";
import { Manrope, Unbounded } from "next/font/google";

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
        {/* The header and the page frame live in the layouts of the app pages and of the login pages */}
        {children}
        <Toaster theme="light" position="bottom-right" closeButton />
      </body>
    </html>
  );
}
