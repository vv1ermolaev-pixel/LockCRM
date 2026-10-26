// Search rules shared by the server (SQL in contacts.ts) and the browser (highlighting in the list),
// so what is found and what is highlighted always agree

export type PhoneQuery = {
  // Query digits; the phone must contain them
  anywhere: string;
  // "8 916…" typed as a Russian number: the phone must start with "7916…"
  start: string | null;
};
export type SearchQuery = { words: string[]; phone: PhoneQuery | null };
export type Range = [start: number, end: number];

const PHONE_LIKE = /^[\d\s+()\-.]+$/;
// Context kept before the first match, so the match stays within two lines on a phone
const SNIPPET_LEAD = 20;
const SNIPPET_LENGTH = 160;

// Lowercase with "ё" read as "е", char for char, so positions found in it point to the same place in the original
export function normalizeText(value: string) {
  return value.replace(/[\s\S]/g, (char) => {
    const lower = char.toLowerCase();
    return lower === "ё" ? "е" : lower.length === 1 ? lower : char;
  });
}

export function parseSearchQuery(query: string): SearchQuery {
  const trimmed = query.trim();
  const words = [...new Set(normalizeText(trimmed).split(/\s+/).filter(Boolean))];
  const digits = trimmed.replace(/\D/g, "");
  const isPhone = digits.length > 0 && PHONE_LIKE.test(trimmed);
  return {
    words,
    phone: isPhone ? { anywhere: digits, start: digits.startsWith("8") ? `7${digits.slice(1)}` : null } : null,
  };
}

// Digits of a phone with a leading "8" read as "+7"; phoneKeySql in contacts.ts does the same in the database
export function phoneKey(phone: string) {
  return phone.replace(/\D/g, "").replace(/^8/, "7");
}

// The matched part of a formatted phone: "974 639" marks "974 639" in "+7 974 639-74-31" as one piece
export function findPhoneRanges(phone: string, query: PhoneQuery | null): Range[] {
  if (!query) return [];
  const digitPositions = phone.split("").flatMap((char, index) => (/\d/.test(char) ? [index] : []));
  const key = phoneKey(phone);
  let start = key.indexOf(query.anywhere);
  let length = query.anywhere.length;
  if (start === -1 && query.start && key.startsWith(query.start)) {
    start = 0;
    length = query.start.length;
  }
  if (start === -1) return [];
  return [[digitPositions[start], digitPositions[start + length - 1] + 1]];
}

export function phoneMatches(phone: string, query: PhoneQuery) {
  return findPhoneRanges(phone, query).length > 0;
}

// Every occurrence of every word, sorted, overlaps merged
export function findWordRanges(text: string, words: string[]): Range[] {
  if (words.length === 0) return [];
  const normalized = normalizeText(text);
  const ranges: Range[] = [];
  for (const word of words) {
    for (let at = normalized.indexOf(word); at !== -1; at = normalized.indexOf(word, at + word.length)) {
      ranges.push([at, at + word.length]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);

  const merged: Range[] = [];
  for (const [start, end] of ranges) {
    const last = merged.at(-1);
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

// The part of a long text around the first match, on one line: "…Обещала привезти вино к пятнице."
export function makeSnippet(text: string, words: string[]) {
  const flat = text.replace(/\s+/g, " ").trim();
  const normalized = normalizeText(flat);
  const first = Math.min(...words.map((word) => normalized.indexOf(word)).filter((index) => index !== -1));

  let start = 0;
  if (Number.isFinite(first) && first > SNIPPET_LEAD) {
    // Start at a word boundary when there is one close enough
    const space = flat.indexOf(" ", first - SNIPPET_LEAD);
    start = space !== -1 && space < first ? space + 1 : first - SNIPPET_LEAD;
  }
  const end = Math.min(flat.length, start + SNIPPET_LENGTH);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
}
