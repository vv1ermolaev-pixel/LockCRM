// How many rows of the home list are shown: ?page=N in the address means the first N × PAGE_SIZE.
// No "server-only": the home page and the contact card both read it

export const PAGE_SIZE = 20;
// A huge number in the address never reaches SQL: the worst case is the whole list, as before parts
export const MAX_PAGE = 10_000;

// A whole number from 1 up; anything else ("0", "-3", "abc", none) is the first page
export function parsePage(value: string | string[] | undefined) {
  const page = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1;
}

type ListPlace = { groupId?: number | null; page?: number };

// The chosen group and how many parts are shown; the first page is not written
function listParams({ groupId, page = 1 }: ListPlace) {
  const params = new URLSearchParams();
  if (groupId) params.set("group", String(groupId));
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `?${query}` : "";
}

// The home list as it was left: the card's "Все контакты" goes back here
export function homeHref(place: ListPlace) {
  return `/${listParams(place)}`;
}

// A card opened from the home list carries the place in the list, so "Все контакты" can bring it back
export function contactHref(id: number, place: ListPlace) {
  return `/contacts/${id}${listParams(place)}`;
}
