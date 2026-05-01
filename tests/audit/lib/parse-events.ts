/**
 * audit-events.jsonl → 구조화된 issues + 카테고리별 집계.
 * 사이클 비교(compare-runs) + health.json 누적의 입력원.
 */
import * as fs from "node:fs"
import * as path from "node:path"

export type Severity = "critical" | "major" | "minor" | "info"

export interface Issue {
  id: string // 안정적인 dedupe key (재실행해도 같은 이슈는 같은 id)
  severity: Severity
  category: string
  title: string
  detail?: string
  pages?: string[] // 발생한 페이지들
  samples?: unknown // 추가 데이터 (예: 작은 터치 타겟의 selector list)
  count: number
}

export interface ParsedRun {
  runDir: string
  meta: { startedAt: string; finishedAt?: string; baseUrl: string }
  pagesVisited: number
  issues: Issue[]
  counts: {
    critical: number
    major: number
    minor: number
    info: number
    total: number
  }
}

const RESPONSE_4XX_BENIGN = [/clerk\..*\/v1\//, /\/api\/.*\/check\b/, /\/api\/auth\/me\b/]
const REQ_FAIL_BENIGN = [
  /google-analytics\.com/,
  /googleads\.g\.doubleclick\.net/,
  /adtrafficquality\.google/,
  /\.facebook\.com/,
]

function parseJsonlSafe(file: string): Array<Record<string, unknown>> {
  if (!fs.existsSync(file)) return []
  const lines = fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean)
  const out: Array<Record<string, unknown>> = []
  for (const l of lines) {
    try {
      out.push(JSON.parse(l))
    } catch {
      /* ignore malformed line */
    }
  }
  return out
}

export function parseRun(runDir: string): ParsedRun {
  const eventsPath = path.join(runDir, "audit-events.jsonl")
  const events = parseJsonlSafe(eventsPath)
  const meta = JSON.parse(
    fs.readFileSync(path.join(runDir, "run-meta.json"), "utf8")
  ) as ParsedRun["meta"]
  const visitedPath = path.join(runDir, "visited-urls.json")
  const visited = fs.existsSync(visitedPath)
    ? JSON.parse(fs.readFileSync(visitedPath, "utf8"))
    : { visited: [] }
  const pagesVisited = (visited.visited as Array<unknown>).length

  // bucket 별 누적
  type Bucket = { issue: Issue; pages: Set<string> }
  const buckets = new Map<string, Bucket>()

  const upsert = (id: string, factory: () => Issue, page?: string) => {
    let b = buckets.get(id)
    if (!b) {
      b = { issue: factory(), pages: new Set() }
      buckets.set(id, b)
    }
    b.issue.count++
    if (page) b.pages.add(page)
  }

  for (const e of events) {
    const kind = e.kind as string
    const evPage = (e.url as string) || ""

    if (kind === "fatal") {
      const id = `fatal:${String(e.message).slice(0, 50)}`
      upsert(
        id,
        () => ({
          id,
          severity: "critical",
          category: "fatal",
          title: String(e.message),
          count: 0,
        }),
        evPage
      )
    } else if (kind === "pageerror") {
      const id = `pageerror:${String(e.message).slice(0, 50)}`
      upsert(
        id,
        () => ({
          id,
          severity: "critical",
          category: "pageerror",
          title: String(e.message).slice(0, 200),
          detail: String(e.stack || "").slice(0, 500),
          count: 0,
        }),
        evPage
      )
    } else if (kind === "response") {
      const url = String(e.url)
      if (RESPONSE_4XX_BENIGN.some((rx) => rx.test(url))) continue
      const status = Number(e.status)
      const method = String(e.method || "GET")
      const u = new URL(url)
      const id = `response:${status}:${method}:${u.pathname}`
      const sev: Severity = status >= 500 ? "critical" : "major"
      upsert(
        id,
        () => ({
          id,
          severity: sev,
          category: "response",
          title: `${status} ${method} ${u.pathname}`,
          count: 0,
        }),
        evPage
      )
    } else if (kind === "requestfailed") {
      const url = String(e.url)
      if (REQ_FAIL_BENIGN.some((rx) => rx.test(url))) continue
      const u = (() => {
        try {
          return new URL(url)
        } catch {
          return null
        }
      })()
      if (!u) continue
      const id = `reqfail:${u.host}${u.pathname.split("?")[0]}`
      upsert(
        id,
        () => ({
          id,
          severity: "minor",
          category: "requestfailed",
          title: `${u.host}${u.pathname}`,
          detail: String(e.failure || ""),
          count: 0,
        }),
        evPage
      )
    } else if (kind === "console") {
      const lvl = String(e.level)
      const text = String(e.text).slice(0, 200)
      const id = `console:${lvl}:${text.slice(0, 60)}`
      upsert(
        id,
        () => ({
          id,
          severity: lvl === "error" ? "major" : "minor",
          category: "console",
          title: `[${lvl}] ${text.slice(0, 120)}`,
          count: 0,
        }),
        evPage
      )
    } else if (kind === "ui_observation") {
      const cat = String(e.category)
      const sev = String(e.severity)
      const obs = String(e.observation)
      // 카테고리별로 묶음 — 같은 카테고리/심각도면 한 issue
      const id = `ui:${cat}:${sev}`
      upsert(
        id,
        () => ({
          id,
          severity: sev === "high" ? "major" : sev === "medium" ? "minor" : "info",
          category: `ui_${cat}`,
          title: obs,
          samples: e.samples,
          count: 0,
        }),
        String(e.page || evPage)
      )
    } else if (kind === "page_error") {
      const id = `nav_error:${String(e.path)}`
      upsert(
        id,
        () => ({
          id,
          severity: "major",
          category: "navigation",
          title: `Navigation 실패: ${e.path}`,
          detail: String(e.message),
          count: 0,
        }),
        String(e.path)
      )
    }
  }

  const issues: Issue[] = []
  for (const { issue, pages } of buckets.values()) {
    issue.pages = [...pages].slice(0, 10)
    issues.push(issue)
  }

  // severity 정렬
  const order: Record<Severity, number> = { critical: 0, major: 1, minor: 2, info: 3 }
  issues.sort((a, b) => order[a.severity] - order[b.severity] || b.count - a.count)

  const counts = {
    critical: issues.filter((i) => i.severity === "critical").length,
    major: issues.filter((i) => i.severity === "major").length,
    minor: issues.filter((i) => i.severity === "minor").length,
    info: issues.filter((i) => i.severity === "info").length,
    total: issues.length,
  }

  return { runDir, meta, pagesVisited, issues, counts }
}

// CLI: tsx tests/audit/lib/parse-events.ts <runDir>
if (require.main === module) {
  const runDir = process.argv[2] || latestRunDir()
  if (!runDir) {
    console.error("usage: tsx tests/audit/lib/parse-events.ts <runDir>")
    process.exit(1)
  }
  const parsed = parseRun(runDir)
  console.log(JSON.stringify({ ...parsed, issues: parsed.issues }, null, 2))
}

export function latestRunDir(): string | null {
  const reportsDir = path.resolve(__dirname, "..", "reports")
  if (!fs.existsSync(reportsDir)) return null
  const dirs = fs
    .readdirSync(reportsDir)
    .filter((n) => fs.statSync(path.join(reportsDir, n)).isDirectory())
    .filter((n) => fs.existsSync(path.join(reportsDir, n, "run-meta.json")))
    .sort()
    .reverse()
  return dirs[0] ? path.join(reportsDir, dirs[0]) : null
}
