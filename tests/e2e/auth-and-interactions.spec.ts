import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "playwright/test";

test.describe.configure({ mode: "serial" });

function latestMagicLink(email: string) {
  const sql = `SELECT json_extract(payload_json,'$.url') url FROM email_deliveries WHERE recipient_email='${email.replaceAll("'", "''")}' AND template='magic-link' ORDER BY created_at DESC,rowid DESC LIMIT 1`;
  const output = execFileSync("npx", ["wrangler", "d1", "execute", "fikra-local", "--local", "--json", "--command", sql], { encoding: "utf8" });
  const parsed = JSON.parse(output) as Array<{ results: Array<{ url: string }> }>;
  return parsed[0]?.results[0]?.url;
}

function localOwnerEmail() {
  if (process.env.E2E_OWNER_EMAIL) return process.env.E2E_OWNER_EMAIL;
  try {
    const match = readFileSync(".dev.vars", "utf8").match(/^OWNER_EMAIL=(.+)$/m);
    if (match?.[1]) return match[1].trim();
  } catch { /* CI creates this file before the test. */ }
  return "owner@example.com";
}

function ensureOwner(email: string) {
  const escaped = email.replaceAll("'", "''");
  const suffix = Date.now().toString(36);
  const sql = `INSERT INTO users (id,email,handle,display_name,role,status,verified_at,created_at,updated_at) VALUES ('e2e-owner-${suffix}','${escaped}','owner_${suffix}','Example Owner','owner','active',unixepoch(),unixepoch(),unixepoch()) ON CONFLICT(email) DO UPDATE SET role='owner',status='active',verified_at=unixepoch(),updated_at=unixepoch()`;
  execFileSync("npx", ["wrangler", "d1", "execute", "fikra-local", "--local", "--command", sql], { stdio: "ignore" });
}

test("a subscriber can claim a handle, complete a magic link, react, and bookmark", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  test.skip(testInfo.project.name !== "desktop", "One desktop pass avoids duplicate account creation across projects.");
  const suffix = Date.now().toString(36);
  const email = `reader-${suffix}@example.com`;
  const handle = `reader_${suffix}`.slice(0, 24);
  await page.goto("/subscribe");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.locator('input[name="handle"]').fill(handle);
  await page.locator(".avatar-choice").first().click();
  await page.locator("form.subscribe-form > button").click();
  await expect(page.getByText("Check your inbox.")).toBeVisible();
  const magicUrl = latestMagicLink(email);
  expect(magicUrl).toBeTruthy();
  const verifyUrl = new URL(magicUrl);
  verifyUrl.host = new URL(page.url()).host;
  await page.goto(verifyUrl.href);
  await page.goto("/");
  await expect(page.locator(".account-chip")).toContainText(`@${handle}`);

  const post = page.locator("[data-impression-post-id='e2e-public-post']");
  await post.getByRole("button", { name: "React to post" }).click();
  await post.getByRole("button", { name: "React ❤️" }).click();
  await expect(post.getByRole("button", { name: /Remove ❤️ reaction/ })).toBeVisible();
  await post.getByRole("button", { name: /Bookmark/ }).click();
  await expect(post.getByRole("button", { name: /Remove bookmark/ })).toBeVisible();
});

test("the configured owner receives compose and studio controls after magic-link login", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  test.skip(testInfo.project.name !== "desktop", "One desktop pass avoids rate-limit noise.");
  const email = localOwnerEmail();
  ensureOwner(email);
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: /sign-in link/i }).click();
  await expect(page.getByText("Check your inbox.")).toBeVisible();
  const magicUrl = latestMagicLink(email);
  expect(magicUrl).toBeTruthy();
  const verifyUrl = new URL(magicUrl);
  verifyUrl.host = new URL(page.url()).host;
  await page.goto(verifyUrl.href);
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Studio" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Post" }).first()).toBeVisible();
  await page.goto("/compose");
  await expect(page.getByText("Owner controls")).toBeVisible();
});
