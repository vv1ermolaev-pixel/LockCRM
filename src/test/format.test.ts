import { describe, expect, it } from "vitest";

import { formatAge, formatBirthDate, formatBirthdayWhen } from "@/lib/format";

describe("formatBirthDate", () => {
  it("writes day, month and year", () => {
    expect(formatBirthDate({ day: 14, month: 3, year: 1990 })).toBe("14 марта 1990");
  });

  it("writes only day and month without a year", () => {
    expect(formatBirthDate({ day: 14, month: 3, year: null })).toBe("14 марта");
  });

  it("writes 29 February without a year", () => {
    expect(formatBirthDate({ day: 29, month: 2, year: null })).toBe("29 февраля");
  });
});

describe("formatAge", () => {
  it("declines the word for years", () => {
    expect(formatAge(21)).toBe("21 год");
    expect(formatAge(22)).toBe("22 года");
    expect(formatAge(25)).toBe("25 лет");
    expect(formatAge(11)).toBe("11 лет");
    expect(formatAge(1)).toBe("1 год");
  });
});

describe("formatBirthdayWhen", () => {
  it("says today with the age that is reached", () => {
    expect(formatBirthdayWhen({ daysUntil: 0, date: { year: 2026, month: 11, day: 16 }, turningAge: 35 })).toBe(
      "Сегодня · исполняется 35",
    );
  });

  it("says tomorrow with the date and the age", () => {
    expect(formatBirthdayWhen({ daysUntil: 1, date: { year: 2026, month: 11, day: 17 }, turningAge: 40 })).toBe(
      "Завтра, 17 ноября · исполнится 40",
    );
  });

  it("declines the days", () => {
    expect(formatBirthdayWhen({ daysUntil: 2, date: { year: 2026, month: 11, day: 18 }, turningAge: null })).toBe(
      "Через 2 дня, 18 ноября",
    );
    expect(formatBirthdayWhen({ daysUntil: 5, date: { year: 2026, month: 11, day: 21 }, turningAge: null })).toBe(
      "Через 5 дней, 21 ноября",
    );
  });

  it("writes today without the age when the year is not known", () => {
    expect(formatBirthdayWhen({ daysUntil: 0, date: { year: 2026, month: 11, day: 16 }, turningAge: null })).toBe(
      "Сегодня",
    );
  });

  it("counts the age of the next year over New Year", () => {
    expect(formatBirthdayWhen({ daysUntil: 5, date: { year: 2027, month: 1, day: 2 }, turningAge: 37 })).toBe(
      "Через 5 дней, 2 января · исполнится 37",
    );
  });
});
