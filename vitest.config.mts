import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const fromSrc = (path: string) => fileURLToPath(new URL(`./src/${path}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": fromSrc(""),
      // Next makes "server-only" an empty module for server code; outside Next the package throws
      "server-only": fromSrc("test/stubs/empty.ts"),
      // revalidatePath needs a running Next server; tests read the database directly, so there is nothing to refresh
      "next/cache": fromSrc("test/stubs/next-cache.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globalSetup: ["src/test/global-setup.ts"],
    setupFiles: ["src/test/setup.ts"],
    // One test database for all files: they must not run at the same time
    fileParallelism: false,
  },
});
