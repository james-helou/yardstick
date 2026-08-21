import { expect, test } from "@playwright/test";

/**
 * What happens after somebody signs.
 *
 * The whole phase in one path: a deal is signed by a client with no login, and the work
 * the agency now owes appears by itself, on the client's own page and in the book of
 * business, without anybody typing it in.
 */
test("a signature generates the work the agency owes, and the book of business", async ({
  page,
  browser,
}) => {
  const run = Date.now();
  const agency = {
    agency: `Deliverworks ${run}`,
    email: `e2e-delivery-${run}@yardstick.test`,
    password: "a-sufficiently-long-password",
  };

  await page.goto("/sign-up");
  await page.getByLabel("Agency name").fill(agency.agency);
  await page.getByLabel("Email").fill(agency.email);
  await page.getByLabel("Password").fill(agency.password);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/businesses$/);

  // Nothing is owed to anybody yet.
  await page.getByRole("link", { name: "Clients", exact: true }).click();
  await expect(page.getByText("No signed proposals yet.")).toBeVisible();

  await page.getByRole("link", { name: "Businesses", exact: true }).click();
  await page.getByRole("link", { name: "Add a business" }).first().click();
  await page.getByLabel("Name").fill("Rivera Dental");
  await page.getByRole("button", { name: "Add business" }).click();
  await expect(page).toHaveURL(/\/businesses\/[0-9a-f-]{36}$/);

  // A deal for that client: one setup, one retainer.
  await page.getByRole("link", { name: "Proposals", exact: true }).click();
  await page.getByRole("link", { name: "New proposal" }).first().click();
  await page.getByLabel("Title").fill("Local search for Rivera");
  await page.getByLabel("Prospect").selectOption({ label: "Rivera Dental" });
  await page.getByLabel("Term (months)").fill("12");
  await page.getByRole("button", { name: "Start the proposal" }).click();
  await expect(page).toHaveURL(/\/proposals\/[0-9a-f-]{36}$/);

  await page.getByLabel("What it is").fill("Citation cleanup");
  await page.getByLabel("Billing").selectOption("one_time");
  await page.getByLabel("Price (CAD)").fill("1500");
  await page.getByRole("button", { name: "Add line" }).click();
  await expect(page.getByRole("cell", { name: "Citation cleanup" })).toBeVisible();

  await page.getByLabel("What it is").fill("Local SEO retainer");
  await page.getByLabel("Billing").selectOption("monthly");
  await page.getByLabel("Price (CAD)").fill("900");
  await page.getByRole("button", { name: "Add line" }).click();
  await expect(page.getByRole("cell", { name: "Local SEO retainer" })).toBeVisible();

  await page.getByRole("button", { name: "Send it" }).click();
  await page.getByRole("button", { name: "Create a signing link" }).click();
  const url = (await page.getByRole("code").innerText()).trim();

  // Signed by somebody with no session at all.
  const client = await browser.newContext();
  const clientPage = await client.newPage();
  await clientPage.goto(url);
  await clientPage.getByLabel("Your full name").fill("Ana Rivera");
  await clientPage.getByLabel("Email").fill("ana@rivera.example");
  await clientPage.getByRole("button", { name: "Accept and sign" }).click();
  await expect(clientPage.getByText("accepted these terms on")).toBeVisible();
  await client.close();

  // The checklist wrote itself: four onboarding steps, the setup, and the retainer.
  await page.getByRole("link", { name: "Businesses", exact: true }).click();
  await page.getByRole("link", { name: "Rivera Dental" }).click();
  // Scoped to the panel, because a business page is full of forms by this point.
  const delivery = page.getByRole("region", { name: "Delivery for Rivera Dental" });
  await expect(delivery.getByText("Get access to the Google Business Profile")).toBeVisible();
  await expect(delivery.getByText("Set up Citation cleanup")).toBeVisible();
  await expect(delivery.getByText("Local SEO retainer, every month")).toBeVisible();
  await expect(delivery.getByText("0 of 5 done")).toBeVisible();

  // Working an item moves the count, and the recurring line is not part of it.
  await delivery.getByRole("button", { name: "Start", exact: true }).first().click();
  await expect(delivery.getByText("0 of 5 done")).toBeVisible();
  await delivery.getByRole("button", { name: "Mark done" }).first().click();
  await expect(delivery.getByText("1 of 5 done")).toBeVisible();

  // Work the plan never knew about goes on the same list.
  await delivery.getByLabel("Add work").fill("Rewrite the services page");
  await delivery.getByRole("button", { name: "Add", exact: true }).click();
  await expect(delivery.getByText("Rewrite the services page")).toBeVisible();
  await expect(delivery.getByText("1 of 6 done")).toBeVisible();

  // And the book of business now has a client in it, worth what was signed.
  await page.getByRole("link", { name: "Clients", exact: true }).click();
  await expect(page.getByText("Monthly recurring")).toBeVisible();
  await expect(page.getByRole("link", { name: "Rivera Dental" })).toBeVisible();
  await expect(page.getByText("Get access to the website")).toBeVisible();

  // Ending it takes the revenue out of the run rate and puts a reason next to the loss.
  await page.getByRole("link", { name: "Rivera Dental" }).click();
  const panel = page.getByRole("region", { name: "Delivery for Rivera Dental" });
  await panel.getByLabel("End this engagement").fill("Sold the practice");
  await panel.getByRole("button", { name: "End", exact: true }).click();
  await expect(panel.getByText("Sold the practice")).toBeVisible();

  await page.getByRole("link", { name: "Clients", exact: true }).click();
  await expect(page.getByText("Nothing recurring")).toBeVisible();
  await expect(page.getByText("Sold the practice")).toBeVisible();
});
