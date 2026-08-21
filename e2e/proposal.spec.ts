import { expect, test } from "@playwright/test";

/**
 * The selling path: price list, quote, send. What matters at the end is that sending
 * freezes the numbers, which is the promise the whole snapshot design exists to keep.
 */
const run = Date.now();
const account = {
  agency: `Quoteworks ${run}`,
  email: `e2e-proposal-${run}@yardstick.test`,
  password: "a-sufficiently-long-password",
};

test("an agency prices a deal from its catalogue and sending freezes the numbers", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByLabel("Agency name").fill(account.agency);
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/businesses$/);

  // A price list first.
  await page.getByRole("link", { name: "Catalogue" }).click();
  await page.getByLabel("Name").fill("Local SEO retainer");
  await page.getByLabel("Billing").selectOption("monthly");
  await page.getByLabel("Price (CAD)").fill("1200");
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(page.getByText("Local SEO retainer")).toBeVisible();

  // Then a quote for somebody.
  await page.getByRole("link", { name: "Proposals", exact: true }).click();
  await page.getByRole("link", { name: "New proposal" }).first().click();
  await page.getByLabel("Title").fill("Local search, twelve months");
  await page.getByLabel("Term (months)").fill("12");
  await page.getByRole("button", { name: "Start the proposal" }).click();
  await expect(page).toHaveURL(/\/proposals\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Still a draft")).toBeVisible();

  // One line copied from the catalogue, one typed by hand.
  await page.getByLabel("From the catalogue").selectOption({ index: 0 });
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("cell", { name: "Local SEO retainer" })).toBeVisible();

  await page.getByLabel("What it is").fill("Setup");
  await page.getByLabel("Billing").selectOption("one_time");
  await page.getByLabel("Price (CAD)").fill("1500");
  await page.getByRole("button", { name: "Add line" }).click();
  await expect(page.getByRole("cell", { name: "Setup" })).toBeVisible();

  // Setup once, the retainer every month, and twelve months of it on the contract.
  await expect(page.getByText("Billed once")).toBeVisible();
  await expect(page.getByText("Billed every month")).toBeVisible();
  // Twelve retainers plus the setup, priced by the engine and shown as one number.
  await expect(page.getByText("Worth over the term")).toBeVisible();

  await page.getByRole("button", { name: "Send it" }).click();
  await expect(page.getByText("These totals were written when it was sent.")).toBeVisible();

  // Frozen: no way left to change a line, and the status says so.
  await expect(page.getByRole("button", { name: "Remove" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add line" })).toHaveCount(0);
  await expect(page.getByText("Sent", { exact: true })).toBeVisible();

  // And the list shows what it is worth, which only a sent proposal has.
  await page.getByRole("link", { name: "Proposals", exact: true }).click();
  await expect(page.getByRole("link", { name: "Local search, twelve months" })).toBeVisible();
  await expect(page.getByText("Not sent")).toHaveCount(0);
});
