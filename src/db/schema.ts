import { index, integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Relative import: drizzle-kit and scripts/seed.ts do not know the "@/" alias
import { contactFrequencies } from "../lib/contact-frequency";

export const contactFrequencyEnum = pgEnum("contact_frequency", contactFrequencies);

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

export type Contact = typeof contacts.$inferSelect;
export type Note = typeof notes.$inferSelect;
