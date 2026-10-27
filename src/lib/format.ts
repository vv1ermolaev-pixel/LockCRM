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

export const contactForms: [string, string, string] = ["контакт", "контакта", "контактов"];

export function formatNumber(value: number) {
  return numberFormat.format(value);
}

const dayMonthFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });

// "просрочено на 5 дней"
export function formatOverdue(days: number) {
  return `просрочено на ${pluralize(days, ["день", "дня", "дней"])}`;
}

// A calendar day as "YYYY-MM-DD" (see getKeepInTouchStatus) -> "26 ноября"; the year only when it is not the current one.
// The string is read as a UTC date and formatted in UTC, so the time zone of the server cannot move the day
export function formatCalendarDay(day: string, today: string) {
  const text = dayMonthFormat.format(new Date(`${day}T00:00:00Z`));
  const year = day.slice(0, 4);
  return year === today.slice(0, 4) ? text : `${text} ${year}`;
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

// Avatar colors from the landing palette
const avatarColors = [
  "bg-pistachio text-ink",
  "bg-butter-avatar text-ink",
  "bg-ink text-pistachio",
  "bg-mid-green text-ink",
];

// Stable color per name, so the same person always gets the same avatar
export function avatarColor(name: string) {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return avatarColors[hash % avatarColors.length];
}
