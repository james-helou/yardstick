import { expect, test } from "@playwright/test";

/**
 * The path the product is for: an agency signs up, lands in its own workspace, adds a
 * business, finds it, and opens it. Each run uses a fresh account, so the suite is
 * repeatable without truncating anything.
 */
const run = Date.now();
const account = {
  agency: `Harbour Digital ${run}`,
  email: `e2e-${run}@yardstick.test`,
  password: "a-sufficiently-long-password",
};

test("an agency signs up, adds a business, and finds it", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByLabel("Agency name").fill(account.agency);
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Create workspace" }).click();

  // Sign-up lands inside the workspace it just created.
  await expect(page).toHaveURL(/\/businesses$/);
  await expect(page.getByRole("heading", { name: "Businesses" })).toBeVisible();
  await expect(page.getByText("No businesses yet.")).toBeVisible();

  await page.getByRole("link", { name: "Add a business" }).first().click();
  await page.getByLabel("Business name").fill("Bright Smile Dental");
  await page.getByLabel("Category").fill("Dentist");
  await page.getByLabel("Website").fill("brightsmile.ca/");
  await page.getByLabel("City").fill("Montreal");
  await page.getByLabel("Country").fill("ca");
  await page.getByRole("button", { name: "Add business" }).click();

  // The detail page, with the normalisation the pure module promised.
  await expect(page).toHaveURL(/\/businesses\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Bright Smile Dental" })).toBeVisible();
  await expect(page.getByText("Prospect · Montreal, CA")).toBeVisible();
  await expect(page.getByLabel("Website")).toHaveValue("https://brightsmile.ca");

  await page.getByRole("link", { name: "Businesses" }).first().click();
  await expect(page.getByRole("link", { name: "Bright Smile Dental" })).toBeVisible();

  // Search finds it, and a term that matches nothing says so in its own words.
  await page.getByLabel("Search").fill("montreal");
  await expect(page).toHaveURL(/q=montreal/);
  await expect(page.getByRole("link", { name: "Bright Smile Dental" })).toBeVisible();

  await page.getByLabel("Search").fill("nothing matches this");
  await expect(page.getByText(/No businesses match/)).toBeVisible();
});

test("a signed out visitor cannot reach the workspace", async ({ page }) => {
  await page.goto("/businesses");
  await expect(page).toHaveURL(/\/sign-in$/);
});
