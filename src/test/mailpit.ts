// Reads the emails the app sent from Mailpit, the mail catcher that runs in Docker (see compose.yaml)

const baseUrl = () => process.env.MAILPIT_URL || "http://127.0.0.1:8025";

export type Email = {
  from: { name: string; address: string };
  subject: string;
  html: string;
  text: string;
};

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl()}${path}`, init);
  if (!response.ok) throw new Error(`Mailpit ${init?.method ?? "GET"} ${path}: ${response.status}`);
  return response;
}

export async function clearMailbox() {
  await request("/api/v1/messages", { method: "DELETE" });
}

// Emails sent to the address, the newest first
export async function emailsTo(address: string): Promise<Email[]> {
  const found = (await (await request(`/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`)).json()) as {
    messages: { ID: string }[];
  };
  return Promise.all(
    found.messages.map(async ({ ID }) => {
      const message = (await (await request(`/api/v1/message/${ID}`)).json()) as {
        From: { Name: string; Address: string };
        Subject: string;
        HTML: string;
        Text: string;
      };
      return {
        from: { name: message.From.Name, address: message.From.Address },
        subject: message.Subject,
        html: message.HTML,
        text: message.Text,
      };
    }),
  );
}

export async function lastEmailTo(address: string) {
  return (await emailsTo(address))[0];
}

// For emails that go in the background: the answer of the action does not mean the email is there yet.
// `count` waits for that many emails with the subject. Gives the newest one
export async function waitForEmailTo(
  address: string,
  { subject, count = 1 }: { subject?: string; count?: number } = {},
) {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const found = (await emailsTo(address)).filter((email) => !subject || email.subject === subject);
    if (found.length >= count) return found[0];
    if (Date.now() > deadline) throw new Error(`No email «${subject ?? "any"}» to ${address}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

// Enough for an email in the background to arrive, for the tests that check it did not
export function waitForBackgroundEmails() {
  return new Promise((resolve) => setTimeout(resolve, 300));
}

// The login link in the plain text version of the email
export function loginLinkIn(email: Email) {
  const link = email.text.match(/https?:\/\/\S+/)?.[0];
  if (!link) throw new Error(`No link in the email: ${email.text}`);
  return link;
}
