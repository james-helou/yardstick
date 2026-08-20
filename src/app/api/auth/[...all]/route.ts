import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth/server";

/** Auth touches the database on every request, so it can never be prerendered. */
export const dynamic = "force-dynamic";

// auth() is resolved per request, not at module scope, so `next build` never
// constructs a database pool just by collecting routes.
export async function GET(request: Request) {
  return toNextJsHandler(auth()).GET(request);
}

export async function POST(request: Request) {
  return toNextJsHandler(auth()).POST(request);
}
