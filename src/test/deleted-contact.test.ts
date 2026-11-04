import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { addNote, deleteContact, markContacted, updateContact } from "@/app/actions";
import { db } from "@/db";
import { notes } from "@/db/schema";

import { signInTestUser } from "./as-user";
import { contactForm } from "./forms";
import { addContact } from "./scenario";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const contactDeleted = { ok: false, contactDeleted: true };

// The contact is open in two tabs and gets deleted in the second one
async function deletedContactId() {
  const id = await addContact("Анна Смирнова");
  await deleteContact(id);
  vi.mocked(revalidatePath).mockClear();
  return id;
}

describe("Actions on a contact that was deleted meanwhile", () => {
  beforeEach(async () => {
    await signInTestUser();
    vi.mocked(revalidatePath).mockClear();
  });

  it("answers «contact deleted» to a note, and saves nothing", async () => {
    const id = await deletedContactId();
    const form = new FormData();
    form.set("body", "Обещала вернуть книгу");

    await expect(addNote(id, form)).resolves.toEqual(contactDeleted);

    expect(await db.select().from(notes).where(eq(notes.contactId, id))).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("answers «contact deleted» to a change of the contact", async () => {
    const id = await deletedContactId();

    await expect(updateContact(id, contactForm({ name: "Анна Смирнова", phone: "+7 900 111-22-33" }))).resolves.toEqual(
      contactDeleted,
    );

    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("answers «contact deleted» to «Связались»", async () => {
    const id = await deletedContactId();

    await expect(markContacted(id)).resolves.toEqual(contactDeleted);

    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
