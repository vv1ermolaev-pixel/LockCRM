import "dotenv/config";

import type { TestProject } from "vitest/node";

import { createTestDatabase, testDatabaseUrl } from "./database";

declare module "vitest" {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}

export default async function setup(project: TestProject) {
  const workingUrl = process.env.DATABASE_URL;
  const { url, name } = testDatabaseUrl(workingUrl);
  await createTestDatabase(workingUrl!, name);
  console.log(`Tests use the database "${name}"`);
  project.provide("testDatabaseUrl", url);
}
