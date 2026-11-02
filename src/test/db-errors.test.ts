import { inspect } from "node:util";

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { addNote, createContact, deleteContact } from "@/app/actions";
import { db } from "@/db";

import { contactForm } from "./forms";
import { addContact } from "./scenario";

// Next.js writes an uncaught error to the server log the way util.inspect prints it: message, cause and fields
async function loggedError(action: Promise<unknown>) {
  const error = await action.then(
    () => {
      throw new Error("Expected the action to fail");
    },
    (reason: unknown) => reason,
  );
  return inspect(error, { depth: null });
}

describe("Errors of failed queries", () => {
  it("keep the contact's data out of the log when saving fails", async () => {
    // Every new contact is rejected: Postgres then puts the whole row into the error detail
    await db.execute(sql`alter table contacts add constraint reject_every_contact check (false)`);
    const fields = {
      name: "Маша Ковалёва",
      about: "Дизайнер из соседнего офиса",
      howWeMet: "На курсах керамики",
      phone: "+7 999 123-45-67",
      email: "masha@example.com",
    };

    const logged = await loggedError(createContact(contactForm(fields)));

    for (const value of Object.values(fields)) {
      expect(logged).not.toContain(value);
    }
    // Still enough to tell what went wrong
    expect(logged).toContain("23514");
    expect(logged).toContain("reject_every_contact");
  });

  it("keep the note text out of the log when the contact was deleted meanwhile", async () => {
    const id = await addContact("Маша");
    await deleteContact(id);
    const form = new FormData();
    form.set("body", "Обещала вернуть книгу до пятницы");

    const logged = await loggedError(addNote(id, form));

    expect(logged).not.toContain("Обещала вернуть книгу до пятницы");
    expect(logged).toContain("23503");
  });
});
