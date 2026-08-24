import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "playwright/test";

test("the public timeline is responsive and usable", async ({ page }, testInfo) => {
  const response = await page.goto("/", { waitUntil: "networkidle" });
  expect(response?.status()).toBe(200);
  await expect(page.locator("h1")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  if (testInfo.project.name === "mobile") {
    await expect(page.locator(".mobile-nav")).toBeVisible();
    await expect(page.locator(".left-rail")).toBeHidden();
  } else {
    await expect(page.locator(".left-rail")).toBeVisible();
    await expect(page.locator(".right-rail")).toBeVisible();
  }
});

test("public pages retain discovery metadata and accessible contrast", async ({ page }) => {
  test.setTimeout(60_000);
  for (const path of ["/", "/about", "/topics"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    await expect(page.locator('meta[name="description"]')).toHaveCount(1);
    const audit = await new AxeBuilder({ page })
      .exclude(".video-card iframe")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(audit.violations.filter((item) => item.impact === "serious" || item.impact === "critical")).toEqual([]);
  }
});

test("identity discovery does not expose privileged routes", async ({ page, request }) => {
  const invalid = await request.get("/api/handle/x!");
  expect(await invalid.json()).toEqual({ available: false, valid: false });
  const available = await request.get(`/api/handle/regression_${Date.now()}`);
  expect(await available.json()).toEqual({ available: true, valid: true });

  const studio = await page.goto("/owner");
  expect(studio?.status()).toBe(404);
  await expect(page.getByText("Studio")).toHaveCount(0);
});

test("SEO endpoints are crawlable and private surfaces are excluded", async ({ request }) => {
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()["content-type"]).toContain("application/xml");
  expect(await sitemap.text()).toContain("<urlset");

  const robots = await request.get("/robots.txt");
  const body = await robots.text();
  expect(body).toContain("Disallow: /owner");
  expect(body).toContain("Sitemap:");
});
