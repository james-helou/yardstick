import { headers } from "next/headers";
import { resolveWorkspace } from "@/lib/auth/workspace";
import { listWidgetKeys } from "@/lib/db/repos/widgets";
import { emailConfigured } from "@/lib/email";
import { absoluteUrl } from "@/lib/http/origin";
import { WidgetKeys } from "./WidgetKeys";

export const dynamic = "force-dynamic";
export const metadata = { title: "Website widget" };

export default async function WidgetPage() {
  const requestHeaders = await headers();
  const { scope } = await resolveWorkspace(requestHeaders);
  const keys = await listWidgetKeys(scope);

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Website widget</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Drop this on your own site and every visitor who asks for an audit arrives here already
          scored, with their report waiting.
        </p>
      </div>

      {emailConfigured() ? null : (
        <p className="rounded-md border border-band-fair-line bg-band-fair-soft px-3 py-2 text-band-fair">
          Email is not switched on yet, so a visitor sees their report on screen but does not receive
          it, and you are not notified. Set <code>RESEND_API_KEY</code> and <code>EMAIL_FROM</code> to
          turn it on. Leads are still captured either way.
        </p>
      )}

      <WidgetKeys
        keys={keys.map((key) => ({
          id: key.id,
          publicKey: key.publicKey,
          label: key.label,
          active: key.active,
          createdAt: key.createdAt.toISOString().slice(0, 10),
        }))}
        scriptUrl={absoluteUrl(requestHeaders, "/embed/widget.js")}
        apiUrl={absoluteUrl(requestHeaders, "/api/public/audit")}
      />
    </section>
  );
}
