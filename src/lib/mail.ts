import "server-only";

import nodemailer from "nodemailer";

// How long a link works, in minutes. The text of the emails and the links themselves both use it
export const LOGIN_LINK_MINUTES = 15;

const SENDER_NAME = "Личная CRM";

type Email = {
  subject: string;
  message: string;
  button?: { label: string; url: string };
  note?: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);
}

// Mail programs do not understand CSS variables or Tailwind classes, so the styles are written inline with
// the values of the design tokens (src/app/tokens.css): the one place where colors are not taken from the tokens.
// Ink #0e1a0e, pistachio #cfeab9, copy-muted #4a5c45
function emailHtml({ message, button, note }: Email) {
  const buttonHtml = button
    ? `
    <p style="margin:0 0 24px;">
      <a href="${escapeHtml(button.url)}" style="display:inline-block;padding:14px 28px;border-radius:14px;background:#cfeab9;color:#0e1a0e;font-size:17px;font-weight:700;text-decoration:none;">${escapeHtml(button.label)}</a>
    </p>`
    : "";
  const noteHtml = note
    ? `
    <p style="margin:0;font-size:13px;line-height:1.4;color:#4a5c45;">${escapeHtml(note)}</p>`
    : "";
  return `<!doctype html>
<html lang="ru">
  <body style="margin:0;padding:24px 16px;background:#ffffff;font-family:Manrope,Arial,sans-serif;color:#0e1a0e;">
    <p style="margin:0 0 24px;font-size:17px;line-height:1.5;">${escapeHtml(message)}</p>${buttonHtml}${noteHtml}
  </body>
</html>`;
}

// The plain text version is shown by mail programs that cannot show HTML: the link stands in for the button
function emailText({ message, button, note }: Email) {
  return `${[message, button?.url, note].filter(Boolean).join("\n\n")}\n`;
}

// SMTP_URL decides where emails go: Mailpit on a developer's computer and in tests, Resend on the server
async function sendEmail(to: string, email: Email) {
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
      subject: email.subject,
      text: emailText(email),
      html: emailHtml(email),
    });
  } finally {
    transport.close();
  }
}

export function sendLoginEmail(to: string, url: string) {
  return sendEmail(to, {
    subject: "Вход в Личную CRM",
    message: `Чтобы войти в Личную CRM, перейдите по ссылке. Ссылка работает ${LOGIN_LINK_MINUTES} минут.`,
    button: { label: "Войти", url },
    note: "Если вы не запрашивали вход — просто проигнорируйте письмо.",
  });
}

export function sendPasswordResetEmail(to: string, url: string) {
  return sendEmail(to, {
    subject: "Смена пароля в Личной CRM",
    message: `Чтобы задать новый пароль, перейдите по ссылке. Ссылка работает ${LOGIN_LINK_MINUTES} минут.`,
    button: { label: "Задать пароль", url },
    note: "Если вы не запрашивали смену пароля — просто проигнорируйте письмо. Пароль останется прежним.",
  });
}

export function sendPasswordChangedEmail(to: string) {
  return sendEmail(to, {
    subject: "Пароль в Личной CRM изменён",
    message:
      "Пароль вашего аккаунта только что изменён. Если это были вы, ничего делать не нужно. " +
      "Если нет — откройте страницу входа, нажмите «Забыли пароль?» и задайте новый.",
  });
}

export function sendEmailChangeLink(to: string, url: string) {
  return sendEmail(to, {
    subject: "Смена почты в Личной CRM",
    message: `Чтобы сменить почту аккаунта на эту, перейдите по ссылке. Ссылка работает ${LOGIN_LINK_MINUTES} минут.`,
    button: { label: "Сменить почту", url },
    note: "Если вы не запрашивали смену почты — просто проигнорируйте письмо.",
  });
}

export function sendEmailChangeNotice(to: string, newEmail: string) {
  return sendEmail(to, {
    subject: "Запрошена смена почты в Личной CRM",
    message:
      `Запрошена смена почты вашего аккаунта на ${newEmail}. Если это были вы, откройте ссылку в письме ` +
      "на новой почте. Если нет — кто-то знает ваш пароль: сразу смените его.",
  });
}

// For the emails nobody waits for. Time and failures of sending must not show in the answer: they would
// tell whether the address has an account. So a failure goes to the log, and only its code:
// the message of a mail library may hold the address
export function sendInBackground(send: () => Promise<unknown>) {
  void send().catch((error: unknown) => {
    console.error("Email was not sent:", (error as { code?: string }).code ?? "unknown error");
  });
}
