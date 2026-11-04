// The functions of src/lib as the signed-in test user calls them: whose data to read is taken from the session
// of the current browser, as the pages do with requireUserId(). Tests of one person use these, tests of
// two people call the functions of src/lib with a user id

import {
  countContacts as countContactsOf,
  getContact as getContactOf,
  listContacts as listContactsOf,
  listNotes as listNotesOf,
} from "@/lib/contacts";
import { loadContactsPage as loadContactsPageOf } from "@/lib/contacts-page";
import { getContactGroupIds as getContactGroupIdsOf, listGroups as listGroupsOf } from "@/lib/groups";
import { listDueContacts as listDueContactsOf } from "@/lib/keep-in-touch";
import { getCurrentUser } from "@/lib/session";

import { signInAs } from "./sign-in";

export const TEST_USER_EMAIL = "test-user@example.com";

// The first line of the tests that need a person inside. A new browser each time: the previous test's is gone
export function signInTestUser() {
  return signInAs(TEST_USER_EMAIL);
}

export async function currentUserId() {
  const user = await getCurrentUser();
  if (!user) throw new Error("The test is not signed in");
  return user.id;
}

export const countContacts = async (
  ...args: Parameters<typeof countContactsOf> extends [string, ...infer Rest] ? Rest : never
) => countContactsOf(await currentUserId(), ...args);

export const listContacts = async (
  ...args: Parameters<typeof listContactsOf> extends [string, ...infer Rest] ? Rest : never
) => listContactsOf(await currentUserId(), ...args);

export const getContact = async (
  ...args: Parameters<typeof getContactOf> extends [string, ...infer Rest] ? Rest : never
) => getContactOf(await currentUserId(), ...args);

export const listNotes = async (
  ...args: Parameters<typeof listNotesOf> extends [string, ...infer Rest] ? Rest : never
) => listNotesOf(await currentUserId(), ...args);

export const loadContactsPage = async (
  ...args: Parameters<typeof loadContactsPageOf> extends [string, ...infer Rest] ? Rest : never
) => loadContactsPageOf(await currentUserId(), ...args);

export const listGroups = async () => listGroupsOf(await currentUserId());

export const getContactGroupIds = async (
  ...args: Parameters<typeof getContactGroupIdsOf> extends [string, ...infer Rest] ? Rest : never
) => getContactGroupIdsOf(await currentUserId(), ...args);

export const listDueContacts = async (
  ...args: Parameters<typeof listDueContactsOf> extends [string, ...infer Rest] ? Rest : never
) => listDueContactsOf(await currentUserId(), ...args);
