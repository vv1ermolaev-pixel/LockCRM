// Shared by the database schema, the contact form and the server, so it must not import "server-only"

export const contactFrequencies = ["week", "month", "quarter", "year"] as const;

export type ContactFrequency = (typeof contactFrequencies)[number];

// What the form sends for "Не задано": Radix Select does not allow an empty item value
export const noContactFrequency = "none";

export const contactFrequencyLabels: Record<ContactFrequency, string> = {
  week: "Раз в неделю",
  month: "Раз в месяц",
  quarter: "Раз в квартал",
  year: "Раз в год",
};
