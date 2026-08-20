/**
 * The absolute origin this request arrived on, taken from the request itself rather than
 * a build-time variable. A share link and an email link have to point at whatever host
 * the agency reached, and behind Railway's proxy that host only exists in the headers.
 */
export function originFrom(headers: Headers): string {
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return "";

  const forwarded = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  return `${forwarded || (local ? "http" : "https")}://${host}`;
}

/** An absolute URL for a path, or the path itself when there is no host to build on. */
export function absoluteUrl(headers: Headers, path: string): string {
  const origin = originFrom(headers);
  return origin ? `${origin}${path}` : path;
}
