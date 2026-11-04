import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { requestLoginLink } from "@/app/login/actions";
import { db } from "@/db";
import { verifications } from "@/db/schema";
import { auth } from "@/lib/auth";

import { lastEmailTo, loginLinkIn } from "./mailpit";
import { openLoginLink } from "./sign-in";
import { headers } from "./stubs/next-headers";

// Personal data must not reach the server log: the address of a person and the link that logs them in
const EMAIL = "anna.private@example.com";

const methods = ["log", "info", "warn", "error", "debug"] as const;

function captureConsole() {
  const lines: string[] = [];
  for (const method of methods) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      lines.push(args.map((arg) => (arg instanceof Error ? `${arg.message}\n${arg.stack}` : String(arg))).join(" "));
    });
  }
  return lines;
}

function emailForm(email: string) {
  const formData = new FormData();
  formData.set("email", email);
  return formData;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("The server log during login", () => {
  it("holds no address and no link when the address is wrong", async () => {
    const log = captureConsole();

    await requestLoginLink(emailForm("anna.private@"));
    await expect(
      auth.api.signInMagicLink({ body: { email: "anna.private@" }, headers: await headers() }),
    ).rejects.toThrow();

    expect(log.join("\n")).not.toContain("anna.private");
  });

  it("holds no address and no link when the limit is hit", async () => {
    for (let i = 0; i < 3; i++) await requestLoginLink(emailForm(EMAIL));
    const link = loginLinkIn((await lastEmailTo(EMAIL))!);
    const log = captureConsole();

    await requestLoginLink(emailForm(EMAIL));

    expect(log.join("\n")).not.toContain("anna.private");
    expect(log.join("\n")).not.toContain(new URL(link).searchParams.get("token"));
  });

  it("holds no address and no link when the mail service does not accept the email", async () => {
    const smtpUrl = process.env.SMTP_URL;
    process.env.SMTP_URL = "smtp://127.0.0.1:1";
    const log = captureConsole();

    try {
      await requestLoginLink(emailForm(EMAIL));
    } finally {
      process.env.SMTP_URL = smtpUrl;
    }

    expect(log.length).toBeGreaterThan(0);
    expect(log.join("\n")).not.toContain("anna.private");
    expect(log.join("\n")).not.toMatch(/magic-link|token=/);
  });

  it("holds no address and no link when an expired link is opened", async () => {
    await requestLoginLink(emailForm(EMAIL));
    const link = loginLinkIn((await lastEmailTo(EMAIL))!);
    await db.update(verifications).set({ expiresAt: sql`now() - interval '1 minute'` });
    const log = captureConsole();

    await openLoginLink(link);

    expect(log.join("\n")).not.toContain("anna.private");
    expect(log.join("\n")).not.toContain(new URL(link).searchParams.get("token"));
  });
});
