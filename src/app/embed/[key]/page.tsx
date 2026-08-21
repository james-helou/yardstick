import { notFound } from "next/navigation";
import { findActiveWidgetKey } from "@/lib/db/repos/widgets";
import { findOrgById } from "@/lib/db/repos/orgs";
import { turnstileSiteKey } from "@/lib/security/turnstile";
import { AuditForm } from "./AuditForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Free local search audit", robots: { index: false } };

export default async function EmbedPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;

  const widget = await findActiveWidgetKey(key);
  // A switched-off key renders nothing at all, so an agency that turns one off is not
  // still collecting leads into a workspace they meant to stop using.
  if (!widget) notFound();

  const agency = await findOrgById(widget.orgId);

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <h1 className="text-lg font-semibold">Free local search audit</h1>
      <p className="mt-1 text-sm text-neutral-600">
        See how this business shows up on Google and in AI answers.
        {agency ? ` Prepared by ${agency.name}.` : ""}
      </p>

      <AuditForm publicKey={widget.publicKey} siteKey={turnstileSiteKey()} />
    </main>
  );
}
