import { clientIp, hashIp } from "@/lib/http/client-ip";
import { submitAuditRequest } from "@/lib/leads/submit";
import { absoluteUrl, originFrom } from "@/lib/http/origin";

/**
 * The JSON door onto the same audit path the embedded form uses, for an agency who
 * would rather build their own form than take our iframe. Both go through
 * `submitAuditRequest`, so they cannot drift into enforcing different rules.
 */
export const dynamic = "force-dynamic";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, errors: { form: "Send a JSON body" } }, { status: 400, headers: CORS });
  }

  const ip = clientIp(request.headers);
  const result = await submitAuditRequest({
    publicKey: String(body.key ?? ""),
    fields: body,
    botToken: typeof body.botToken === "string" ? body.botToken : null,
    ip,
    ipHash: hashIp(ip),
    origin: originFrom(request.headers),
  });

  if (!result.ok) {
    return Response.json({ ok: false, errors: result.errors }, { status: result.status, headers: CORS });
  }

  return Response.json(
    { ok: true, reportUrl: absoluteUrl(request.headers, `/r/${result.token}`) },
    { status: 201, headers: CORS },
  );
}
