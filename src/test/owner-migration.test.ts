import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, inject, it } from "vitest";

import { applyPendingMigrations, resetTestDatabaseUpTo } from "./database";

// The release before login: the migrations up to the default groups. Plain SQL on its own connection:
// the current schema has columns these tables do not have yet
const testUrl = inject("testDatabaseUrl");
const OWNER_EMAIL = "owner@example.com";

let client: postgres.Sql;

beforeEach(() => {
  client = postgres(testUrl, { max: 1, onnotice: () => {} });
});

afterEach(async () => {
  await client.end();
});

// Anna and Boris with notes, the 4 default groups, one group of the owner's own and some people in groups
async function fillExistingData() {
  await client`
    insert into contacts (name, about, how_we_met, phone, email, contact_frequency, contact_marked_at, created_at, updated_at)
    values
      ('Анна Смирнова', 'Дизайнер', 'На курсах', '+7 900 111-22-33', 'anna@example.com', 'week', '2025-05-01T09:00:00Z', '2025-01-10T09:00:00Z', '2025-01-11T09:00:00Z'),
      ('Борис', null, null, null, null, null, null, '2025-02-10T09:00:00Z', '2025-02-10T09:00:00Z')
  `;
  await client`
    insert into notes (contact_id, body, created_at)
    select id, 'Обсудили отпуск', '2025-02-01T10:00:00Z' from contacts where name = 'Анна Смирнова'
  `;
  await client`insert into groups (name, color, position) values ('Теннис', 'lilac', 5)`;
  await client`
    insert into contact_groups (contact_id, group_id)
    select c.id, g.id from contacts c, groups g
    where (c.name = 'Анна Смирнова' and g.name in ('Друзья', 'Теннис')) or (c.name = 'Борис' and g.name = 'Семья')
  `;
}

// Everything the migration must not change, in a stable order
async function dataSnapshot() {
  return {
    contacts: await client`select * from contacts order by id`,
    notes: await client`select * from notes order by id`,
    groups: await client`select id, name, color, position, created_at from groups order by id`,
    contactGroups: await client`select * from contact_groups order by contact_id, group_id`,
  };
}

// The contacts table without the owner column that the migration adds
function withoutOwner(rows: postgres.RowList<postgres.Row[]>) {
  return rows.map((row) => Object.fromEntries(Object.entries(row).filter(([column]) => column !== "owner_id")));
}

async function columnExists(table: string, column: string) {
  const [{ exists }] = await client`
    select exists(select 1 from information_schema.columns where table_name = ${table} and column_name = ${column}) as exists
  `;
  return exists as boolean;
}

async function tableExists(table: string) {
  const [{ exists }] = await client`select to_regclass(${`public.${table}`}) is not null as exists`;
  return exists as boolean;
}

describe("Existing data after the login deploy", () => {
  it("gives every contact and group to the owner and loses nothing", async () => {
    await resetTestDatabaseUpTo(testUrl, "0003_default_groups");
    await fillExistingData();
    const before = await dataSnapshot();

    await applyPendingMigrations(testUrl, { ownerEmail: OWNER_EMAIL });

    const after = await dataSnapshot();
    expect(withoutOwner(after.contacts)).toEqual(before.contacts);
    expect(after.notes).toEqual(before.notes);
    expect(withoutOwner(after.groups)).toEqual(before.groups);
    expect(after.contactGroups).toEqual(before.contactGroups);
    expect(after.contacts).toHaveLength(2);
    expect(after.notes).toHaveLength(1);
    expect(after.groups).toHaveLength(5);
    expect(after.contactGroups).toHaveLength(3);

    const users = await client`select id, email, email_verified from users`;
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ email: OWNER_EMAIL, email_verified: true });
    const owners = await client`
      select owner_id from contacts union select owner_id from groups
    `;
    expect(owners).toEqual([{ owner_id: users[0].id }]);
  });

  it("stops without changing anything when the owner email is not set", async () => {
    await resetTestDatabaseUpTo(testUrl, "0003_default_groups");
    await fillExistingData();
    const before = await dataSnapshot();

    await expect(applyPendingMigrations(testUrl)).rejects.toThrow();

    expect(await dataSnapshot()).toEqual(before);
    expect(await tableExists("users")).toBe(false);
    expect(await columnExists("contacts", "owner_id")).toBe(false);
    expect(await columnExists("groups", "owner_id")).toBe(false);
  });
});

describe("A new installation on an empty database", () => {
  it("passes without the owner email and leaves no groups and no users", async () => {
    await resetTestDatabaseUpTo(testUrl, "0003_default_groups");

    await applyPendingMigrations(testUrl);

    expect(await client`select * from groups`).toHaveLength(0);
    expect(await client`select * from users`).toHaveLength(0);
  });

  it("gives the 4 default groups to the owner when the email is set", async () => {
    await resetTestDatabaseUpTo(testUrl, "0003_default_groups");

    await applyPendingMigrations(testUrl, { ownerEmail: OWNER_EMAIL });

    const [owner] = await client`select id from users where email = ${OWNER_EMAIL}`;
    const groups = await client`select name, color, position, owner_id from groups order by position`;
    expect(groups).toEqual([
      { name: "Семья", color: "pink", position: 1, owner_id: owner.id },
      { name: "Друзья", color: "green", position: 2, owner_id: owner.id },
      { name: "Знакомые", color: "yellow", position: 3, owner_id: owner.id },
      { name: "Коллеги", color: "blue", position: 4, owner_id: owner.id },
    ]);
  });

  it("stops when a default group was renamed: that is somebody's data, and it needs an owner", async () => {
    await resetTestDatabaseUpTo(testUrl, "0003_default_groups");
    await client`update groups set name = 'Родня' where name = 'Семья'`;

    await expect(applyPendingMigrations(testUrl)).rejects.toThrow();

    expect(await tableExists("users")).toBe(false);
    expect(await client`select name from groups where name = 'Родня'`).toHaveLength(1);
  });
});
