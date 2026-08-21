import { expect, test } from "@playwright/test";

/**
 * Recurring measurement, from the agency's side: turn it on, pause it, stop it. The sweep
 * that acts on the schedule is the worker's, and it is covered by its own tests; what
 * matters here is that the screen and the stored schedule agree.
 */
const run = Date.now();
const account = {
  agency: `Trackworks ${run}`,
  email: `e2e-tracking-${run}@yardstick.test`,
  password: "a-sufficiently-long-password",
};

test("an agency puts a client on a schedule, pauses it, and stops it", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByLabel("Agency name").fill(account.agency);
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/businesses$/);

  await page.getByRole("link", { name: "Add a business" }).first().click();
  await page.getByLabel("Name").fill(`Rivera Plumbing ${run}`);
  await page.getByLabel("Website").fill(`rivera-${run}.example`);
  await page.getByRole("button", { name: "Add business" }).click();
  await expect(page).toHaveURL(/\/businesses\/[0-9a-f-]{36}$/);

  // Nothing measured yet, and nothing scheduled.
  await expect(page.getByText("Nothing measured yet.")).toBeVisible();
  await expect(page.getByText("Not measured on a schedule.")).toBeVisible();

  await page.getByLabel("How often").selectOption("weekly");
  await page.getByRole("button", { name: "Start tracking" }).click();
  await expect(page.getByText(/Every week\. Next on \d{4}-\d{2}-\d{2}\./)).toBeVisible();

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByText("Every week, paused.")).toBeVisible();

  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByText(/Every week\. Next on/)).toBeVisible();

  // Changing the cadence re-dates from now rather than keeping the old booking.
  await page.getByLabel("How often").selectOption("monthly");
  await page.getByRole("button", { name: "Change cadence" }).click();
  await expect(page.getByText(/Every month\. Next on/)).toBeVisible();

  await page.getByRole("button", { name: "Stop tracking" }).click();
  await expect(page.getByText("Not measured on a schedule.")).toBeVisible();
});
