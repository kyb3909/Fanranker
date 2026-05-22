/**
 * Per-page error collector for E2E journeys.
 *
 * Attaches to a Playwright page and accumulates four error classes:
 *   - console errors        (console.error in the page)
 *   - page errors           (uncaught exceptions)
 *   - HTTP responses >= 400 (failed API / asset requests)
 *   - failed requests       (network errors)
 *
 * Known third-party noise (ad networks, analytics, Clerk/Cloudflare telemetry)
 * and benign canceled requests are filtered so the report only surfaces issues
 * attributable to the app itself.
 */
import type { ConsoleMessage, Page, Request, Response } from "@playwright/test"

export type ErrorKind = "console" | "pageerror" | "response" | "requestfailed"

export interface CollectedError {
  kind: ErrorKind
  detail: string
  url: string
  at: string
}

export interface ErrorCollector {
  errors: CollectedError[]
  /** Detach all listeners. Call in afterEach. */
  dispose: () => void
}

// Third-party hosts whose failures are not app bugs.
const IGNORED_HOSTS = [
  "googlesyndication.com",
  "doubleclick.net",
  "google-analytics.com",
  "googletagmanager.com",
  "adservice.google.com",
  "challenges.cloudflare.com",
  "clerk-telemetry.com",
  "sentry.io",
  "ingest.sentry.io",
]

const isIgnoredUrl = (url: string) => IGNORED_HOSTS.some((h) => url.includes(h))

export function collectErrors(page: Page): ErrorCollector {
  const errors: CollectedError[] = []
  const push = (kind: ErrorKind, detail: string, url: string) =>
    errors.push({ kind, detail, url, at: new Date().toISOString() })

  const onConsole = (msg: ConsoleMessage) => {
    if (msg.type() === "error") push("console", msg.text(), page.url())
  }
  const onPageError = (err: Error) => push("pageerror", err.message, page.url())
  const onResponse = (res: Response) => {
    if (res.status() >= 400 && !isIgnoredUrl(res.url())) {
      push("response", `${res.status()} ${res.request().method()}`, res.url())
    }
  }
  const onRequestFailed = (req: Request) => {
    const reason = req.failure()?.errorText ?? "failed"
    // ERR_ABORTED is almost always a canceled navigation/prefetch — benign.
    if (reason.includes("ERR_ABORTED") || isIgnoredUrl(req.url())) return
    push("requestfailed", reason, req.url())
  }

  page.on("console", onConsole)
  page.on("pageerror", onPageError)
  page.on("response", onResponse)
  page.on("requestfailed", onRequestFailed)

  return {
    errors,
    dispose: () => {
      page.off("console", onConsole)
      page.off("pageerror", onPageError)
      page.off("response", onResponse)
      page.off("requestfailed", onRequestFailed)
    },
  }
}
