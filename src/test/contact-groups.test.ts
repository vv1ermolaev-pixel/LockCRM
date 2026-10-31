import { describe, expect, it } from "vitest";

import {
  createContact,
  createGroup,
  deleteContact,
  deleteGroup,
  renameGroup,
  reorderGroups,
  setGroupColor,
  updateContact,
} from "@/app/actions";
import { countContacts, listContacts } from "@/lib/contacts";
import { getContactGroupIds, listGroups } from "@/lib/groups";

import { contactForm } from "./forms";
import { addContact, addGroup, groupId } from "./scenario";

async function groupSizes() {
  return Object.fromEntries((await listGroups()).map((group) => [group.name, group.contactCount]));
}

describe("Default groups after deploy", () => {
  it("has «Семья», «Друзья», «Знакомые», «Коллеги» in this order, pink, green, yellow, blue, with nobody in them", async () => {
    const contactId = await addContact("Анна Смирнова");

    expect(await listGroups()).toMatchObject([
      { name: "Семья", color: "pink", contactCount: 0 },
      { name: "Друзья", color: "green", contactCount: 0 },
      { name: "Знакомые", color: "yellow", contactCount: 0 },
      { name: "Коллеги", color: "blue", contactCount: 0 },
    ]);
    expect(await listGroups()).toHaveLength(4);
    expect(await getContactGroupIds(contactId)).toEqual([]);
  });
});

describe("Contact groups", () => {
  it("puts a contact in two groups: Анна in «Друзья» and «Теннис»", async () => {
    const friends = await groupId("Друзья");
    const tennis = await addGroup("Теннис");

    const anna = await addContact("Анна", { groupIds: [friends, tennis] });

    expect(await getContactGroupIds(anna)).toEqual([friends, tennis]);
    expect(await groupSizes()).toMatchObject({ Друзья: 1, Теннис: 1 });
  });

  it("saves a contact with no groups checked and it is in no group", async () => {
    const id = await addContact("Борис");

    expect(await countContacts()).toBe(1);
    expect(await getContactGroupIds(id)).toEqual([]);
    expect(Object.values(await groupSizes())).toEqual([0, 0, 0, 0]);
  });
});

describe("Groups in the contact window", () => {
  it("adds a new contact to «Семья» checked in the «Новый контакт» window", async () => {
    const family = await groupId("Семья");

    const id = await addContact("Мама", { groupIds: [family] });

    expect(await getContactGroupIds(id)).toEqual([family]);
  });

  it("removes a contact from «Теннис» unchecked in «Изменить», keeping «Друзья»", async () => {
    const friends = await groupId("Друзья");
    const tennis = await addGroup("Теннис");
    const anna = await addContact("Анна", { groupIds: [friends, tennis] });

    const result = await updateContact(anna, contactForm({ name: "Анна", groupIds: [friends] }));

    expect(result.ok).toBe(true);
    expect(await getContactGroupIds(anna)).toEqual([friends]);
    expect(await groupSizes()).toMatchObject({ Друзья: 1, Теннис: 0 });
  });
});

describe("New group from the contact window", () => {
  it("creates «Теннис» typed in «Изменить» on save and puts the contact in it", async () => {
    const anna = await addContact("Анна");

    await updateContact(anna, contactForm({ name: "Анна", newGroups: ["Теннис"] }));

    const tennis = (await listGroups()).at(-1);
    expect(tennis).toMatchObject({ name: "Теннис", contactCount: 1 });
    expect(await getContactGroupIds(anna)).toEqual([tennis!.id]);
  });

  it("checks the existing «Друзья» when «друзья» is typed and creates no new group", async () => {
    const friends = await groupId("Друзья");

    const anna = await addContact("Анна", { newGroups: ["друзья"] });

    expect(await getContactGroupIds(anna)).toEqual([friends]);
    expect((await listGroups()).map((group) => group.name)).toEqual(["Семья", "Друзья", "Знакомые", "Коллеги"]);
  });

  it("does not save the contact when the new group name is longer than 40 characters", async () => {
    const result = await createContact(contactForm({ name: "Анна", newGroups: ["Т".repeat(41)] }));

    expect(result).toEqual({ ok: false, errors: { newGroups: "Слишком длинно — до 40 символов" } });
    expect(await countContacts()).toBe(0);
    expect(await listGroups()).toHaveLength(4);
  });
});

function nameForm(name: string) {
  const formData = new FormData();
  formData.set("name", name);
  return formData;
}

async function groupNames() {
  return (await listGroups()).map((group) => group.name);
}

async function groupColorsByName() {
  return Object.fromEntries((await listGroups()).map((group) => [group.name, group.color]));
}

describe("Groups are stored on the server", () => {
  it("shows «Теннис» with Анна in it on a fresh read, as another browser would", async () => {
    const tennis = await addGroup("Теннис");
    const anna = await addContact("Анна", { groupIds: [tennis] });

    expect(await groupSizes()).toMatchObject({ Теннис: 1 });
    expect(await getContactGroupIds(anna)).toEqual([tennis]);
  });
});

describe("Group name", () => {
  it("rejects a name of spaces only with «Укажите название»", async () => {
    expect(await createGroup(nameForm("   "))).toEqual({ ok: false, error: "Укажите название" });
    expect(await listGroups()).toHaveLength(4);
  });

  it("rejects a name of 41 characters with «Слишком длинно — до 40 символов»", async () => {
    expect(await createGroup(nameForm("Т".repeat(41)))).toEqual({
      ok: false,
      error: "Слишком длинно — до 40 символов",
    });
    expect(await listGroups()).toHaveLength(4);
  });

  it("rejects creating «теннис» when «Теннис» exists with «Такая группа уже есть»", async () => {
    await addGroup("Теннис");

    expect(await createGroup(nameForm("теннис"))).toEqual({ ok: false, error: "Такая группа уже есть" });
    expect(await groupNames()).toEqual(["Семья", "Друзья", "Знакомые", "Коллеги", "Теннис"]);
  });

  it("rejects renaming another group to «теннис» when «Теннис» exists with «Такая группа уже есть»", async () => {
    await addGroup("Теннис");
    const football = await addGroup("Футбол");

    expect(await renameGroup(football, nameForm("теннис"))).toEqual({ ok: false, error: "Такая группа уже есть" });
    expect(await groupNames()).toEqual(["Семья", "Друзья", "Знакомые", "Коллеги", "Теннис", "Футбол"]);
  });

  it("treats «ё» and «е» as the same letter: «Ёлка» exists, «елка» is rejected", async () => {
    await addGroup("Ёлка");

    expect(await createGroup(nameForm("елка"))).toEqual({ ok: false, error: "Такая группа уже есть" });
  });

  it("trims spaces around the name: «  Теннис  » becomes «Теннис»", async () => {
    await createGroup(nameForm("  Теннис  "));

    expect((await groupNames()).at(-1)).toBe("Теннис");
  });
});

describe("Group color", () => {
  it("gives the first new group after deploy «Персиковый» and the next one «Сиреневый»", async () => {
    await addGroup("Теннис");
    await addGroup("Аналитики");

    expect(await groupColorsByName()).toMatchObject({ Теннис: "peach", Аналитики: "lilac" });
  });

  it("gives a new group «Сиреневый» when every other color is taken", async () => {
    // Default groups are pink, green, yellow and blue; these three take peach, teal and gray
    await addGroup("Теннис");
    await setGroupColor(await addGroup("Футбол"), "teal");
    await setGroupColor(await addGroup("Шахматы"), "gray");

    await addGroup("Аналитики");

    expect(await groupColorsByName()).toMatchObject({ Аналитики: "lilac" });
  });
});

describe("Group order", () => {
  it("puts a new group last: «Семья», «Друзья», then «Аналитики»", async () => {
    await deleteGroup(await groupId("Знакомые"));
    await deleteGroup(await groupId("Коллеги"));

    await createGroup(nameForm("Аналитики"));

    expect(await groupNames()).toEqual(["Семья", "Друзья", "Аналитики"]);
  });

  it("keeps the order of the rest after a delete: «Семья», «Теннис», «Друзья» without «Теннис»", async () => {
    for (const name of ["Друзья", "Знакомые", "Коллеги"]) await deleteGroup(await groupId(name));
    await addGroup("Теннис");
    await addGroup("Друзья");
    expect(await groupNames()).toEqual(["Семья", "Теннис", "Друзья"]);

    await deleteGroup(await groupId("Теннис"));

    expect(await groupNames()).toEqual(["Семья", "Друзья"]);
  });
});

describe("Default groups after deploy", () => {
  it("lets the user delete the default group «Коллеги»", async () => {
    await deleteGroup(await groupId("Коллеги"));

    expect(await groupNames()).toEqual(["Семья", "Друзья", "Знакомые"]);
  });
});

describe("The «Группы» window", () => {
  it("lists «Друзья · 12 человек» and «Коллеги · 0 человек»", async () => {
    const friends = await groupId("Друзья");
    for (let i = 1; i <= 12; i++) await addContact(`Друг ${i}`, { groupIds: [friends] });

    expect(await groupSizes()).toMatchObject({ Друзья: 12, Коллеги: 0 });
  });

  it("counts 11 people in «Друзья» after Анна, one of 12, is deleted", async () => {
    const friends = await groupId("Друзья");
    const anna = await addContact("Анна", { groupIds: [friends] });
    for (let i = 1; i <= 11; i++) await addContact(`Друг ${i}`, { groupIds: [friends] });

    await deleteContact(anna);

    expect(await groupSizes()).toMatchObject({ Друзья: 11 });
  });
});

describe("Creating a group in the «Группы» window", () => {
  it("adds «Аналитики» as the last group with 0 people", async () => {
    const result = await createGroup(nameForm("Аналитики"));

    expect(result.ok).toBe(true);
    expect((await listGroups()).at(-1)).toMatchObject({ name: "Аналитики", contactCount: 0 });
  });
});

describe("Renaming a group", () => {
  it("renames «Теннис» with 3 people to «Большой теннис» and keeps the same people in it", async () => {
    const tennis = await addGroup("Теннис");
    const people = [];
    for (const name of ["Анна", "Борис", "Вера"]) people.push(await addContact(name, { groupIds: [tennis] }));

    expect(await renameGroup(tennis, nameForm("Большой теннис"))).toEqual({ ok: true, id: tennis });

    expect(await groupSizes()).toMatchObject({ "Большой теннис": 3 });
    expect(await groupNames()).not.toContain("Теннис");
    for (const id of people) expect(await getContactGroupIds(id)).toEqual([tennis]);
  });
});

describe("Changing a group color", () => {
  it("makes «Семья» «Голубой»", async () => {
    await setGroupColor(await groupId("Семья"), "blue");

    expect(await groupColorsByName()).toMatchObject({ Семья: "blue" });
  });
});

describe("Deleting a group", () => {
  it("deletes «Теннис» with 3 people, who stay in contacts with their other groups", async () => {
    const friends = await groupId("Друзья");
    const tennis = await addGroup("Теннис");
    const anna = await addContact("Анна", { groupIds: [friends, tennis] });
    const boris = await addContact("Борис", { groupIds: [tennis] });
    const vera = await addContact("Вера", { groupIds: [tennis] });

    await deleteGroup(tennis);

    expect(await groupNames()).toEqual(["Семья", "Друзья", "Знакомые", "Коллеги"]);
    expect((await listContacts("")).map((contact) => contact.name)).toEqual(["Анна", "Борис", "Вера"]);
    expect(await getContactGroupIds(anna)).toEqual([friends]);
    expect(await getContactGroupIds(boris)).toEqual([]);
    expect(await getContactGroupIds(vera)).toEqual([]);
  });
});

describe("Group labels in the contact list", () => {
  it("gives Анна's row both «Друзья» and «Теннис», also when she is found by search", async () => {
    const friends = await groupId("Друзья");
    const tennis = await addGroup("Теннис");
    await addContact("Анна", { groupIds: [friends, tennis] });

    expect((await listContacts("")).find((contact) => contact.name === "Анна")?.groupIds).toEqual([friends, tennis]);
    expect((await listContacts("анна"))[0].groupIds).toEqual([friends, tennis]);
  });

  it("gives no labels to the row of a contact in no group", async () => {
    await addContact("Борис");

    expect((await listContacts(""))[0].groupIds).toEqual([]);
    expect((await listContacts("борис"))[0].groupIds).toEqual([]);
  });
});

describe("Group filter on the home page", () => {
  it("lists only the 3 people of «Теннис» when it is chosen, and counts 3", async () => {
    const tennis = await addGroup("Теннис");
    for (const name of ["Анна", "Борис", "Вера"]) await addContact(name, { groupIds: [tennis] });
    await addContact("Галина");
    await addContact("Дмитрий");

    expect((await listContacts("", tennis)).map((contact) => contact.name)).toEqual(["Анна", "Борис", "Вера"]);
    expect(await countContacts(tennis)).toBe(3);
  });

  it("lists Анна under both «Друзья» and «Теннис»", async () => {
    const friends = await groupId("Друзья");
    const tennis = await addGroup("Теннис");
    await addContact("Анна", { groupIds: [friends, tennis] });

    expect((await listContacts("", friends)).map((contact) => contact.name)).toEqual(["Анна"]);
    expect((await listContacts("", tennis)).map((contact) => contact.name)).toEqual(["Анна"]);
  });

  it("lists nobody and counts 0 for the empty «Коллеги»", async () => {
    await addContact("Анна");

    expect(await listContacts("", await groupId("Коллеги"))).toEqual([]);
    expect(await countContacts(await groupId("Коллеги"))).toBe(0);
  });
});

describe("Group filter with search", () => {
  it("finds only the Иван from «Теннис» (5 people) when searching «Иван»: 1 of 5", async () => {
    const tennis = await addGroup("Теннис");
    for (const name of ["Иван Петров", "Анна", "Борис", "Вера", "Галина"])
      await addContact(name, { groupIds: [tennis] });
    await addContact("Иван Сидоров");

    expect((await listContacts("Иван", tennis)).map((contact) => contact.name)).toEqual(["Иван Петров"]);
    expect(await countContacts(tennis)).toBe(5);
  });

  it("finds nobody in «Теннис» for «Пётр» when Пётр is outside the group", async () => {
    const tennis = await addGroup("Теннис");
    await addContact("Анна", { groupIds: [tennis] });
    await addContact("Пётр");

    expect(await listContacts("Пётр", tennis)).toEqual([]);
  });
});

describe("Reordering groups in the filter", () => {
  // Order «Семья», «Друзья», «Теннис»
  async function familyFriendsTennis() {
    await deleteGroup(await groupId("Знакомые"));
    await deleteGroup(await groupId("Коллеги"));
    const tennis = await addGroup("Теннис");
    return { family: await groupId("Семья"), friends: await groupId("Друзья"), tennis };
  }

  it("saves «Теннис» dragged to the front: «Теннис», «Семья», «Друзья»", async () => {
    const { family, friends, tennis } = await familyFriendsTennis();

    await reorderGroups([tennis, family, friends]);

    expect(await groupNames()).toEqual(["Теннис", "Семья", "Друзья"]);
  });

  it("keeps the new order on the next visit", async () => {
    const { family, friends, tennis } = await familyFriendsTennis();
    await reorderGroups([tennis, family, friends]);

    expect(await groupNames()).toEqual(["Теннис", "Семья", "Друзья"]);
    expect(await groupNames()).toEqual(["Теннис", "Семья", "Друзья"]);
  });

  it("uses one order everywhere: Анна's labels go «Теннис», «Друзья»", async () => {
    const { family, friends, tennis } = await familyFriendsTennis();
    const anna = await addContact("Анна", { groupIds: [friends, tennis] });

    await reorderGroups([tennis, family, friends]);

    expect(await getContactGroupIds(anna)).toEqual([tennis, friends]);
    expect((await listContacts(""))[0].groupIds).toEqual([tennis, friends]);
  });

  it("puts a group created after reordering last", async () => {
    const { family, friends, tennis } = await familyFriendsTennis();
    await reorderGroups([tennis, family, friends]);

    await addGroup("Аналитики");

    expect(await groupNames()).toEqual(["Теннис", "Семья", "Друзья", "Аналитики"]);
  });

  it("accepts a stale order from another tab: a deleted group is skipped, a new one goes after the rest", async () => {
    const { family, friends, tennis } = await familyFriendsTennis();
    // The other tab still shows «Теннис» and has not seen «Аналитики»
    await deleteGroup(tennis);
    await addGroup("Аналитики");

    await expect(reorderGroups([friends, tennis, family])).resolves.toEqual({ ok: true });

    expect(await groupNames()).toEqual(["Друзья", "Семья", "Аналитики"]);
  });
});
