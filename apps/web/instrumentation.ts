import type { Instrumentation } from "next";

/*
 * Server-side errors while rendering pages: logged by Next.js, and — when
 * ALERT_WEBHOOK_URL is set — posted to the team's chat (max one per minute).
 * Only the route and error digest are sent, never request data.
 */
let lastSent = 0;
let suppressed = 0;

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url?.startsWith("https://")) return;
  const now = Date.now();
  if (now - lastSent < 60_000) {
    suppressed++;
    return;
  }
  lastSent = now;
  const digest = (err as { digest?: string }).digest;
  const text = `⚠️ MAREA storefront: ${request.method} ${context.routePath} failed while ${context.routerKind === "App Router" ? context.routeType : "rendering"}${digest ? ` (digest ${digest})` : ""}${suppressed ? ` (+${suppressed} more since the last alert)` : ""}`;
  suppressed = 0;
  try {
    await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, content: text }), signal: AbortSignal.timeout(5000) });
  } catch {
    // Alerts must never break a page.
  }
};
