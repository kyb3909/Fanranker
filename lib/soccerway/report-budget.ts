import { createHash } from "node:crypto"

export const REPORT_COMPOSE_BUDGET = 6
export const REPORT_RECHECK_DAYS = 7

// Only explicit boilerplate is discarded. Never strip years/numbers from match evidence.
export function normalizeReportArticle(paragraphs: string[]): string[] {
  return paragraphs
    .map((p) => p.normalize("NFC").replace(/\s+/g, " ").trim())
    .map((p) => p.replace(/\s*(?:©\s*\d{4}|Copyright\s*(?:©\s*)?\d{4}).*$/i, "").trim())
    .filter(
      (p) =>
        p &&
        !/^(?:advertisement|advertising|광고|all rights reserved\.?|(?:collected|retrieved|scraped) (?:at|on)\s*:?.*|수집\s*(?:시각|시간)\s*:.*)$/i.test(
          p
        )
    )
}

export function reportInputVersion(input: {
  paragraphs: string[]
  score: string
  promptVersion: string
  verifyRuleVersion: string
  names: string[]
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        normalizeReportArticle(input.paragraphs),
        input.score,
        input.promptVersion,
        input.verifyRuleVersion,
        [...new Set(input.names)].sort(),
      ])
    )
    .digest("hex")
}

const REQUIRED_EVENTS = new Set([
  "goal",
  "own_goal",
  "penalty",
  "assist",
  "sub",
  "substitution",
  "yellow_card",
  "red_card",
  "second_yellow",
  "card",
])

export function reportEventNames(
  events: { type: string; players: string[] }[],
  resolve: (name: string) => string | null
) {
  const required = [
    ...new Set(events.filter((e) => REQUIRED_EVENTS.has(e.type)).flatMap((e) => e.players)),
  ].sort()
  return {
    missing: required.filter((name) => !resolve(name)),
    representations: required.map((name) => resolve(name) ?? name),
    allowed: [
      ...new Set(
        events
          .flatMap((e) => e.players)
          .map(resolve)
          .filter((n): n is string => !!n)
      ),
    ].sort(),
  }
}
