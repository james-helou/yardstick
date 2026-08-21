import { expect, test } from "@playwright/test";

/**
 * The client's side of the relationship: invited by email, opens a link, sets a password,
 * and sees their own results. What matters is the boundary. A client is signed in and
 * holds a grant; they are not in the agency's workspace and there is no path from the
 * portal into it.
 */
const run = Date.now();
const agency = {
  agency: `Portalworks ${run}`,
  email: `e2e-portal-${run}@yardstick.test`,
  password: "a-sufficiently-long-password",
};
const client = {
  email: `owner-${run}@rivera.example`,
  password: "another-long-enough-password",
};

test("an agency invites a client, who signs in and sees only their own results", async ({
  page,
  browser,
}) => {
  await page.goto("/sign-up");
  await page.getByLabel("Agency name").fill(agency.agency);
  await page.getByLabel("Email").fill(agency.email);
  await page.getByLabel("Password").fill(agency.password);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/businesses$/);

  await page.getByRole("link", { name: "Add a business" }).first().click();
  await page.getByLabel("Name").fill(`Rivera Plumbing ${run}`);
  await page.getByLabel("Website").fill(`rivera-portal-${run}.example`);
  await page.getByRole("button", { name: "Add business" }).click();
  await expect(page).toHaveURL(/\/businesses\/[0-9a-f-]{36}$/);
  const businessUrl = page.url();

  // A second client of the same agency, to prove a grant opens one business and not a
  // workspace.
  await page.getByRole("link", { name: "Businesses", exact: true }).click();
  await page.getByRole("link", { name: "Add a business" }).first().click();
  await page.getByLabel("Name").fill(`Delacroix Dental ${run}`);
  await page.getByLabel("Website").fill(`delacroix-${run}.example`);
  await page.getByRole("button", { name: "Add business" }).click();
  await expect(page).toHaveURL(/\/businesses\/[0-9a-f-]{36}$/);
  const otherUrl = page.url();

  await page.goto(businessUrl);
  await page.getByLabel("Invite by email").fill(client.email);
  await page.getByRole("button", { name: "Invite" }).click();
  await expect(page.getByText("Invited, not opened yet")).toBeVisible();

  const joinUrl = (await page.getByRole("code").first().innerText()).trim();
  expect(joinUrl).toMatch(/\/portal\/join\/[A-Za-z0-9_-]{32,}$/);

  // A separate context: the client has no session with the agency's account.
  const clientContext = await browser.newContext();
  const clientPage = await clientContext.newPage();
  await clientPage.goto(joinUrl);

  await expect(clientPage.getByText(`Sent to ${client.email}`)).toBeVisible();
  await clientPage.getByLabel("Password").fill(client.password);
  await clientPage.getByRole("button", { name: "Set a password and open" }).click();

  await expect(clientPage).toHaveURL(/\/portal\/[0-9a-f-]{36}$/);
  await expect(clientPage.getByRole("heading", { name: `Rivera Plumbing ${run}` })).toBeVisible();
  await expect(clientPage.getByText("Not measured yet")).toBeVisible();
  await expect(clientPage.getByText(`Shared with ${client.email}`)).toBeVisible();

  // The agency's own screens are not reachable from here.
  await expect(clientPage.getByRole("link", { name: "Proposals", exact: true })).toHaveCount(0);
  const otherId = otherUrl.split("/").pop();
  expect(await (await clientPage.goto(`/portal/${otherId}`))?.status()).toBe(404);
  // And an id that is not an id is the same 404, not a stack trace.
  expect(await (await clientPage.goto("/portal/not-an-id"))?.status()).toBe(404);

  // Revoking closes the door on a client who has already opened it.
  await page.reload();
  await expect(page.getByText(/Opened \d{4}-\d{2}-\d{2}/)).toBeVisible();
  await page.getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByText("Revoked")).toBeVisible();

  expect(await (await clientPage.goto(joinUrl))?.status()).toBe(404);
  await clientContext.close();
});
