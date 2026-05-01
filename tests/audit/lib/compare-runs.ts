/**
 * 두 audit run 비교 → resolved (전 run에 있고 이번엔 없음) / new / persisting / regressed.
 * health.json 누적도 여기서.
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { parseRun, latestRunDir, type ParsedRun, type Issue } from "./parse-events"

interface Diff {
  prev: { dir: string; counts: ParsedRun["counts"] } | null
  curr: { dir: string; counts: ParsedRun["counts"] }
  resolved: Issue[] // 이전엔 있었는데 사라진 것
  newly: Issue[] // 이번에 새로 생긴 것
  persisting: Issue[] // 둘 다에 존재
  regressed: Issue[] // 이전엔 없었는데 critical/major로 새로 등장
}

function indexById(issues: Issue[]): Map<string, Issue> {
  return new Map(issues.map((i) => [i.id, i]))
}

export function compareRuns(currDir: string, prevDir: string | null): Diff {
  const curr = parseRun(currDir)
  if (!prevDir) {
    return {
      prev: null,
      curr: { dir: currDir, counts: curr.counts },
      resolved: [],
      newly: curr.issues,
      persisting: [],
      regressed: curr.issues.filter((i) => i.severity === "critical" || i.severity === "major"),
    }
  }
  const prev = parseRun(prevDir)
  const prevIdx = indexById(prev.issues)
  const currIdx = indexById(curr.issues)

  const resolved: Issue[] = []
  for (const i of prev.issues) if (!currIdx.has(i.id)) resolved.push(i)

  const newly: Issue[] = []
  const persisting: Issue[] = []
  for (const i of curr.issues) {
    if (prevIdx.has(i.id)) persisting.push(i)
    else newly.push(i)
  }

  const regressed = newly.filter((i) => i.severity === "critical" || i.severity === "major")

  return {
    prev: { dir: prevDir, counts: prev.counts },
    curr: { dir: currDir, counts: curr.counts },
    resolved,
    newly,
    persisting,
    regressed,
  }
}

function appendHealth(diff: Diff) {
  const healthPath = path.resolve(__dirname, "..", "reports", "health.json")
  const history: Array<{
    runDir: string
    timestamp: string
    counts: ParsedRun["counts"]
    resolvedCount: number
    newlyCount: number
    regressedCount: number
  }> = fs.existsSync(healthPath) ? JSON.parse(fs.readFileSync(healthPath, "utf8")) : []
  history.push({
    runDir: path.basename(diff.curr.dir),
    timestamp: new Date().toISOString(),
    counts: diff.curr.counts,
    resolvedCount: diff.resolved.length,
    newlyCount: diff.newly.length,
    regressedCount: diff.regressed.length,
  })
  fs.writeFileSync(healthPath, JSON.stringify(history, null, 2))
}

function findPrevRunDir(currDir: string): string | null {
  const reportsDir = path.dirname(currDir)
  const all = fs
    .readdirSync(reportsDir)
    .filter((n) => fs.statSync(path.join(reportsDir, n)).isDirectory())
    .filter((n) => fs.existsSync(path.join(reportsDir, n, "run-meta.json")))
    .sort()
  const i = all.indexOf(path.basename(currDir))
  if (i <= 0) return null
  return path.join(reportsDir, all[i - 1])
}

if (require.main === module) {
  const currDir = process.argv[2] || latestRunDir()
  if (!currDir) {
    console.error("no run found")
    process.exit(1)
  }
  const prevDir = process.argv[3] || findPrevRunDir(currDir)
  const diff = compareRuns(currDir, prevDir)
  appendHealth(diff)

  console.log(`\n=== Audit Diff ===`)
  console.log(
    `prev: ${diff.prev ? path.basename(diff.prev.dir) : "(none — first run)"} -> curr: ${path.basename(diff.curr.dir)}`
  )
  console.log("\n--- Counts ---")
  if (diff.prev) {
    console.log(`prev: ${JSON.stringify(diff.prev.counts)}`)
  }
  console.log(`curr: ${JSON.stringify(diff.curr.counts)}`)

  console.log(`\n✅ Resolved (${diff.resolved.length}):`)
  diff.resolved.slice(0, 20).forEach((i) => console.log(`  [${i.severity}] ${i.title}`))

  console.log(`\n🆕 Newly (${diff.newly.length}):`)
  diff.newly.slice(0, 20).forEach((i) => console.log(`  [${i.severity}] ${i.title}`))

  console.log(`\n🔁 Persisting (${diff.persisting.length}):`)
  diff.persisting.slice(0, 20).forEach((i) => console.log(`  [${i.severity}] ${i.title}`))

  if (diff.regressed.length > 0) {
    console.log(`\n🚨 Regressed (${diff.regressed.length}):`)
    diff.regressed.forEach((i) => console.log(`  [${i.severity}] ${i.title}`))
  }
  console.log(`\nhealth.json updated.`)
}
