import { beforeEach, describe, expect, it } from "vitest";
import { ensureWorkspaceForUser } from "@/lib/orgs/bootstrap";
import { resetTables } from "@/test/db";
import { auth } from "./server";
import { UnauthorizedError } from "./guards";
import { NoWorkspaceError, resolveWorkspace } from "./workspace";

const credentials = {
  email: "rep@agency.test",
  password: "a-sufficiently-long-password",
  name: "Rep",
};

/** Signs up for real and returns headers carrying the session cookie, as a browser would. */
async function signedInHeaders(): Promise<{ headers: Headers; userId: string }> {
  const response = await auth().api.signUpEmail({ body: credentials, asResponse: true });
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) throw new Error("sign-up returned no session cookie");
  const headers = new Headers({ cookie: setCookie.split(";")[0] });
  const session = await auth().api.getSession({ headers });
  if (!session?.user) throw new Error("session cookie did not resolve");
  return { headers, userId: session.user.id };
}

beforeEach(() => resetTables());

describe("resolveWorkspace", () => {
  it("rejects a request with no session", async () => {
    await expect(resolveWorkspace(new Headers())).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("says so plainly when the user has no workspace yet", async () => {
    const { headers } = await signedInHeaders();
    await expect(resolveWorkspace(headers)).rejects.toBeInstanceOf(NoWorkspaceError);
  });

  it("returns the user, their workspace and a usable scope", async () => {
    const { headers, userId } = await signedInHeaders();
    const org = await ensureWorkspaceForUser(userId, "Bright Media");

    const resolved = await resolveWorkspace(headers);
    expect(resolved.user.email).toBe(credentials.email);
    expect(resolved.org.id).toBe(org.id);
    expect(resolved.scope).toEqual({ orgId: org.id });
    expect(resolved.membership.role).toBe("owner");
  });
});
