/**
 * E2E 저니 검증 리포트 생성기.
 *
 * playwright JSON 결과(tests/e2e/reports/results.json)를 읽어
 * tests/e2e/reports/summary.md 로 정리한다 — 저니별 pass/fail/flaky,
 * 실패 사유, 수집된 에러(console/pageerror/4xx/requestfailed) 집계.
 *
 * 사용: pnpm test:e2e  (먼저 실행) → pnpm test:e2e:report
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const RESULTS = join(process.cwd(), "tests/e2e/reports/results.json")
const SUMMARY = join(process.cwd(), "tests/e2e/reports/summary.md")

interface Annotation {
  type: string
  description?: string
}
interface TestResult {
  status: string
  errors?: { message?: string }[]
}
interface Test {
  status: string
  results: TestResult[]
  annotations?: Annotation[]
}
interface Spec {
  title: string
  ok: boolean
  tests: Test[]
}
interface Suite {
  title?: string
  suites?: Suite[]
  specs?: Spec[]
}
interface Report {
  stats: { expected: number; unexpected: number; flaky: number; skipped: number; duration: number }
  suites: Suite[]
}

const stripAnsi = (s: string) => s.replace(/\[[0-9;]*m/g, "")

function collectSpecs(suites: Suite[], acc: Spec[] = []): Spec[] {
  for (const s of suites) {
    if (s.specs) acc.push(...s.specs)
    if (s.suites) collectSpecs(s.suites, acc)
  }
  return acc
}

function main() {
  if (!existsSync(RESULTS)) {
    console.error(`results.json 없음 (${RESULTS}). 먼저 'pnpm test:e2e' 를 실행하세요.`)
    process.exit(1)
  }
  const report: Report = JSON.parse(readFileSync(RESULTS, "utf8"))
  const specs = collectSpecs(report.suites ?? [])

  const passed: string[] = []
  const failed: { title: string; reason: string }[] = []
  const flaky: string[] = []
  const errorCounts: Record<string, number> = {}
  const errorSamples: Record<string, Set<string>> = {}

  for (const spec of specs) {
    const test = spec.tests[0]
    if (!test) continue
    if (test.status === "expected") passed.push(spec.title)
    else if (test.status === "flaky") flaky.push(spec.title)
    else if (test.status === "unexpected") {
      const last = test.results[test.results.length - 1]
      const raw = last?.errors?.[0]?.message ?? ""
      const reason = stripAnsi(raw).split("\n")[0].slice(0, 160) || "기능 단언 실패"
      failed.push({ title: spec.title, reason })
    }
    for (const ann of test.annotations ?? []) {
      if (!ann.type.startsWith("err-")) continue
      errorCounts[ann.type] = (errorCounts[ann.type] ?? 0) + 1
      ;(errorSamples[ann.type] ??= new Set()).add(ann.description ?? "")
    }
  }

  const s = report.stats
  const lines: string[] = [
    "# E2E 저니 검증 리포트",
    "",
    `생성: ${new Date().toISOString()}`,
    "",
    "## 요약",
    "",
    `- ✅ 통과: ${s.expected}`,
    `- ❌ 실패: ${s.unexpected}`,
    `- ⚠️ flaky: ${s.flaky}`,
    `- ⏭️ skip: ${s.skipped}`,
    `- 소요: ${(s.duration / 1000).toFixed(1)}s`,
    "",
  ]

  if (failed.length > 0) {
    lines.push(`## ❌ 실패 저니 (${failed.length})`, "")
    for (const f of failed) lines.push(`- **${f.title}** — ${f.reason}`)
    lines.push("")
  }
  if (flaky.length > 0) {
    lines.push(`## ⚠️ Flaky 저니 (${flaky.length})`, "")
    for (const t of flaky) lines.push(`- ${t}`)
    lines.push("")
  }

  const errKinds = Object.keys(errorCounts).sort()
  if (errKinds.length > 0) {
    lines.push("## 수집된 에러 (저니 통과 여부와 별개 — 품질 신호)", "")
    for (const kind of errKinds) {
      lines.push(`### ${kind} (${errorCounts[kind]}건)`, "")
      for (const sample of [...(errorSamples[kind] ?? [])].slice(0, 10)) {
        lines.push(`- ${stripAnsi(sample).slice(0, 200)}`)
      }
      lines.push("")
    }
  }

  lines.push(`## ✅ 통과 저니 (${passed.length})`, "")
  for (const t of passed) lines.push(`- ${t}`)
  lines.push("")

  writeFileSync(SUMMARY, lines.join("\n"))
  console.log(`리포트 생성: ${SUMMARY}`)
  console.log(`통과 ${s.expected} / 실패 ${s.unexpected} / flaky ${s.flaky}`)
}

main()
