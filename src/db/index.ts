import "server-only";

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { hideQueryValuesInErrors } from "./errors";
import * as schema from "./schema";

hideQueryValuesInErrors();

type Database = PostgresJsDatabase<typeof schema>;

// Reuse a single connection pool across hot reloads in development
const globalForDb = globalThis as unknown as { pgClient?: ReturnType<typeof postgres> };

function connect(): Database {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill in the values.");
  }
  const client = globalForDb.pgClient ?? postgres(databaseUrl);
  if (process.env.NODE_ENV !== "production") {
    globalForDb.pgClient = client;
  }
  return drizzle(client, { schema });
}

let instance: Database | undefined;

// Connects at the first query, not on import: the build loads every module with no database settings
export const db = new Proxy({} as Database, {
  get(_, property) {
    instance ??= connect();
    const value: unknown = Reflect.get(instance, property, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
