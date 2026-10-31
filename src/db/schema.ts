import { sql } from "drizzle-orm";
import { index, integer, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Relative import: drizzle-kit and scripts/seed.ts do not know the "@/" alias
import { contactFrequencies } from "../lib/contact-frequency";
import { groupColors } from "../lib/group-colors";

export const contactFrequencyEnum = pgEnum("contact_frequency", contactFrequencies);
export const groupColorEnum = pgEnum("group_color", groupColors);

export const contacts = pgTable(
  "contacts",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: text("name").notNull(),
    // Who this person is: role, occupation, relation
    about: text("about"),
    howWeMet: text("how_we_met"),
    phone: text("phone"),
    email: text("email"),
    // How often to stay in touch; NULL means "not set"
    contactFrequency: contactFrequencyEnum("contact_frequency"),
    // When the "Contacted" (Связались) button was last pressed. Only the mark and undo actions write it:
    // editing a contact is not communication
    contactMarkedAt: timestamp("contact_marked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("contacts_name_idx").on(table.name)],
);

export const notes = pgTable(
  "notes",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("notes_contact_id_created_at_idx").on(table.contactId, table.createdAt)],
);

export const groups = pgTable(
  "groups",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: text("name").notNull(),
    color: groupColorEnum("color").notNull(),
    // Place in the user's order; every list of groups is sorted by position, then id
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Names are unique ignoring case and "ё", the same rule as search. The code checks first to show the error
  // under the field; the index guards against two saves at once
  (table) => [uniqueIndex("groups_name_key_idx").using("btree", sql`replace(lower(${table.name}), 'ё', 'е')`)],
);

// Who is in which group. Deleting a contact or a group removes its rows here and nothing else
export const contactGroups = pgTable(
  "contact_groups",
  {
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.contactId, table.groupId] }),
    index("contact_groups_group_id_idx").on(table.groupId),
  ],
);

export type Contact = typeof contacts.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type Group = typeof groups.$inferSelect;
