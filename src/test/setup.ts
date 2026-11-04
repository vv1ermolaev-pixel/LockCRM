// Runs in every test file before its own imports, so src/db connects to the test database
import { beforeEach, inject } from "vitest";

import { assertTestDatabase, resetTestDatabase } from "./database";
import { clearMailbox } from "./mailpit";
import { resetBrowsers } from "./stubs/next-headers";

const testUrl = inject("testDatabaseUrl");
assertTestDatabase(testUrl, process.env.DATABASE_URL);
process.env.DATABASE_URL = testUrl;

// Login settings of the tests. The emails always go to Mailpit, whatever .env says: tests must never send real ones
process.env.BETTER_AUTH_SECRET = "test-secret-for-the-automatic-tests-only";
process.env.BETTER_AUTH_URL = "http://127.0.0.1:3000";
process.env.SMTP_URL = "smtp://127.0.0.1:1025";
process.env.MAIL_FROM = "noreply@example.com";

beforeEach(async () => {
  await resetTestDatabase(testUrl);
  await clearMailbox();
  resetBrowsers();
});
