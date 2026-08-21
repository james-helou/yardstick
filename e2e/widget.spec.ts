import { expect, test } from "@playwright/test";

/**
 * The lead path end to end: an agency creates a widget key, a stranger fills in the
 * embedded form on a page with no session, and the lead arrives in the workspace with a
 * scan and a report link already attached.
 */
const run = Date.now();
const account = {
  agency: `Widgetworks ${run}`,
  email: `e2e-widget-${run}@yardstick.test`,
  password: "a-sufficiently-long-password",
};

test("an agency embeds the audit form, a stranger becomes a lead, and switching it off closes the door", async ({ page, browser }) => {
  await page.goto("/sign-up");
  await page.getByLabel("Agency name").fill(account.agency);
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/businesses$/);

  await page.getByRole("link", { name: "Widget", exact: true }).click();
  await expect(page.getByText("No live widget yet.")).toBeVisible();

  await page.getByLabel("What is it for").fill("Homepage");
  await page.getByRole("button", { name: "Create a widget key" }).click();
  await expect(page.getByText(/Live since/)).toBeVisible();

  const snippet = await page.locator("pre").first().innerText();
  const key = snippet.match(/data-yardstick-key="(yk_[A-Za-z0-9_-]+)"/)?.[1];
  expect(key).toBeTruthy();

  // The loader script itself is served, and it carries this workspace's embed URL.
  const script = await page.request.get("/embed/widget.js");
  expect(script.headers()["content-type"]).toContain("javascript");
  expect(await script.text()).toContain("/embed/");

  // A stranger: separate context, no cookies, nothing shared with the agency's session.
  const visitor = await browser.newContext();
  const visitorPage = await visitor.newPage();
  await visitorPage.goto(`/embed/${key}`);

  await expect(visitorPage.getByRole("heading", { name: "Free local search audit" })).toBeVisible();
  await expect(visitorPage.getByText(`Prepared by ${account.agency}`)).toBeVisible();

  await visitorPage.getByLabel("Business name").fill("Rivera Plumbing");
  await visitorPage.getByLabel("Website").fill("rivera-widget.example");
  await visitorPage.getByLabel("City").fill("Montreal");
  await visitorPage.getByLabel("Email").fill("owner@rivera-widget.example");
  await visitorPage.getByRole("button", { name: "Run my free audit" }).click();

  // Straight to their own report, which is still filling in.
  await expect(visitorPage).toHaveURL(/\/r\/[A-Za-z0-9_-]{32,}$/);
  await expect(
    visitorPage.getByRole("heading", { name: /How Rivera Plumbing shows up in local search/ }),
  ).toBeVisible();

  // And the agency has the lead, scored or not.
  await page.getByRole("link", { name: "Leads" }).click();
  await expect(page.getByRole("link", { name: "Rivera Plumbing" })).toBeVisible();
  await expect(page.getByRole("link", { name: "owner@rivera-widget.example" })).toBeVisible();

  // And switching the key off closes the door behind it.
  await page.getByRole("link", { name: "Widget", exact: true }).click();
  await page.getByRole("button", { name: "Switch off" }).click();
  await expect(page.getByText("No live widget yet.")).toBeVisible();

  const afterOff = await visitorPage.goto(`/embed/${key}`);
  expect(afterOff?.status()).toBe(404);

  await visitor.close();
});
