import "server-only";

import nodemailer from "nodemailer";

// How long the link works, in minutes. The text of the email and the link itself both use it
export const LOGIN_LINK_MINUTES = 15;

const SENDER_NAME = "Личная CRM";
const SUBJECT = "Вход в Личную CRM";
const GREETING = `Чтобы войти в Личную CRM, перейдите по ссылке. Ссылка работает ${LOGIN_LINK_MINUTES} минут.`;
const IGNORE_NOTE = "Если вы не запрашивали вход — просто проигнорируйте письмо.";

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);
}

// Mail programs do not understand CSS variables or Tailwind classes, so the styles are written inline with
// the values of the design tokens (src/app/tokens.css): the one place where colors are not taken from the tokens.
// Ink #0e1a0e, pistachio #cfeab9, copy-muted #4a5c45
function loginEmailHtml(url: string) {
  const link = escapeHtml(url);
  return `<!doctype html>
<html lang="ru">
  <body style="margin:0;padding:24px 16px;background:#ffffff;font-family:Manrope,Arial,sans-serif;color:#0e1a0e;">
    <p style="margin:0 0 24px;font-size:17px;line-height:1.5;">${GREETING}</p>
    <p style="margin:0 0 24px;">
      <a href="${link}" style="display:inline-block;padding:14px 28px;border-radius:14px;background:#cfeab9;color:#0e1a0e;font-size:17px;font-weight:700;text-decoration:none;">Войти</a>
    </p>
    <p style="margin:0;font-size:13px;line-height:1.4;color:#4a5c45;">${IGNORE_NOTE}</p>
  </body>
</html>`;
}

// The plain text version is shown by mail programs that cannot show HTML: the link stands in for the button
function loginEmailText(url: string) {
  return `${GREETING}\n\n${url}\n\n${IGNORE_NOTE}\n`;
}

// SMTP_URL decides where emails go: Mailpit on a developer's computer and in tests, Resend on the server
export async function sendLoginEmail(to: string, url: string) {
  const smtpUrl = process.env.SMTP_URL;
  const from = process.env.MAIL_FROM;
  if (!smtpUrl || !from) {
    throw new Error("SMTP_URL and MAIL_FROM are not set. Copy .env.example to .env and fill in the values.");
  }

  // A short timeout: the login request waits for the email, and a mail service that does not answer must not hang it
  const transport = nodemailer.createTransport({
    url: smtpUrl,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
  });
  try {
    await transport.sendMail({
      from: { name: SENDER_NAME, address: from },
      to,
      subject: SUBJECT,
      text: loginEmailText(url),
      html: loginEmailHtml(url),
    });
  } finally {
    transport.close();
  }
}
