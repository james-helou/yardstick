import { expect, test, type Page } from "@playwright/test";
import { closeDb, db } from "../src/lib/db/client";
import { finalizeScan, recordPillarResult } from "../src/lib/db/repos/scans";
import { PILLARS } from "../src/lib/scans/pillars";

/**
 * The path a prospect actually walks: a rep shares a finished report, someone with no
 * login opens the link, and revoking it shuts the door.
 *
 * The worker is not running in this suite, so the scan is finished here the way the
 * worker would finish it, through the same repository functions.
 */
const run = Date.now();
const account = {
  agency: `Sharehouse ${run}`,
  email: `e2e-share-${run}@yardstick.test`,
  password: "a-sufficiently-long-password",
};

async function finishNewestScan(): Promise<void> {
  const [row] = await db()<{ id: string; org_id: string }[]>`
    select id, org_id from scans order by created_at desc limit 1
  `;
  const scope = { orgId: row.org_id };

  for (const pillar of PILLARS) {
    await recordPillarResult(scope, {
      scanId: row.id,
      outcome: {
        pillar,
        status: "ok",
        score: 72,
        findings: [{ code: `${pillar}_check`, label: `${pillar} looks reasonable`, ok: true, weight: 1 }],
      },
    });
  }
  await finalizeScan(scope, row.id);
}

async function signUpAndScan(page: Page): Promise<void> {
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

  await page.getByRole("button", { name: "Run a scan" }).click();
  await expect(page).toHaveURL(/\/scans\/[0-9a-f-]{36}$/);
}

test.afterAll(async () => {
  await closeDb();
});

test("a rep shares a finished report, a stranger opens it, revoking closes it", async ({ page, browser }) => {
  await signUpAndScan(page);
  await finishNewestScan();

  // The share control only exists once there is something worth sharing.
  await page.reload();
  await expect(page.getByText("out of 100")).toBeVisible();
  await page.getByRole("button", { name: "Create a share link" }).click();

  const url = await page.getByRole("code").first().innerText();
  expect(url).toMatch(/\/r\/[A-Za-z0-9_-]{32,}$/);

  // A completely separate browser context: no cookies, no session, nothing shared.
  const stranger = await browser.newContext();
  const strangerPage = await stranger.newPage();
  await strangerPage.goto(url);

  await expect(
    strangerPage.getByRole("heading", { name: /How Rivera Plumbing shows up in local search/ }),
  ).toBeVisible();
  await expect(strangerPage.getByText("out of 100")).toBeVisible();
  await expect(strangerPage.getByText(`Prepared by ${account.agency}`)).toBeVisible();
  // No workspace navigation leaks onto a public page.
  await expect(strangerPage.getByRole("link", { name: "Businesses" })).toHaveCount(0);

  // The rep sees that it was opened.
  await page.reload();
  await expect(page.getByText(/Opened 1 time/)).toBeVisible();

  await page.getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByRole("button", { name: "Create a share link" })).toBeVisible();

  const afterRevoke = await strangerPage.goto(url);
  expect(afterRevoke?.status()).toBe(404);

  await stranger.close();
});
