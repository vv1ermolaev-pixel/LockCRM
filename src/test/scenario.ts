// Steps that set up a scenario the way the user would: through the same actions the screens call

import { createContact, createGroup } from "@/app/actions";
import { listGroups } from "@/lib/groups";

import { contactForm, type ContactFormFields } from "./forms";

export async function addContact(name: string, fields: Omit<ContactFormFields, "name"> = {}) {
  const result = await createContact(contactForm({ name, ...fields }));
  if (!result.ok) throw new Error(`Contact not created: ${JSON.stringify(result.errors)}`);
  return result.id;
}

// A group made in the "Группы" window
export async function addGroup(name: string) {
  const formData = new FormData();
  formData.set("name", name);
  const result = await createGroup(formData);
  if (!result.ok) throw new Error(`Group not created: ${result.error}`);
  return result.id;
}

export async function groupId(name: string) {
  const group = (await listGroups()).find((item) => item.name === name);
  if (!group) throw new Error(`No group «${name}»`);
  return group.id;
}
