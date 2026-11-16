import { describe, expect, it } from "vitest";

import { birthdayWindow, currentAge, isExistingDate, moscowToday, nextBirthday, turningAge } from "@/lib/birthdays";

const day = (year: number, month: number, dayOfMonth: number) => ({ year, month, day: dayOfMonth });

describe("moscowToday", () => {
  it("is the next day after 21:00 UTC, because Moscow is UTC+3", () => {
    expect(moscowToday(new Date("2026-11-15T21:30:00Z"))).toEqual(day(2026, 11, 16));
  });

  it("is the same day before 21:00 UTC", () => {
    expect(moscowToday(new Date("2026-11-15T20:30:00Z"))).toEqual(day(2026, 11, 15));
  });

  it("moves to the next year at the Moscow midnight of New Year", () => {
    expect(moscowToday(new Date("2026-12-31T21:00:00Z"))).toEqual(day(2027, 1, 1));
  });
});

describe("nextBirthday", () => {
  const today = day(2026, 11, 16);

  it("is today, 0 days away", () => {
    expect(nextBirthday({ day: 16, month: 11 }, today)).toEqual({ date: day(2026, 11, 16), daysUntil: 0 });
  });

  it("is 6 days away on 22 November", () => {
    expect(nextBirthday({ day: 22, month: 11 }, today)).toEqual({ date: day(2026, 11, 22), daysUntil: 6 });
  });

  it("is 7 days away on 23 November, outside the window", () => {
    expect(nextBirthday({ day: 23, month: 11 }, today)).toEqual({ date: day(2026, 11, 23), daysUntil: 7 });
  });

  it("is next year when the birthday was yesterday", () => {
    expect(nextBirthday({ day: 15, month: 11 }, today)).toEqual({ date: day(2027, 11, 15), daysUntil: 364 });
  });

  it("goes over New Year: 2 January from 28 December is 5 days away", () => {
    expect(nextBirthday({ day: 2, month: 1 }, day(2026, 12, 28))).toEqual({ date: day(2027, 1, 2), daysUntil: 5 });
  });

  it("moves 29 February to 28 February in a common year", () => {
    expect(nextBirthday({ day: 29, month: 2 }, day(2027, 2, 25))).toEqual({ date: day(2027, 2, 28), daysUntil: 3 });
  });

  it("keeps 29 February in a leap year", () => {
    expect(nextBirthday({ day: 29, month: 2 }, day(2028, 2, 25))).toEqual({ date: day(2028, 2, 29), daysUntil: 4 });
  });

  it("looks for the next leap year's 29 February after a common year's 28 February", () => {
    expect(nextBirthday({ day: 29, month: 2 }, day(2027, 3, 1))).toEqual({ date: day(2028, 2, 29), daysUntil: 365 });
  });
});

describe("birthdayWindow", () => {
  const pairs = (today: ReturnType<typeof day>) => birthdayWindow(today).map(({ month, day }) => [month, day]);

  it("is 7 days starting today", () => {
    expect(pairs(day(2026, 11, 16))).toEqual([
      [11, 16],
      [11, 17],
      [11, 18],
      [11, 19],
      [11, 20],
      [11, 21],
      [11, 22],
    ]);
  });

  it("goes over New Year", () => {
    expect(pairs(day(2026, 12, 28))).toEqual([
      [12, 28],
      [12, 29],
      [12, 30],
      [12, 31],
      [1, 1],
      [1, 2],
      [1, 3],
    ]);
  });

  it("goes over the end of a month", () => {
    expect(pairs(day(2026, 4, 28))).toEqual([
      [4, 28],
      [4, 29],
      [4, 30],
      [5, 1],
      [5, 2],
      [5, 3],
      [5, 4],
    ]);
  });

  it("adds 29 February when 28 February of a common year is in the window", () => {
    expect(pairs(day(2027, 2, 25))).toEqual([
      [2, 25],
      [2, 26],
      [2, 27],
      [2, 28],
      [3, 1],
      [3, 2],
      [3, 3],
      [2, 29],
    ]);
  });

  it("does not add 29 February in a leap year: it is in the window by itself", () => {
    expect(pairs(day(2028, 2, 25))).toEqual([
      [2, 25],
      [2, 26],
      [2, 27],
      [2, 28],
      [2, 29],
      [3, 1],
      [3, 2],
    ]);
  });

  it("does not add 29 February when 28 February is not in the window", () => {
    expect(pairs(day(2027, 3, 1))).toHaveLength(7);
  });

  it("does not add 29 February when the window ends on 28 February of a leap year", () => {
    expect(pairs(day(2028, 2, 22))).not.toContainEqual([2, 29]);
  });

  it("matches nextBirthday: a pair is in the window exactly when the birthday is less than 7 days away", () => {
    const todays = [
      day(2026, 11, 16),
      day(2026, 12, 28),
      day(2027, 2, 22),
      day(2027, 2, 28),
      day(2028, 2, 22),
      day(2028, 2, 25),
      day(2028, 2, 29),
    ];
    for (const today of todays) {
      const window = birthdayWindow(today);
      for (let month = 1; month <= 12; month++) {
        for (let dayOfMonth = 1; dayOfMonth <= 31; dayOfMonth++) {
          if (!isExistingDate(dayOfMonth, month)) continue;
          const inWindow = window.some((pair: { month: number; day: number }) => {
            return pair.month === month && pair.day === dayOfMonth;
          });
          const soon = nextBirthday({ day: dayOfMonth, month }, today).daysUntil < 7;
          expect({ today, month, dayOfMonth, inWindow }).toEqual({ today, month, dayOfMonth, inWindow: soon });
        }
      }
    }
  });
});

describe("turningAge", () => {
  it("is the age reached today", () => {
    expect(turningAge({ day: 16, month: 11, year: 1991 }, day(2026, 11, 16))).toBe(35);
  });

  it("counts the next year when the birthday is after New Year", () => {
    expect(turningAge({ day: 2, month: 1, year: 1990 }, day(2026, 12, 28))).toBe(37);
  });

  it("counts a 29 February birthday in a common year as 28 February", () => {
    expect(turningAge({ day: 29, month: 2, year: 2000 }, day(2027, 2, 25))).toBe(27);
  });
});

describe("currentAge", () => {
  it("is the age after the birthday of this year", () => {
    expect(currentAge({ day: 14, month: 3, year: 1990 }, day(2026, 11, 16))).toBe(36);
  });

  it("is one less while the birthday of this year is still ahead", () => {
    expect(currentAge({ day: 20, month: 12, year: 1990 }, day(2026, 11, 16))).toBe(35);
  });

  it("counts the birthday day itself", () => {
    expect(currentAge({ day: 16, month: 11, year: 1990 }, day(2026, 11, 16))).toBe(36);
  });

  it("is null for a person younger than a year", () => {
    expect(currentAge({ day: 1, month: 5, year: 2026 }, day(2026, 11, 16))).toBeNull();
  });

  it("is null when the year is not known", () => {
    expect(currentAge({ day: 14, month: 3, year: null }, day(2026, 11, 16))).toBeNull();
  });
});

describe("isExistingDate", () => {
  it("has no 31 April", () => {
    expect(isExistingDate(31, 4)).toBe(false);
    expect(isExistingDate(31, 4, 1990)).toBe(false);
  });

  it("has no 29 February in a common year", () => {
    expect(isExistingDate(29, 2, 2023)).toBe(false);
    expect(isExistingDate(29, 2, 1900)).toBe(false);
  });

  it("has 29 February in a leap year and without a year", () => {
    expect(isExistingDate(29, 2, 2024)).toBe(true);
    expect(isExistingDate(29, 2, 2000)).toBe(true);
    expect(isExistingDate(29, 2)).toBe(true);
  });

  it("has no 30 February even without a year", () => {
    expect(isExistingDate(30, 2)).toBe(false);
  });

  it("has ordinary dates", () => {
    expect(isExistingDate(14, 3, 1990)).toBe(true);
    expect(isExistingDate(31, 12)).toBe(true);
  });
});
