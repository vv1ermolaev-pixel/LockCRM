// Texts the user sees when an action cannot be done as pressed. One place, so a new action takes them from here

export const CONTACT_DELETED = "Этот контакт уже удалён";

export const BACK_TO_LIST = "К списку контактов";

// A failure that is not the user's input: no connection, the server is down, the database failed.
// The reason is not named: the user cannot fix it, and one text covers all of them
export function failureMessage(what: string) {
  return `Не удалось ${what}. Попробуйте ещё раз.`;
}
