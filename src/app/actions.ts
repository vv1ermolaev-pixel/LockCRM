"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { contacts, notes } from "@/db/schema";
import {
  noteSchema,
  readContactForm,
  toFieldErrors,
  type ContactFieldErrors,
} from "@/lib/validation";

export type ContactActionResult =
  | { ok: true; id: number; name: string }
  | { ok: false; errors: ContactFieldErrors };

export type NoteActionResult = { ok: true } | { ok: false; error: string };

function assertValidId(id: number) {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`Invalid contact id: ${id}`);
  }
}

export async function createContact(formData: FormData): Promise<ContactActionResult> {
  const parsed = readContactForm(formData);
  if (!parsed.success) {
    return { ok: false, errors: toFieldErrors(parsed.error) };
  }

  const [created] = await db
    .insert(contacts)
    .values(parsed.data)
    .returning({ id: contacts.id, name: contacts.name });

  revalidatePath("/", "layout");
  return { ok: true, id: created.id, name: created.name };
}

export async function updateContact(id: number, formData: FormData): Promise<ContactActionResult> {
  assertValidId(id);
  const parsed = readContactForm(formData);
  if (!parsed.success) {
    return { ok: false, errors: toFieldErrors(parsed.error) };
  }

  const [updated] = await db
    .update(contacts)
    .set(parsed.data)
    .where(eq(contacts.id, id))
    .returning({ id: contacts.id, name: contacts.name });
  if (!updated) {
    throw new Error(`Contact ${id} not found`);
  }

  revalidatePath("/", "layout");
  return { ok: true, id: updated.id, name: updated.name };
}

export async function deleteContact(id: number): Promise<{ ok: true }> {
  assertValidId(id);
  // Notes go with the contact (on delete cascade). A contact that is already gone is not an error:
  // it may have been deleted in another browser, and the result is the same
  await db.delete(contacts).where(eq(contacts.id, id));

  // No revalidatePath on purpose: it re-renders the current page, which is the card of the contact
  // that no longer exists, so "not found" would flash before the client goes to the list.
  // The list reads the database on every visit, so it is fresh after that navigation anyway.
  return { ok: true };
}

export async function addNote(contactId: number, formData: FormData): Promise<NoteActionResult> {
  assertValidId(contactId);
  const parsed = noteSchema.safeParse({ body: formData.get("body") ?? "" });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  await db.transaction(async (tx) => {
    await tx.insert(notes).values({ contactId, body: parsed.data.body });
    // Touch the contact so "updated_at" reflects the latest interaction
    await tx.update(contacts).set({ updatedAt: new Date() }).where(eq(contacts.id, contactId));
  });

  revalidatePath(`/contacts/${contactId}`);
  return { ok: true };
}
