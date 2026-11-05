// Sends the app's own crashes to /api/client-errors, where they become `client_error` lines in the Cloudflare logs.
// No third-party service, nothing personal: a short message, a trimmed stack and the first part of the page path.

const MAX_PER_PAGE_LOAD = 5;
const IGNORED = /^(?:script error\.?|resizeobserver loop)/i;

export function installErrorReporting(version = "") {
  let sent = 0;
  const seen = new Set<string>();
  const screen = () => location.pathname.split("/")[1] ?? "";

  function report(kind: "error" | "unhandledrejection", message: string, stack?: string) {
    if (!message || IGNORED.test(message) || sent >= MAX_PER_PAGE_LOAD || seen.has(message)) return;
    seen.add(message);
    sent++;
    try {
      void fetch("/api/client-errors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, message, stack, screen: screen(), version }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      // reporting must never throw
    }
  }

  window.addEventListener("error", (e) => report("error", e.message || String(e.error ?? ""), e.error instanceof Error ? e.error.stack : undefined));
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    report("unhandledrejection", r instanceof Error ? r.message : String(r ?? ""), r instanceof Error ? r.stack : undefined);
  });
}
