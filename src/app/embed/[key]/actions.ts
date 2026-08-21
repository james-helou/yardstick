"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientIp, hashIp } from "@/lib/http/client-ip";
import { submitAuditRequest } from "@/lib/leads/submit";
import type { FormState } from "@/lib/forms/state";

/**
 * The embedded form's own entry point. It runs on a public page with no session, so
 * everything it is allowed to do comes from the widget key in the form itself.
 */
export async function requestAuditAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const requestHeaders = await headers();
  const ip = clientIp(requestHeaders);

  const result = await submitAuditRequest({
    publicKey: String(formData.get("key") ?? ""),
    fields: {
      businessName: formData.get("businessName"),
      email: formData.get("email"),
      website: formData.get("website"),
      contactName: formData.get("contactName"),
      phone: formData.get("phone"),
      locality: formData.get("locality"),
      primaryCategory: formData.get("primaryCategory"),
    },
    botToken: formData.get("cf-turnstile-response")?.toString() ?? null,
    ip,
    ipHash: hashIp(ip),
  });

  if (!result.ok) return { errors: result.errors };

  // Straight to their own report. It is still running, and the page says so while it
  // fills in, which is a better first impression than a thank-you page that ends.
  redirect(`/r/${result.token}`);
}
