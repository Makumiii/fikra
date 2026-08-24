import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      main: "./tests/backend/test-worker.ts",
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(path.join(import.meta.dirname, "migrations")),
          ENVIRONMENT: "development",
          SITE_NAME: "Fikra Test",
          SITE_URL: "http://localhost:8787",
          EMAIL_TRANSPORT: "outbox",
          OWNER_EMAIL: "owner@example.com",
          BETTER_AUTH_SECRET: "test-only-better-auth-secret-that-is-long-enough-to-be-safe",
        },
      },
    })),
  ],
  test: {
    include: ["tests/backend/**/*.spec.ts"],
    setupFiles: ["./tests/backend/setup.ts"],
  },
});
