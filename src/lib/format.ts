const pluralRules = new Intl.PluralRules("ru-RU");
const numberFormat = new Intl.NumberFormat("ru-RU");
const dateTimeFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

// forms: [one, few, many], e.g. ["контакт", "контакта", "контактов"]
export function pluralize(value: number, forms: [string, string, string]) {
  const rule = pluralRules.select(value);
  const word = rule === "one" ? forms[0] : rule === "few" ? forms[1] : forms[2];
  return `${numberFormat.format(value)} ${word}`;
}

export function formatNumber(value: number) {
  return numberFormat.format(value);
}

export function formatDateTime(date: Date) {
  return dateTimeFormat.format(date);
}

export function initials(name: string) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]);
  return letters.join("").toUpperCase() || "?";
}

const avatarColors = [
  "bg-sky-100 text-sky-800",
  "bg-emerald-100 text-emerald-800",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-800",
  "bg-violet-100 text-violet-800",
  "bg-teal-100 text-teal-800",
  "bg-orange-100 text-orange-800",
  "bg-indigo-100 text-indigo-800",
];

// Stable color per name, so the same person always gets the same avatar
export function avatarColor(name: string) {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return avatarColors[hash % avatarColors.length];
}
