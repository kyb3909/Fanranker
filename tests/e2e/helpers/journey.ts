/**
 * Shared journey-spec helpers.
 *
 * `finishJourney` collects all page errors (console / pageerror / HTTP 4xx /
 * failed requests), attaches them to the report, and records them as test
 * annotations. It does NOT fail the test — a journey's pass/fail is decided
 * purely by its functional assertions (UI worked, DB correct). Errors are a
 * separate quality signal aggregated by the report generator (task 8), so a
 * page-level hydration warning doesn't turn every journey red.
 */
import type { TestInfo } from "@playwright/test"
import type { ErrorCollector } from "./error-collector"

/**
 * Number of times each journey repeats. Default 10 (10 bots × 10 = ~100 samples
 * per journey with real concurrency — surfaces race conditions and cumulative
 * state bugs). Set E2E_REPEAT=1 for a quick smoke during development.
 */
export const REPEAT = Number(process.env.E2E_REPEAT ?? "10")

export async function finishJourney(collector: ErrorCollector, testInfo: TestInfo): Promise<void> {
  collector.dispose()
  if (collector.errors.length === 0) return

  await testInfo.attach("journey-errors.json", {
    body: JSON.stringify(collector.errors, null, 2),
    contentType: "application/json",
  })

  // 에러는 어노테이션으로 남겨 리포트가 집계한다 (테스트는 실패시키지 않음).
  for (const e of collector.errors) {
    testInfo.annotations.push({
      type: `err-${e.kind}`,
      description: `${e.detail} @ ${e.url}`,
    })
  }
}
