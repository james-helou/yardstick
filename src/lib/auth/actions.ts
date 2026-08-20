"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ensureWorkspaceForUser } from "@/lib/orgs/bootstrap";
import type { FormState } from "@/lib/forms/state";
import { auth } from "./server";


const credentials = z.object({
  email: z.string().trim().min(1, "Enter your email").pipe(z.email("That does not look like an email")),
  password: z.string().min(8, "Use at least 8 characters"),
});

function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) errors[issue.path.join(".") || "form"] ??= issue.message;
  return errors;
}

/**
 * better-auth throws an APIError carrying a readable message. Anything else is ours and
 * should not be shown verbatim to a stranger at the sign-in screen.
 */
function readableError(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "body" in error) {
    const body = (error as { body?: { message?: string } }).body;
    if (body?.message) return body.message;
  }
  return fallback;
}

export async function signUp(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const agency = String(formData.get("agency") ?? "").trim();

  try {
    const result = await auth().api.signUpEmail({
      body: { email: parsed.data.email, password: parsed.data.password, name: agency || parsed.data.email },
      headers: await headers(),
    });
    // Idempotent, so a double submit cannot leave one person owning two workspaces.
    await ensureWorkspaceForUser(result.user.id, agency);
  } catch (error) {
    return { errors: { form: readableError(error, "Could not create that account") } };
  }

  redirect("/businesses");
}

export async function signIn(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  try {
    await auth().api.signInEmail({
      body: { email: parsed.data.email, password: parsed.data.password },
      headers: await headers(),
    });
  } catch (error) {
    return { errors: { form: readableError(error, "That email and password do not match") } };
  }

  redirect("/businesses");
}

export async function signOut(): Promise<void> {
  await auth().api.signOut({ headers: await headers() });
  redirect("/sign-in");
}

export async function nameWorkspace(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { requireSessionFrom } = await import("./guards");
  const user = await requireSessionFrom(await headers());
  const name = String(formData.get("agency") ?? "").trim();
  if (!name) return { errors: { agency: "Give your workspace a name" } };

  await ensureWorkspaceForUser(user.id, name);
  redirect("/businesses");
}
