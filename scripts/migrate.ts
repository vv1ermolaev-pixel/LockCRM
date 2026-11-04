// Applies pending database migrations from ./drizzle and exits.
// On the server it runs as a one-off container before a new app version starts (see deploy/deploy.sh).
// Locally use `pnpm db:migrate`: both keep track of applied migrations in the same table.

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { loginEmailSchema } from "../src/lib/validation";

const MIGRATIONS_FOLDER = "./drizzle";

async function countApplied(client: postgres.Sql) {
  const [{ exists }] = await client`select to_regclass('drizzle.__drizzle_migrations') is not null as exists`;
  if (!exists) return 0;
  const [{ value }] = await client`select count(*)::int as value from drizzle.__drizzle_migrations`;
  return value as number;
}

// OWNER_EMAIL is needed once: the migration that gives the existing contacts and groups an owner reads it
// (see drizzle/0004_users_and_owners.sql). The value is checked here, before any migration, and never printed:
// it is personal data
function readOwnerEmail() {
  const raw = process.env.OWNER_EMAIL?.trim();
  if (!raw) return undefined;
  const parsed = loginEmailSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("OWNER_EMAIL is not a valid email address. Nothing was migrated.");
  }
  return parsed.data;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set.");
  }

  const ownerEmail = readOwnerEmail();

  // Silence Postgres notices like "schema already exists, skipping"
  const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });

  try {
    // A setting of this one connection (max: 1): it lives until the script ends and is stored nowhere
    if (ownerEmail) {
      await client`select set_config('app.owner_email', ${ownerEmail}, false)`;
    }
    const before = await countApplied(client);
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
    const after = await countApplied(client);
    console.log(`Migrations done: ${after - before} applied now, ${after} applied in total.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Migrations failed:", error);
  process.exit(1);
});
