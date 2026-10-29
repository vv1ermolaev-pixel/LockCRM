import { noContactFrequency } from "@/lib/contact-frequency";

export type ContactFormFields = {
  name: string;
  about?: string;
  howWeMet?: string;
  phone?: string;
  email?: string;
  contactFrequency?: string;
  groupIds?: number[];
  newGroups?: string[];
};

// FormData exactly as the contact form sends it: every text field, empty when left blank,
// and one repeated field per checked group and per typed new group
export function contactForm({ groupIds = [], newGroups = [], ...fields }: ContactFormFields) {
  const formData = new FormData();
  formData.set("name", fields.name);
  formData.set("about", fields.about ?? "");
  formData.set("howWeMet", fields.howWeMet ?? "");
  formData.set("phone", fields.phone ?? "");
  formData.set("email", fields.email ?? "");
  formData.set("contactFrequency", fields.contactFrequency ?? noContactFrequency);
  for (const id of groupIds) formData.append("groupIds", String(id));
  for (const name of newGroups) formData.append("newGroups", name);
  return formData;
}
