import { z } from "zod";

import { isExistingDate, moscowToday, noBirthDatePart } from "@/lib/birthdays";
import { contactFrequencies, noContactFrequency } from "@/lib/contact-frequency";
import { normalizeText } from "@/lib/search";

// Zod probes `new Function` to speed up parsing. The browser blocks it by our CSP (no 'unsafe-eval') and reports
// a CSP error in the console on every page. Without the probe parsing is the same, only a bit slower
z.config({ jitless: true });

// Empty optional fields are stored as NULL
const optionalText = (max: number, tooLongMessage: string) =>
  z
    .string()
    .trim()
    .max(max, tooLongMessage)
    .transform((value) => (value === "" ? null : value));

export const LOGIN_EMAIL_ERROR = "Проверьте адрес почты";

// The email a person logs in with: spaces trimmed, lowercase. The one rule for the login form, for a request that
// skips the form, and for OWNER_EMAIL, so "Anna@Example.com" and "anna@example.com" are one user
export const loginEmailSchema = z
  .string({ error: LOGIN_EMAIL_ERROR })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: LOGIN_EMAIL_ERROR }).max(254, LOGIN_EMAIL_ERROR));

// A new password. No trim: spaces are a part of it. Only the length is required, any characters go
export const passwordSchema = z
  .string({ error: "Пароль должен быть не короче 8 символов" })
  .min(8, "Пароль должен быть не короче 8 символов")
  .max(128, "Пароль должен быть не длиннее 128 символов");

export const groupNameSchema = z.string().trim().min(1, "Укажите название").max(40, "Слишком длинно — до 40 символов");

// Two names with the same key are the same group: case and "ё" do not count, as in the unique index on groups
export function groupNameKey(name: string) {
  return normalizeText(name.trim());
}

// The three parts of "Дата рождения" as the form sends them: day and month from their lists ("none" for «—»),
// the year as typed. One field for errors: the message goes under the whole "Дата рождения".
// The first failed rule wins, in the order of design.md. The result is ready for the columns of contacts
const birthDateSchema = z.object({ day: z.string(), month: z.string(), year: z.string() }).transform((value, ctx) => {
  const fail = (message: string) => {
    ctx.addIssue({ code: "custom", message });
    return z.NEVER;
  };
  const isEmpty = (part: string) => part === "" || part === noBirthDatePart;
  const year = value.year.trim();

  if (isEmpty(value.day) && isEmpty(value.month) && year === "") {
    return { birthDay: null, birthMonth: null, birthYear: null };
  }
  // Anything not from the lists (a request that skips the form) is the same as an empty part
  const day = /^([1-9]|[12]\d|3[01])$/.test(value.day) ? Number(value.day) : null;
  const month = /^([1-9]|1[0-2])$/.test(value.month) ? Number(value.month) : null;
  if (day === null || month === null) return fail("Укажите день и месяц");

  const today = moscowToday();
  if (year !== "" && (!/^\d{4}$/.test(year) || Number(year) < 1900 || Number(year) > today.year)) {
    return fail(`Год — от 1900 до ${today.year}`);
  }
  const birthYear = year === "" ? null : Number(year);
  if (!isExistingDate(day, month, birthYear)) return fail("Такой даты нет");
  if (birthYear !== null && Date.UTC(birthYear, month - 1, day) > Date.UTC(today.year, today.month - 1, today.day)) {
    return fail("Дата рождения не может быть в будущем");
  }
  return { birthDay: day, birthMonth: month, birthYear };
});

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
  birthDate: birthDateSchema,
  contactFrequency: z
    .string()
    .transform((value) => (value === noContactFrequency || value === "" ? null : value))
    .pipe(z.enum(contactFrequencies, { error: "Выберите частоту из списка" }).nullable()),
  // Checked groups, and names typed in "Новая группа" that are created on save
  groupIds: z.array(z.coerce.number().int().positive()),
  newGroups: z.array(groupNameSchema),
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
    birthDate: {
      day: formData.get("birthDay") ?? "",
      month: formData.get("birthMonth") ?? "",
      year: formData.get("birthYear") ?? "",
    },
    contactFrequency: formData.get("contactFrequency") ?? "",
    groupIds: formData.getAll("groupIds"),
    newGroups: formData.getAll("newGroups"),
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
