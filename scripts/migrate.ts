// Applies pending database migrations from ./drizzle and exits.
// On the server it runs as a one-off container before a new app version starts (see deploy/deploy.sh).
// Locally use `pnpm db:migrate`: both keep track of applied migrations in the same table.

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const MIGRATIONS_FOLDER = "./drizzle";

async function countApplied(client: postgres.Sql) {
  const [{ exists }] = await client`select to_regclass('drizzle.__drizzle_migrations') is not null as exists`;
  if (!exists) return 0;
  const [{ value }] = await client`select count(*)::int as value from drizzle.__drizzle_migrations`;
  return value as number;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set.");
  }

  // Silence Postgres notices like "schema already exists, skipping"
  const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });

  try {
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
