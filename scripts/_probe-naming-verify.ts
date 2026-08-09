/**
 * 네이버 표기 검증 프로브 (1회성, 2026-08-09).
 * "네이버 검토 안 하냐"는 지적에 추측 대신 실측으로 답하기 위한 것.
 *
 * 1부: verifySpelling 실측 — 후보 생성이 정답을 포함하는가
 * 2부: 로마자 신원 매칭 — 후보가 틀려도 사전이 구해내는가
 *
 *   pnpm exec tsx --tsconfig scripts/tsconfig.server-stub.json scripts/_probe-naming-verify.ts
 */
import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import { verifySpelling } from "@/lib/naming/verify"
import { findUniqueRomanizedMatch, loadNotation } from "@/lib/news/notation"

const CASES: [name: string, context: string, correct: string][] = [
  ["카릭", "카릭, 래시포드 다음 주 복귀 확인", "캐릭"],
  ["하비 알론소", "하비 알론소, 리버풀 동료와 재회", "사비 알론소"],
]

async function main() {
  console.log("=== 1부: verifySpelling (후보 생성 + 네이버 랭킹) ===")
  const verdicts = new Map<string, string | null>()
  for (const [name, context, correct] of CASES) {
    const v = await verifySpelling(name, context)
    verdicts.set(name, v.romanized)
    const counts = (v.counts ?? [])
      .map((c) => `${c.candidate} ${c.total.toLocaleString()}`)
      .join(" / ")
    const ok = v.winner === correct ? "✅" : "❌"
    console.log(`\n■ "${name}"  기대=${correct}`)
    console.log(`  ${ok} 승자: ${v.winner ?? "(없음)"}   로마자: ${v.romanized ?? "(없음)"}`)
    console.log(`  네이버: ${counts || "(없음)"}`)
  }

  console.log("\n\n=== 2부: 로마자 신원 매칭 (사전 우선 경로) ===")
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Supabase 자격증명 필요")
  const supabase = createClient(url, key)
  const { persons: dict } = await loadNotation(supabase)
  console.log(`사전 ${dict.length}건 로드`)

  for (const [name, , correct] of CASES) {
    const roman = verdicts.get(name) ?? null
    const hit = findUniqueRomanizedMatch(dict, roman)
    const ok =
      hit && (hit.preferred_ko === correct || hit.preferred_ko.includes(correct)) ? "✅" : "❌"
    console.log(`  ${ok} "${name}" (로마자 ${roman}) → ${hit?.preferred_ko ?? "(매칭 없음)"}`)
  }

  // 오탐 확인: 흔한 성씨 한 토큰은 유일하지 않아야 한다
  const ambiguous = findUniqueRomanizedMatch(dict, "Silva")
  console.log(`\n  오탐 가드: "Silva" → ${ambiguous?.preferred_ko ?? "(유일하지 않음 — 정상)"}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
