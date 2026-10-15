import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests of the sign-in flows. They need the local Supabase stack
 * (`npm run db:start`, with Mailpit catching the emails) and the app built
 * against it, which is what the CI "e2e" job does. Fictional students only
 * (*.example.test); nothing here ever runs against a hosted project.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 4 * 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3020",
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    trace: "off",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec/ },
  ],
});
