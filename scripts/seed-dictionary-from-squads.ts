/**
 * 스쿼드 사전 → 뉴스 표기 사전 시드 (2026-08-16 운영자 지시).
 *
 * "저걸로(팀 스쿼드 수확분) 사전을 구성하면 되지 않을까? 어차피 문서가 있는 선수들이
 *  유명 선수들일텐데" — 나무위키에 등재된 선수 = 뉴스에 나올 선수라는 논리.
 *
 * ## 오염 방지 규칙 (무인 사서를 폐지시킨 전례가 근거)
 * 1. **신규만 등재** — 기존 사전과 신원(로마자 토큰 집합)이 겹치면 무조건 skip.
 *    기존 preferred_ko 를 덮지 않는다 (정본 순위: 운영자 확정 > 수확).
 * 2. 같은 한글 표기가 배치 안에서 중복되면 전부 skip (동명이인 — 판단하지 않는다).
 * 3. rejected 스쿼드 행 제외. confidence 0.75 로 수확분임을 표시.
 *
 * ## 실행
 *   pnpm exec tsx scripts/seed-dictionary-from-squads.ts            # dry-run
 *   pnpm exec tsx scripts/seed-dictionary-from-squads.ts --write
 */
import "dotenv/config"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { loadNotation, findUniqueRomanizedMatch } from "@/lib/news/notation"

async function main() {
  const write = process.argv.includes("--write")
  const sb: SupabaseClient<any> = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 스쿼드 수확분 (한글명 있는 행 전량 — PostgREST 1,000행 상한 페이지네이션)
  const squad: {
    player_slug: string
    name_en: string
    name_kr: string
    position: string
    team_kr: string
  }[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("team_squads")
      .select("player_slug, name_en, name_kr, position, status, team_dictionary(name_kr)")
      .not("name_kr", "is", null)
      .neq("status", "rejected")
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    for (const r of data ?? []) {
      squad.push({
        player_slug: String(r.player_slug),
        name_en: String(r.name_en),
        name_kr: String(r.name_kr),
        position: String(r.position),
        team_kr: String((r.team_dictionary as { name_kr?: string } | null)?.name_kr ?? ""),
      })
    }
    if (!data || data.length < 1000) break
  }
  console.log(`스쿼드 수확분: ${squad.length}명`)

  // 기존 사전 (단일 문 경유)
  const notation = await loadNotation(sb)
  const persons = notation.persons
  const knownKo = new Set<string>()
  for (const p of persons) {
    knownKo.add(p.preferred_ko)
    for (const s of p.surfaces ?? []) knownKo.add(s)
    for (const h of p.hangul_alts ?? []) knownKo.add(h)
  }
  console.log(`기존 사전 인물: ${persons.length}건`)

  // 배치 내 동명(같은 한글 표기) → 전부 제외
  const koCount = new Map<string, number>()
  for (const s of squad) koCount.set(s.name_kr, (koCount.get(s.name_kr) ?? 0) + 1)

  const candidates: typeof squad = []
  let skipKnown = 0
  let skipDupKo = 0
  for (const s of squad) {
    if (koCount.get(s.name_kr)! > 1) {
      skipDupKo++
      continue
    }
    // 신원 겹침: 로마자 토큰 매칭 또는 한글 표기가 이미 사전에 있으면 skip
    if (findUniqueRomanizedMatch(persons, s.name_en) || knownKo.has(s.name_kr)) {
      skipKnown++
      continue
    }
    candidates.push(s)
  }

  console.log(
    `등재 후보: ${candidates.length}명 (기존 신원 겹침 ${skipKnown}, 배치 내 동명 제외 ${skipDupKo})`
  )
  for (const c of candidates.slice(0, 20)) {
    console.log(`  ${c.name_en.padEnd(26)} ${c.name_kr.padEnd(14)} (${c.team_kr})`)
  }
  if (candidates.length > 20) console.log(`  … 외 ${candidates.length - 20}명`)

  if (!write) {
    console.log(`\n(--write 를 주면 ${candidates.length}건을 등재한다)`)
    return
  }

  let ok = 0
  for (const c of candidates) {
    // "Saliba William"(soccerway 성-이름) → 토큰 집합 매칭이라 어순 무관하지만,
    // surfaces 에는 양쪽 어순을 다 넣어 문자 그대로 대조하는 소비처도 커버한다.
    const lower = c.name_en.toLowerCase()
    const flipped = lower.split(/\s+/).reverse().join(" ")
    const { error } = await sb.from("news_alias_dictionary").insert({
      id: `player_squad_${c.player_slug.replace(/-/g, "_")}`.slice(0, 60),
      category: c.position === "COACH" ? "coach" : "player",
      preferred_ko: c.name_kr,
      romanized: c.name_en,
      surfaces: [...new Set([lower, flipped, c.name_kr])],
      hangul_alts: [],
      confidence: 0.75,
      notes: `팀 스쿼드 수확(나무위키) ${new Date().toISOString().slice(0, 10)} — ${c.team_kr}`,
    })
    if (!error) ok++
    else if (!/duplicate key/.test(error.message))
      console.error(`  실패 ${c.name_en}: ${error.message}`)
  }
  console.log(`\n등재 완료 ${ok}/${candidates.length}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
