// The test database lives in the same Postgres as the working one, under the working name plus "_test".
// Every test starts from a database that is exactly what a fresh deploy gives: all migrations, no user data.

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const TEST_SUFFIX = "_test";

function databaseName(url: string) {
  return decodeURIComponent(new URL(url).pathname.slice(1));
}

// Stops before the first query if the tests could touch the working database
export function assertTestDatabase(testUrl: string, workingUrl: string | undefined) {
  const name = databaseName(testUrl);
  if (!name.endsWith(TEST_SUFFIX) || (workingUrl && name === databaseName(workingUrl))) {
    throw new Error(
      `Refusing to run tests on the database "${name}": it must end with "${TEST_SUFFIX}" and differ from DATABASE_URL.`,
    );
  }
}

export function testDatabaseUrl(workingUrl: string | undefined) {
  if (!workingUrl) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill in the values.");
  }
  const url = new URL(workingUrl);
  url.pathname = `/${encodeURIComponent(`${databaseName(workingUrl)}${TEST_SUFFIX}`)}`;
  const testUrl = url.toString();
  assertTestDatabase(testUrl, workingUrl);
  return { url: testUrl, name: databaseName(testUrl) };
}

// Creates the test database next to the working one; the working database is only used to connect
export async function createTestDatabase(workingUrl: string, name: string) {
  const client = postgres(workingUrl, { max: 1, onnotice: () => {} });
  try {
    const [existing] = await client`select 1 from pg_database where datname = ${name}`;
    if (!existing) {
      await client.unsafe(`create database "${name.replaceAll('"', '""')}"`);
    }
  } finally {
    await client.end();
  }
}

// The database as right after a deploy: schemas dropped and every migration applied again
export async function resetTestDatabase(testUrl: string) {
  const client = postgres(testUrl, { max: 1, onnotice: () => {} });
  try {
    await client`drop schema if exists public, drizzle cascade`;
    await client`create schema public`;
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  } finally {
    await client.end();
  }
}
