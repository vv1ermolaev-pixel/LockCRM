import { z } from "zod";

import { contactFrequencies, noContactFrequency } from "@/lib/contact-frequency";

// Empty optional fields are stored as NULL
const optionalText = (max: number, tooLongMessage: string) =>
  z
    .string()
    .trim()
    .max(max, tooLongMessage)
    .transform((value) => (value === "" ? null : value));

export const contactSchema = z.object({
  name: z.string().trim().min(1, "Укажите имя").max(200, "Имя слишком длинное — до 200 символов"),
  about: optionalText(500, "Слишком длинно — до 500 символов"),
  howWeMet: optionalText(500, "Слишком длинно — до 500 символов"),
  phone: optionalText(50, "Телефон слишком длинный").refine(
    (value) => value === null || /^[+\d\s()-]+$/.test(value),
    "Только цифры, пробелы, «+», «-» и скобки",
  ),
  email: optionalText(254, "Почта слишком длинная").refine(
    (value) => value === null || z.email().safeParse(value).success,
    "Похоже, в адресе почты ошибка",
  ),
  contactFrequency: z
    .string()
    .transform((value) => (value === noContactFrequency || value === "" ? null : value))
    .pipe(z.enum(contactFrequencies, { error: "Выберите частоту из списка" }).nullable()),
});

export type ContactInput = z.infer<typeof contactSchema>;
export type ContactField = keyof ContactInput;
export type ContactFieldErrors = Partial<Record<ContactField, string>>;

export const noteSchema = z.object({
  body: z.string().trim().min(1, "Заметка пустая").max(10_000, "Заметка слишком длинная — до 10 000 символов"),
});

// The previous "Связались" mark that "Отменить" puts back: an ISO date, or null when there was none
export const previousMarkSchema = z.iso.datetime().nullable();

export function readContactForm(formData: FormData) {
  return contactSchema.safeParse({
    name: formData.get("name") ?? "",
    about: formData.get("about") ?? "",
    howWeMet: formData.get("howWeMet") ?? "",
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    contactFrequency: formData.get("contactFrequency") ?? "",
  });
}

export function toFieldErrors<T extends string>(error: z.ZodError): Partial<Record<T, string>> {
  const result: Partial<Record<T, string>> = {};
  for (const issue of error.issues) {
    const field = issue.path[0] as T;
    result[field] ??= issue.message;
  }
  return result;
}
