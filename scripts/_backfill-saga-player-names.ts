/**
 * 영문/오표기 사가 제목 백필 (2026-08-08 일회성).
 *
 * linkArticleToSaga 무게이트 시절(자동발행 8/4 ~ 게이트 8/8)에 새어 나온 사가들을
 * 프로덕션과 같은 재료(LLM 후보 → 네이버 검색량 → pickWinner)로 정리한다.
 *
 * 발행 게이트의 fail-closed 와 달리 백필은 3단계 폴백을 쓴다 — 여기서 보류하면
 * 영문 제목이 라이브에 계속 노출되는 것이라, "최선의 한글"이 "영문 방치"보다 낫다:
 *   1. 압도 승자(pickWinner) → 그대로 채택
 *   2. 표기 경합 → 다수결 채택 + 차점 표기(실사용 30건 이상)를 별칭으로 흡수
 *   3. 검색량 부족(무명 선수) → 최상위 후보 폴백, notes 에 저커버리지 표시
 * 인프라 실패(네이버 미가동)만 진짜 보류.
 *
 * 대상: 활성 transfer 사가 중 "<이름> 이적 사가" 표준 제목이면서
 *       player_name_kr null 또는 제목에 로마자 잔존 + RECHECK_TITLES (음차 의심)
 *
 * 실행: pnpm exec tsx --tsconfig scripts/tsconfig.server-stub.json scripts/_backfill-saga-player-names.ts [--dry]
 */
import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import { proposeCandidates, naverNewsCount } from "@/lib/naming/verify"
import { pickWinner } from "@/lib/naming/pick"
import { registerVerifiedPlayer, absorbAliasIntoEntry } from "@/lib/news/naming-verify-loop"
import { normalizePlayerKey } from "@/lib/saga/identity"

const dry = process.argv.includes("--dry")

/** 한글 제목이지만 음차가 의심되는 사가 — 검증 루프에 다시 태운다 */
const RECHECK_TITLES = ["케란 악튀르코글루 이적 사가"]
/** LLM 이 입력 표기에 앵커링되거나 회차마다 흔들려 못 내는 후보 보강 (케란→케렘 실측) */
const CANDIDATE_HINTS: Record<string, string[]> = {
  "케란 악튀르코글루 이적 사가": ["케렘 악튀르코글루"],
  "Pep Chavarria 이적 사가": ["펩 차바리아"], // 이전 회차 실측: 펩 21건 > 페프 1건
  "Javier Gouto 이적 사가": ["자비에르 고조"], // 발행 기사 표기 — 전 후보 0건이면 독자가 본 표기 우선
}
/** 차점 표기를 별칭으로 흡수할 실사용 하한 (pickWinner MIN_TOTAL 과 동일) */
const ABSORB_MIN_TOTAL = 30

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: sagas, error } = await supabase
    .from("sagas")
    .select("id, slug, title, subject, anchor_post_id")
    .eq("saga_type", "transfer")
    .eq("status", "active")
  if (error) throw new Error(error.message)

  const targets = (sagas ?? []).filter((s) => {
    const title = s.title as string
    if (!/ 이적 사가$/.test(title)) return false // 운영자 커스텀 제목은 건드리지 않는다
    const kr = (s.subject as { player_name_kr?: string | null })?.player_name_kr ?? null
    return !kr || /[A-Za-z]/.test(title) || RECHECK_TITLES.includes(title)
  })
  console.log(`대상 ${targets.length}건${dry ? " (dry)" : ""}`)

  for (const saga of targets) {
    const title = saga.title as string
    const rawName = title.replace(/ 이적 사가$/, "").trim()
    const { data: firstEntry } = await supabase
      .from("saga_entries")
      .select("headline")
      .eq("saga_id", saga.id)
      .order("occurred_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    const context = (firstEntry?.headline as string | undefined) ?? undefined

    const { romanized, candidates } = await proposeCandidates(rawName, context)
    // 힌트를 앞에 — 전 후보 0건 폴백(allCands[0])에서 실측/기사 표기가 우선하도록
    const allCands = [...new Set([...(CANDIDATE_HINTS[title] ?? []), ...candidates])]
    if (!romanized || allCands.length === 0) {
      console.log(`보류(후보 생성 실패): "${title}"`)
      continue
    }

    const counts: { candidate: string; total: number }[] = []
    let infra = false
    for (const c of allCands) {
      const total = await naverNewsCount(c)
      if (total === null) {
        infra = true
        break
      }
      counts.push({ candidate: c, total })
      await new Promise((r) => setTimeout(r, 150))
    }
    if (infra) {
      console.log(`보류(네이버 미가동): "${title}"`)
      continue
    }

    const verdict = pickWinner(counts)
    const sorted = [...counts].sort((a, b) => b.total - a.total)
    let winner = verdict.winner
    let mode = "압도 승자"
    if (!winner) {
      if (verdict.reason.startsWith("표기 경합")) {
        winner = sorted[0].candidate
        mode = "경합 다수결"
      } else {
        winner = sorted[0].total >= 1 ? sorted[0].candidate : allCands[0]
        mode = "저커버리지 폴백"
      }
    }
    const basis = sorted.map((c) => `${c.candidate} ${c.total}건`).join(", ")

    if (winner === rawName) {
      console.log(`유지: "${title}" — 이미 최선 표기 (${basis})`)
      continue
    }

    const newTitle = `${winner} 이적 사가`
    console.log(`${dry ? "[dry] " : ""}"${title}" → "${newTitle}" [${mode}] (네이버: ${basis})`)
    if (dry) continue

    // 사전 등재 — 기사에 나온 표기(한글일 때만)를 옛 표기 alt 로 흡수해
    // 발행 초크의 사전 치환이 이후 기사도 대표 표기로 정리하게 한다
    const articleName = /[가-힣]/.test(rawName) ? rawName : winner
    const registerError = await registerVerifiedPlayer(supabase, {
      articleName,
      preferred: winner,
      romanized,
      notes: `사가 백필 등재 (2026-08-08, ${mode}) — 네이버: ${basis}`,
    })
    if (registerError) {
      console.log(`  사전 등재 실패(사가는 건드리지 않음): ${registerError}`)
      continue
    }
    // 경합 차점 표기(실사용 두터움)도 별칭으로 — 이후 기사의 차점 표기도 대표로 치환된다
    const entryId = `player_auto_${normalizePlayerKey(romanized).replace(/-/g, "_")}`.slice(0, 60)
    for (const c of sorted.slice(1)) {
      if (c.total >= ABSORB_MIN_TOTAL && c.candidate !== winner) {
        const absorbed = await absorbAliasIntoEntry(supabase, entryId, c.candidate)
        if (!absorbed.ok) {
          const 말 = absorbed.kind === "rejected" ? "거부" : "실패"
          console.log(`  별칭 흡수 ${말}(${c.candidate}): ${absorbed.reason}`)
        }
      }
    }

    const subject = { ...(saga.subject as Record<string, unknown>), player_name_kr: winner }
    const { error: sagaError } = await supabase
      .from("sagas")
      .update({ title: newTitle, subject, updated_at: new Date().toISOString() })
      .eq("id", saga.id)
    if (sagaError) {
      console.log(`  사가 갱신 실패: ${sagaError.message}`)
      continue
    }
    if (saga.anchor_post_id) {
      const { error: postError } = await supabase
        .from("posts")
        .update({ title: newTitle })
        .eq("id", saga.anchor_post_id)
      if (postError) console.log(`  앵커 포스트 갱신 실패: ${postError.message}`)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
