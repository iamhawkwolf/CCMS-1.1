import { defineConfig } from "vitest/config";
import path from "node:path";

try { process.loadEnvFile(".env"); } catch { /* no .env */ }

// Integration tests run against a separate database so they never touch dev or demo data.
const base = new URL(process.env.DATABASE_URL ?? "postgresql://banyanroot:banyanroot@localhost:5432/banyanroot?schema=public");
const testUrl = new URL(base);
testUrl.pathname = `/${base.pathname.slice(1).replace(/_test$/, "")}_test`;
process.env.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? testUrl.toString();
process.env.ADMIN_DATABASE_URL = base.toString();

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      WHATSAPP_PROVIDER: "cloud",
      WHATSAPP_TOKEN: "test-token",
      WHATSAPP_PHONE_NUMBER_ID: "555000",
      WHATSAPP_APP_SECRET: "test-app-secret",
      WHATSAPP_VERIFY_TOKEN: "test-verify-token",
      CRON_SECRET: "test-cron-secret-0123456789",
    },
  },
});
