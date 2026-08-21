import { headers } from "next/headers";
import { resolveWorkspace } from "@/lib/auth/workspace";
import { listWidgetKeys } from "@/lib/db/repos/widgets";
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
        <p className="mt-1 text-sm text-neutral-600">
          Drop this on your own site and every visitor who asks for an audit arrives here already
          scored, with their report waiting.
        </p>
      </div>

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
