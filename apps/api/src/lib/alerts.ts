import type { Logger } from "pino";

/**
 * Posts a short message to a chat webhook (Slack- and Discord-compatible) when
 * something breaks on the server. At most one message per minute; errors in
 * between are counted and reported with the next message. Never throws.
 */
export function createAlerter(url: string | undefined, log: Logger, source: string) {
  let lastSent = 0;
  let suppressed = 0;
  return (summary: string) => {
    if (!url) return;
    const now = Date.now();
    if (now - lastSent < 60_000) {
      suppressed++;
      return;
    }
    const text = `⚠️ MAREA ${source}: ${summary}${suppressed ? ` (+${suppressed} more since the last alert)` : ""}`.slice(0, 1800);
    lastSent = now;
    suppressed = 0;
    fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, content: text }), signal: AbortSignal.timeout(5000) })
      .then((r) => { if (!r.ok) log.warn({ status: r.status }, "Alert webhook rejected the message"); })
      .catch((err) => log.warn({ err }, "Alert webhook unreachable"));
  };
}
