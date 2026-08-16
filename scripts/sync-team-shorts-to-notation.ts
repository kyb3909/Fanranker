/**
 * 팀 통칭 동기화 — team_dictionary.short_kr → 뉴스 표기 사전 team 항목 (2026-08-16).
 *
 * ## 왜
 * 운영자: "뉴스 생성할 때 웬만하면 축약형을 쓰길 바라는거야" (레알, 인테르, 서울…).
 * 뉴스 생성의 표기는 correction-examples API 가 싣는 **확정 표기 힌트(preferred_ko)** 가
 * 결정한다 — 뉴캐슬·토트넘이 이미 축약형으로 나가는 것도 그 항목의 preferred_ko 가
 * 짧기 때문. 그러므로 통칭의 정본(team_dictionary.short_kr)을 뉴스 사전 team 항목의
 * preferred_ko 로 밀어 넣으면 생성 시점부터 축약형이 된다.
 *
 * ⚠️ 발행 후처리 치환으로 줄이는 방법은 금지 — notation 모듈의 "길이 변형은 치환하지
 *    않는다" 확정 규칙(인용문 '뉴캐슬 유나이티드 2.0' 훼손 실사고)과 충돌한다.
 *    생성 시점 유도(힌트)는 LLM 이 인용문·조사를 스스로 처리하므로 안전하다.
 *
 * ## 동작
 * - 매칭: 뉴스 사전 team 항목과 (romanized 토큰 ↔ name_en 토큰) 또는 한글 표기로 대조
 * - 기존 항목: preferred_ko → short_kr, 이전 표기는 hangul_alts 로 보존 (뉴캐슬 패턴)
 * - 없는 항목: 신규 등재 (romanized = soccerway name_en)
 * - 운영자가 CSV 로 short_kr 를 채운 뒤 이 스크립트를 다시 돌리면 그대로 따라간다
 *
 * ## 실행
 *   pnpm exec tsx scripts/sync-team-shorts-to-notation.ts            # dry-run
 *   pnpm exec tsx scripts/sync-team-shorts-to-notation.ts --write
 */
import "dotenv/config"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { loadNotation } from "@/lib/news/notation"

const tokens = (s: string | null | undefined): Set<string> =>
  new Set(
    (s ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !["the", "club", "fc", "afc", "cf", "utd"].includes(t))
  )

/**
 * 토큰 부분집합 대조 — 한쪽이 다른 쪽을 포함해야 같은 팀으로 본다.
 * ⚠️ "겹치는 토큰 하나라도" 로 하면 안 된다 — 실측: 'Real Madrid' 가 'madrid' 한 토큰으로
 *    '아틀레티코 마드리드' 항목에, 'Manchester United' 가 '맨체스터 시티' 항목에 붙었다.
 */
function subsetMatch(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return false
  const sub = (x: Set<string>, y: Set<string>) => [...x].every((t) => y.has(t))
  return sub(a, b) || sub(b, a)
}

/**
 * 한글 근사 — 공백 제거 후 편집거리 ≤1 (울버햄턴↔울버햄튼).
 * ⚠️ 앞 3자 규칙은 안 된다 — 실측: '맨체스터 시티'와 '맨체스터 유나이티드'가 "맨체스"로 붙었다.
 */
function hangulNear(a: string, b: string): boolean {
  const ca = a.replace(/\s+/g, "")
  const cb = b.replace(/\s+/g, "")
  if (ca.length < 4 || cb.length < 4) return ca === cb && ca.length > 0
  if (ca === cb) return true
  if (ca.length === cb.length) {
    let diff = 0
    for (let i = 0; i < ca.length; i++) if (ca[i] !== cb[i]) diff++
    return diff <= 1
  }
  if (Math.abs(ca.length - cb.length) === 1) {
    const [s, l] = ca.length < cb.length ? [ca, cb] : [cb, ca]
    let i = 0
    let j = 0
    let used = false
    while (i < s.length && j < l.length) {
      if (s[i] === l[j]) {
        i++
        j++
      } else if (!used) {
        used = true
        j++
      } else return false
    }
    return true
  }
  return false
}

async function main() {
  const write = process.argv.includes("--write")
  const sb: SupabaseClient<any> = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: teams, error } = await sb
    .from("team_dictionary")
    .select("soccerway_team_id, slug, name_en, name_kr, short_kr, aliases_kr")
    .not("short_kr", "is", null)
  if (error) throw new Error(error.message)

  const notation = await loadNotation(sb)
  const teamEntries = notation.entries.filter((e) => e.category === "team")
  console.log(`통칭 보유 팀: ${teams?.length ?? 0} / 뉴스 사전 team 항목: ${teamEntries.length}`)

  let updated = 0
  let inserted = 0
  let skipped = 0
  for (const t of teams ?? []) {
    const short = String(t.short_kr).trim()
    if (!short) continue
    const enTok = tokens(String(t.name_en))
    // short 자체도 대조 형태에 넣는다 — '울버햄튼'(short)이 기존 '울버햄턴' 항목과
    // 편집거리 1 로 만나는 경로 (name_kr '울버햄튼 원더러스'로는 못 만난다)
    const koForms = new Set(
      [String(t.name_kr), short, ...((t.aliases_kr as string[] | null) ?? [])].filter(Boolean)
    )

    // 강한 순서로 단계 매칭 — 정확 일치 > 로마자 토큰 부분집합 > 한글 근사(편집거리 1)
    const forms = (e: (typeof teamEntries)[number]) => [e.preferred_ko, ...(e.hangul_alts ?? [])]
    const hit =
      teamEntries.find((e) => forms(e).some((f) => koForms.has(f))) ??
      teamEntries.find((e) => subsetMatch(tokens(e.romanized), enTok)) ??
      teamEntries.find((e) => forms(e).some((f) => [...koForms].some((k) => hangulNear(f, k))))

    if (hit) {
      if (hit.preferred_ko === short) {
        skipped++
        continue
      }
      const alts = [...new Set([...(hit.hangul_alts ?? []), hit.preferred_ko])].filter(
        (a) => a !== short
      )
      console.log(`  갱신: ${hit.preferred_ko} → ${short}  (alts: ${alts.join(", ")})`)
      updated++
      if (write) {
        const { error: e1 } = await sb
          .from("news_alias_dictionary")
          .update({ preferred_ko: short, hangul_alts: alts })
          .eq("id", hit.id)
        if (e1) console.error(`  ✗ ${hit.id}: ${e1.message}`)
      }
    } else {
      console.log(`  신규: ${short}  (${t.name_en})`)
      inserted++
      if (write) {
        const { error: e2 } = await sb.from("news_alias_dictionary").insert({
          id: `team_short_${String(t.slug).replace(/-/g, "_")}`.slice(0, 60),
          category: "team",
          preferred_ko: short,
          romanized: String(t.name_en),
          surfaces: [...new Set([String(t.name_en).toLowerCase(), short, String(t.name_kr)])],
          hangul_alts: String(t.name_kr) !== short ? [String(t.name_kr)] : [],
          confidence: 0.9,
          notes: `팀 통칭 동기화 ${new Date().toISOString().slice(0, 10)} — team_dictionary.short_kr`,
        })
        if (e2 && !/duplicate key/.test(e2.message)) console.error(`  ✗ ${short}: ${e2.message}`)
      }
    }
  }
  console.log(
    `\n갱신 ${updated} / 신규 ${inserted} / 동일 ${skipped} (${write ? "적용됨" : "dry-run"})`
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
