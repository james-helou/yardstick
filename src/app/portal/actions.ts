"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { requireSessionFrom } from "@/lib/auth/guards";
import { acceptGrant, findGrantByToken } from "@/lib/db/repos/portal";
import type { FormState } from "@/lib/forms/state";

/**
 * The client's entry. A portal account is an account and nothing more: it never calls
 * `ensureWorkspaceForUser`, so signing in here cannot conjure an agency workspace, and a
 * client who wanders to /businesses simply has nothing there.
 *
 * The invitation is bound to whoever opens it while signed in. The address it was sent to
 * is what the account must be created with, so a forwarded link cannot be claimed by
 * somebody else's inbox.
 */

function readableError(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "body" in error) {
    const body = (error as { body?: { message?: string } }).body;
    if (body?.message) return body.message;
  }
  return fallback;
}

export async function joinPortalAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const mode = String(formData.get("mode") ?? "existing");

  const grant = await findGrantByToken(token);
  if (!grant || grant.revokedAt !== null) {
    return { errors: { form: "This invitation is no longer open" } };
  }
  if (password.length < 8) return { errors: { password: "Use at least 8 characters" } };

  const requestHeaders = await headers();
  let userId: string;
  try {
    // The session cookie is set on the response, so it cannot be read back from the
    // headers of the request that set it. The signed-in user comes from the call itself.
    const result =
      mode === "new"
        ? await auth().api.signUpEmail({
            body: { email: grant.email, password, name: grant.email },
            headers: requestHeaders,
          })
        : await auth().api.signInEmail({
            body: { email: grant.email, password },
            headers: requestHeaders,
          });
    userId = result.user.id;
  } catch (error) {
    return {
      errors: {
        form: readableError(
          error,
          mode === "new" ? "Could not create that account" : "That password does not match",
        ),
      },
    };
  }

  const bound = await acceptGrant(token, userId);
  if (!bound) return { errors: { form: "This invitation belongs to someone else" } };

  redirect(`/portal/${bound.businessId}`);
}

/** Already signed in: opening the link is the whole of accepting it. */
export async function acceptInvitationAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const user = await requireSessionFrom(await headers());

  const bound = await acceptGrant(token, user.id);
  redirect(bound ? `/portal/${bound.businessId}` : "/portal");
}

export async function signOutOfPortal(): Promise<void> {
  await auth().api.signOut({ headers: await headers() });
  redirect("/sign-in");
}
