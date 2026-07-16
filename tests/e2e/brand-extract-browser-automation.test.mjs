import test from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { Builder, By, until } from "selenium-webdriver";

const baseUrl = process.env.BRAND_EXTRACT_TEST_BASE_URL || "http://127.0.0.1:3005";
const screenshotDir = path.resolve("tests/artifacts/brand-extract");
const crawlUrl = "https://chleartech.in/test/suryadevlopers/v3m/";

test("playwright drives brand-extract crawl setup end to end and captures screenshots", async () => {
  await mkdir(screenshotDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  try {
    await page.goto(`${baseUrl}/brand-extract`, { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(screenshotDir, "01-playwright-step-1-empty.png"), fullPage: true });

    await page.getByTestId("brand-name-input").fill("Surya Developers V3M");
    await page.getByTestId("website-url-input").fill(crawlUrl);
    await page.getByTestId("industry-select").selectOption({ label: "Real Estate" });
    await page.screenshot({ path: path.join(screenshotDir, "02-playwright-step-1-filled.png"), fullPage: true });

    await page.getByTestId("save-brand-context-button").click();
    await page.getByTestId("crawl-website-url-input").waitFor({ state: "visible" });
    await page.getByTestId("crawl-website-url-input").fill(crawlUrl);
    await page.getByTestId("path-prefix-input").fill("/all");
    await page.getByTestId("add-path-prefix-button").click();
    await page.getByTestId("rights-acknowledgement").check();
    await page.screenshot({ path: path.join(screenshotDir, "03-playwright-step-2-crawl-setup.png"), fullPage: true });

    await page.getByTestId("start-brand-crawl-button").click();
    await page.getByText("Live Scan Command Console").waitFor({ timeout: 30000 });
    await page.getByTestId("crawl-run-status").waitFor({ timeout: 30000 });
    await page.waitForFunction(
      () => document.querySelector('[data-testid="crawl-run-status"]')?.textContent?.toLowerCase().includes("ready"),
      undefined,
      { timeout: 30000 }
    );
    await page.screenshot({ path: path.join(screenshotDir, "04-playwright-step-3-succeeded.png"), fullPage: true });

    await page.getByRole("button", { name: /Use Selected:/ }).click();
    await page.getByTestId("review-dossier-button").waitFor({ state: "visible" });
    await page.getByTestId("review-dossier-button").click();
    await page.getByText("Extracted Candidate Dossier").waitFor({ timeout: 30000 });
    await page.screenshot({ path: path.join(screenshotDir, "05-playwright-step-4-dossier.png"), fullPage: true });

    await page.getByRole("button", { name: /View Asset Pack/ }).click();
    await page.getByRole("heading", { name: "Acquired brand assets" }).waitFor({ timeout: 30000 });
    await page.setViewportSize({ width: 760, height: 1000 });
    const cupboard = page.getByRole("region", { name: "Acquired brand assets cupboard" });
    await cupboard.waitFor({ state: "visible" });
    assert.equal(await cupboard.getByText("No retained assets yet.").isVisible(), true);
    assert.equal(await page.getByText(/Retained evidence is not deleted\./).first().isVisible(), true);
    assert.equal(await page.locator('img[src^="artifact:"]').count(), 0);
    assert.equal(
      await cupboard.evaluate((element) => element.scrollWidth > element.clientWidth),
      true,
      "the acquired-assets cupboard should overflow sideways at a narrow viewport"
    );
    await page.screenshot({ path: path.join(screenshotDir, "06-playwright-step-5-acquired-assets.png"), fullPage: true });

    assert.equal(
      consoleErrors.some((entry) => /Illegal invocation|Illegal execution|Failed to fetch on 'window'/i.test(entry)),
      false,
      consoleErrors.join("\n")
    );
  } finally {
    await browser.close();
  }
});

test("selenium opens brand-extract and verifies crawl setup is usable", async () => {
  await mkdir(screenshotDir, { recursive: true });
  const driver = await new Builder().forBrowser("chrome").build();
  try {
    await driver.manage().window().setRect({ width: 1440, height: 1100 });
    await driver.get(`${baseUrl}/brand-extract`);
    await driver.wait(until.elementLocated(By.css('[data-testid="brand-name-input"]')), 30000);

    await driver.findElement(By.css('[data-testid="brand-name-input"]')).sendKeys("Surya Developers V3M");
    await driver.findElement(By.css('[data-testid="website-url-input"]')).sendKeys(crawlUrl);
    await driver.findElement(By.css('[data-testid="save-brand-context-button"]')).click();
    await driver.wait(until.elementLocated(By.css('[data-testid="crawl-website-url-input"]')), 30000);

    const screenshot = await driver.takeScreenshot();
    await import("node:fs/promises").then(({ writeFile }) =>
      writeFile(path.join(screenshotDir, "07-selenium-step-2-crawl-setup.png"), screenshot, "base64")
    );

    const crawlUrlValue = await driver.findElement(By.css('[data-testid="crawl-website-url-input"]')).getAttribute("value");
    assert.equal(crawlUrlValue, crawlUrl);
  } finally {
    await driver.quit();
  }
});

async function expectValue(page, testId) {
  await page.waitForFunction(
    (selector) => {
      const input = document.querySelector(selector);
      return input && "value" in input && input.value.length > 0;
    },
    `[data-testid="${testId}"]`,
    { timeout: 30000 }
  );
}
