// Birthday arithmetic shared by the "Скоро день рождения" block, the contact card and the form check, so they never
// disagree. Pure functions: "today" is a parameter, so tests can take any day (New Year, 29 February) without
// moving clocks. No database and no server-only: the form check uses it too

// A calendar day; month 1-12
export type CalendarDay = { year: number; month: number; day: number };

// A birth date as stored: day and month always, the year when known
export type BirthDate = { day: number; month: number; year?: number | null };

// What the form sends for «—» in the day and month lists: Radix Select does not allow an empty item value
export const noBirthDatePart = "none";

const TIME_ZONE = "Europe/Moscow";

const moscowDateFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

// Today in Moscow, whatever the zone of the server (it runs in UTC, where the Moscow day starts at 21:00)
export function moscowToday(now: Date = new Date()): CalendarDay {
  const parts = Object.fromEntries(moscowDateFormat.formatToParts(now).map(({ type, value }) => [type, Number(value)]));
  return { year: parts.year, month: parts.month, day: parts.day };
}

export function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(month: number, year: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// Whether the date exists. Without a year, 29 February does: it exists in leap years
export function isExistingDate(day: number, month: number, year?: number | null) {
  if (!Number.isInteger(day) || !Number.isInteger(month) || month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(month, year ?? 2000);
}

const toUtc = ({ year, month, day }: CalendarDay) => Date.UTC(year, month - 1, day);
const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(from: CalendarDay, to: CalendarDay) {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

function compareDays(a: CalendarDay, b: CalendarDay) {
  return toUtc(a) - toUtc(b);
}

// The birthday in the given year; 29 February of a common year is celebrated on 28 February
function birthdayIn(year: number, { day, month }: BirthDate): CalendarDay {
  if (month === 2 && day === 29 && !isLeapYear(year)) return { year, month: 2, day: 28 };
  return { year, month, day };
}

// The nearest birthday, today or later, and the number of days to it (0 is today)
export function nextBirthday(birth: BirthDate, today: CalendarDay): { date: CalendarDay; daysUntil: number } {
  let date = birthdayIn(today.year, birth);
  if (compareDays(date, today) < 0) date = birthdayIn(today.year + 1, birth);
  return { date, daysUntil: daysBetween(today, date) };
}

// The age reached on the nearest birthday; null without a year
export function turningAge(birth: BirthDate, today: CalendarDay): number | null {
  if (birth.year == null) return null;
  return nextBirthday(birth, today).date.year - birth.year;
}

// The age now; null without a year and for a person younger than a year (no age is shown then)
export function currentAge(birth: BirthDate, today: CalendarDay): number | null {
  if (birth.year == null) return null;
  const hadBirthdayThisYear = compareDays(birthdayIn(today.year, birth), today) <= 0;
  const age = today.year - birth.year - (hadBirthdayThisYear ? 0 : 1);
  return age >= 1 ? age : null;
}

export const BIRTHDAY_WINDOW_DAYS = 7;

// The (month, day) pairs of the 7 days starting today, to select the contacts in the window. When 28 February of a
// common year is in the window, 29 February is added: those birthdays are celebrated on the 28th
export function birthdayWindow(today: CalendarDay): { month: number; day: number }[] {
  const pairs: { month: number; day: number }[] = [];
  let commonYearFeb28 = false;
  for (let offset = 0; offset < BIRTHDAY_WINDOW_DAYS; offset++) {
    const date = new Date(toUtc(today) + offset * DAY_MS);
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    pairs.push({ month, day });
    if (month === 2 && day === 28 && !isLeapYear(date.getUTCFullYear())) commonYearFeb28 = true;
  }
  if (commonYearFeb28) pairs.push({ month: 2, day: 29 });
  return pairs;
}
