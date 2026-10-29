// Runs in every test file before its own imports, so src/db connects to the test database
import { beforeEach, inject } from "vitest";

import { assertTestDatabase, resetTestDatabase } from "./database";

const testUrl = inject("testDatabaseUrl");
assertTestDatabase(testUrl, process.env.DATABASE_URL);
process.env.DATABASE_URL = testUrl;

beforeEach(() => resetTestDatabase(testUrl));
