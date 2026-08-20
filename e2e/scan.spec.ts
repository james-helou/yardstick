import { expect, test } from "@playwright/test";

/**
 * A scan is started here and finished on the worker, which is not running in this
 * suite. So this covers exactly what the browser is responsible for: the scan exists,
 * it is attributed to the right business, and the report renders every pillar as
 * outstanding rather than as a blank page.
 */
const run = Date.now();
const account = {
  agency: `Scanhouse ${run}`,
  email: `e2e-scan-${run}@yardstick.test`,
  password: "a-sufficiently-long-password",
};

test("an agency runs a scan on a business and watches the report", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByLabel("Agency name").fill(account.agency);
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/businesses$/);

  await page.getByRole("link", { name: "Add a business" }).first().click();
  await page.getByLabel("Business name").fill("Rivera Plumbing");
  await page.getByLabel("Website").fill("riveraplumbing.example");
  await page.getByRole("button", { name: "Add business" }).click();
  await expect(page).toHaveURL(/\/businesses\/[0-9a-f-]{36}$/);

  await expect(page.getByText("No scans yet.")).toBeVisible();
  await page.getByRole("button", { name: "Run a scan" }).click();

  // The report, before any pillar has reported.
  await expect(page).toHaveURL(/\/scans\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Scan of Rivera Plumbing" })).toBeVisible();
  await expect(page.getByText("Not scored")).toBeVisible();
  for (const pillar of ["Google profile", "Reputation", "Site health"]) {
    await expect(page.getByRole("heading", { name: pillar })).toBeVisible();
  }
  await expect(page.getByText("Still running").first()).toBeVisible();

  // And it is listed, against the business it measured.
  await page.getByRole("link", { name: "Scans" }).first().click();
  await expect(page).toHaveURL(/\/scans$/);
  await expect(page.getByRole("link", { name: "Rivera Plumbing" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Queued" })).toBeVisible();
});
