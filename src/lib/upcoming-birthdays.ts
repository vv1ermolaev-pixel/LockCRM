import "server-only";

import { and, asc, eq, or } from "drizzle-orm";

import { db } from "@/db";
import { contacts } from "@/db/schema";
import { birthdayWindow, nextBirthday, turningAge, type CalendarDay } from "@/lib/birthdays";
import { ownedBy } from "@/lib/contacts";
import { contactInGroup } from "@/lib/groups";

export type UpcomingBirthday = {
  id: number;
  name: string;
  // 0 is today
  daysUntil: number;
  // The day it is celebrated: 28 February for 29 February in a common year
  date: CalendarDay;
  // null when the year of birth is not known
  turningAge: number | null;
};

// The "Скоро день рождения" block: contacts whose birthday is today or in the next 6 days, the nearest first,
// the same day by name; with a group, only the people in it. The window pairs and the day count come from the same
// module, so the selection and the text of a row cannot disagree
export async function listUpcomingBirthdays(
  userId: string,
  groupId: number | null | undefined,
  today: CalendarDay,
): Promise<UpcomingBirthday[]> {
  const inWindow = or(
    ...birthdayWindow(today).map(({ month, day }) => and(eq(contacts.birthMonth, month), eq(contacts.birthDay, day))),
  );
  const rows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      birthDay: contacts.birthDay,
      birthMonth: contacts.birthMonth,
      birthYear: contacts.birthYear,
    })
    .from(contacts)
    .where(and(ownedBy(userId), inWindow, contactInGroup(userId, groupId)))
    // By name as in the main list; the sort by days below is stable and keeps this order within a day
    .orderBy(asc(contacts.name), asc(contacts.id));

  return rows
    .flatMap(({ id, name, birthDay, birthMonth, birthYear }) => {
      if (birthDay === null || birthMonth === null) return [];
      const birth = { day: birthDay, month: birthMonth, year: birthYear };
      const { date, daysUntil } = nextBirthday(birth, today);
      return [{ id, name, daysUntil, date, turningAge: turningAge(birth, today) }];
    })
    .sort((a, b) => a.daysUntil - b.daysUntil);
}
