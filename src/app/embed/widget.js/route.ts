import { absoluteUrl } from "@/lib/http/origin";

/**
 * The loader an agency pastes into their own site:
 *
 *   <script src="https://…/embed/widget.js" data-yardstick-key="yk_…" async></script>
 *
 * It creates one iframe and nothing else. No styles leak either way, the form runs on
 * our origin so it needs no cross-origin permissions, and the only message crossing the
 * boundary is a height in pixels.
 */
export const dynamic = "force-dynamic";

const SCRIPT = (origin: string) => `(function () {
  var script = document.currentScript;
  if (!script) return;

  var key = script.getAttribute("data-yardstick-key");
  if (!key) {
    console.error("[yardstick] the widget script needs a data-yardstick-key attribute");
    return;
  }

  var frame = document.createElement("iframe");
  frame.src = ${JSON.stringify(origin)} + "/embed/" + encodeURIComponent(key);
  frame.title = "Free local search audit";
  frame.loading = "lazy";
  frame.style.width = "100%";
  frame.style.border = "0";
  frame.style.height = "560px";
  frame.style.colorScheme = "normal";

  script.parentNode.insertBefore(frame, script.nextSibling);

  window.addEventListener("message", function (event) {
    if (event.source !== frame.contentWindow) return;
    var data = event.data;
    if (!data || data.type !== "yardstick:height") return;
    var height = Number(data.height);
    // Bounded on purpose: a bad number must not stretch somebody's page to the moon.
    if (height > 100 && height < 4000) frame.style.height = height + "px";
  });
})();
`;

export async function GET(request: Request): Promise<Response> {
  const origin = absoluteUrl(request.headers, "");

  return new Response(SCRIPT(origin), {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      // Short, so an agency who regenerates a key is not serving a stale loader for a
      // day, but long enough that a busy page is not refetching it every visit.
      "cache-control": "public, max-age=300",
      "access-control-allow-origin": "*",
    },
  });
}
