/**
 * 관제 센터 데이터 층 스모크 — 실제 스키마에 대고 모든 소스 조회를 한 번 돌린다 (2026-09-08).
 * 화면 없이 확인할 수 있는 유일한 실전 검증이다: 표·컬럼 이름이 틀리면 여기서 failed 로 드러난다.
 *
 *   pnpm exec tsx --tsconfig scripts/tsconfig.server-stub.json scripts/_occ-smoke.ts
 */
import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import { loadControlCenter, type Db } from "@/lib/admin/control-center-sources"
import {
  actionableItems,
  standDown,
  summarizeDomains,
  summarizeObservations,
  waitingItems,
} from "@/lib/admin/control-center"

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("env 없음")
  const db = createClient(url, key, { auth: { persistSession: false } }) as unknown as Db

  const t0 = Date.now()
  const data = await loadControlCenter(db)
  const ms = Date.now() - t0

  const summary = summarizeObservations(data.observations)
  console.log(`\n조회 ${ms}ms · 소스 ${summary.total} (성공 ${summary.ok} / 실패 ${summary.failed} / 미연결 ${summary.unwired})`)

  console.log("\n── 관측 상태 ──")
  for (const o of data.observations) {
    console.log(`  ${o.state.padEnd(8)} ${o.label}${o.note ? ` — ${o.note}` : ""}`)
  }

  console.log("\n── 지금 처리해야 할 일 (우선순위 순) ──")
  for (const i of actionableItems(data.items)) {
    console.log(
      `  ${String(i.count).padStart(4)} ${i.severity.padEnd(8)} ${i.label}` +
        `${i.oldestAt ? ` · 최장 ${Math.round((Date.now() - new Date(i.oldestAt).getTime()) / 3600_000)}h` : ""}` +
        `${i.actionWired ? "" : " · 처리 화면 없음"}`
    )
  }

  console.log("\n── 기다리는 일 ──")
  for (const w of waitingItems(data.items)) console.log(`  ${String(w.count).padStart(4)} ${w.label} · ${w.owner ?? "담당 없음"}`)

  console.log("\n── 업무별 현황 ──")
  for (const d of summarizeDomains(data.items)) {
    console.log(`  ${d.domain.padEnd(12)} 미해결 ${String(d.open).padStart(4)}${d.degraded ? " · 일부 확인 불가" : ""}`)
  }

  console.log("\n── 최근 처리 결과 ──")
  for (const o of data.outcomes.slice(0, 6)) console.log(`  ${o.state.padEnd(10)} ${o.action} — ${o.evidence}`)
  if (data.outcomes.length === 0) console.log("  (48시간 내 기록 없음)")

  const close = standDown(data.observations, data.items)
  console.log(`\n종료 판단: ${close.headline}`)
  if (close.blockers.length) console.log(`  막는 것: ${close.blockers.join(" · ")}`)

  const failed = data.observations.filter((o) => o.state === "failed")
  if (failed.length > 0) {
    console.error(`\n⚠️ 조회 실패 ${failed.length}건 — 표·컬럼 이름을 확인할 것`)
    process.exitCode = 1
  }
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
