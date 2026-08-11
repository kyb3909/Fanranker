/**
 * VS 게이트 드라이런 — 최근 발행분에 새 게이트를 적용하면 폴이 몇 개나 살아남는가.
 *
 * 왜 고정 시험지가 아니라 드라이런인가: 이 게이트는 LLM 판정이 아니라 정규식
 * (isClubName) + 카운터(일 쿼터)라서 모델 드리프트가 없다. 검증해야 할 것은
 * "프롬프트가 명세를 따르는가"가 아니라 "실제 기사 제목에서 어느 비율이 걸리는가"다.
 *
 * 실행: pnpm exec tsx scripts/_dryrun-vs-gate.ts
 */
import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import { isClubName } from "@/lib/naming/pick"
import { VS_DAILY_QUOTA, VS_AUTO_ON_CONFIDENCE } from "@/lib/news/vs-issue"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  const { data, error } = await supabase
    .from("polls")
    .select("id, created_at, confidence, is_active, posts!inner(title)")
    .eq("created_by", "system_vs")
    .gte("created_at", new Date(Date.now() - 7 * 864e5).toISOString())
    .order("created_at", { ascending: true })
  if (error) throw new Error(error.message)

  const rows = (data ?? []).map((r) => ({
    day: new Date(new Date(r.created_at).getTime() + 9 * 3600e3).toISOString().slice(0, 10),
    title: (r.posts as unknown as { title: string }).title,
    confidence: r.confidence as number | null,
  }))

  // 실제 게이트와 같은 순서로 재현: confidence → 관심도 → 일 쿼터
  const perDay = new Map<string, number>()
  let passConf = 0
  let passFame = 0
  let passQuota = 0
  const droppedByFame: string[] = []

  for (const r of rows) {
    if ((r.confidence ?? 0) < VS_AUTO_ON_CONFIDENCE) continue
    passConf++
    if (!isClubName(r.title)) {
      if (droppedByFame.length < 12) droppedByFame.push(r.title)
      continue
    }
    passFame++
    const used = perDay.get(r.day) ?? 0
    if (used >= VS_DAILY_QUOTA) continue
    perDay.set(r.day, used + 1)
    passQuota++
  }

  const days = new Set(rows.map((r) => r.day)).size || 1
  console.log(`\n=== VS 게이트 드라이런 (최근 7일, 폴 ${rows.length}건) ===`)
  console.log(
    `현행(게이트 없음)     : ${rows.length}건  → 하루 ${(rows.length / days).toFixed(1)}건`
  )
  console.log(`confidence >= ${VS_AUTO_ON_CONFIDENCE} 통과 : ${passConf}건`)
  console.log(`+ 관심도(isClubName)  : ${passFame}건  (여기서 ${passConf - passFame}건 탈락)`)
  console.log(
    `+ 일 쿼터 ${VS_DAILY_QUOTA}건        : ${passQuota}건  → 하루 ${(passQuota / days).toFixed(1)}건`
  )
  console.log(`\n최종 감소율: ${(100 - (passQuota / rows.length) * 100).toFixed(0)}%`)
  console.log(`\n--- 관심도에서 탈락한 제목 (표본) ---`)
  droppedByFame.forEach((t) => console.log(`  · ${t.slice(0, 70)}`))
  console.log(`\n--- 일자별 통과 ---`)
  for (const [d, n] of [...perDay].sort()) console.log(`  ${d}: ${n}건`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
