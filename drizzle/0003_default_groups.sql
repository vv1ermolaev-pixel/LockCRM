-- Default groups that exist right after deploy. Kept apart from 0002_groups.sql, so the next
-- `drizzle-kit generate` does not mix data with schema. Runs once: groups the user deletes do not come back.
INSERT INTO "groups" ("name", "color", "position") VALUES
  ('Семья', 'pink', 1),
  ('Друзья', 'green', 2),
  ('Знакомые', 'yellow', 3),
  ('Коллеги', 'blue', 4)
ON CONFLICT DO NOTHING;
