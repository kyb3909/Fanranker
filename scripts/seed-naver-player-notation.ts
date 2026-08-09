/**
 * 네이버 스포츠 → 선수 표기 사전 시드·검수 (2026-08-09 운영자 결정 "네이버 우선").
 *
 * ## 왜 네이버인가 (실측으로 고른 것)
 * - 위키백과: 국립국어원 표기라 축구 매체와 다르다 — 샤비 알론소(정: 사비),
 *   코디 학포(정: 각포), 위르겐 클로프(정: 클롭). **기각.**
 * - 구글 지식패널: 표기는 맞고 전체 스쿼드도 주지만 **자동 수집이 차단된다**
 *   (실측: 검색 4~5회 만에 "비정상적인 트래픽" 페이지. headless·headed 모두). **기각.**
 * - 네이버 스포츠: 축구 매체 표기 + `shortName`(성씨 단독) 제공 + **인증 없이 200**.
 *
 * ## 한계 — 알고 쓰는 것
 * 팀별 전체 로스터 엔드포인트가 없다. 이 API 는 리그별 **상위 50명**만 준다
 * (`page` 파라미터를 안 받는다). 그래서 이 시더는 "전체 시드"가 아니라
 * **"기사에 가장 자주 나오는 선수부터 정본으로 채우는" 것**이다.
 * 나머지 유망주·비주류는 기사에 등장할 때 기존 네이버 검증 루프가 처리하고,
 * 그 루프는 이제 로마자 신원 매칭으로 사전을 우선한다(카롤리나 사고 방지).
 *
 *   pnpm exec tsx scripts/seed-naver-player-notation.ts          # 대조 보고서만
 *   pnpm exec tsx scripts/seed-naver-player-notation.ts --write  # 미등재 신규 등재
 */
import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import { loadNotation, unknownPersonNames } from "@/lib/news/notation"

const API = "https://api-gw.sports.naver.com"
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36"
/**
 * ⚠️ 코드를 추측하지 말 것 — 실측으로 확인한 것만 넣는다.
 * 라리가는 `laliga` 가 아니라 **`primera`** 다. `seriea`·`ucl` 은 200 을 주지만
 * seasons 가 0건이라 네이버가 통계를 제공하지 않는 것으로 보인다(조용한 빈 응답 —
 * 오늘 하루 종일 본 그 패턴이다). 세리에A·UCL 선수는 기존 검증 루프가 처리한다.
 */
const LEAGUES = ["epl", "primera", "bundesliga", "ligue1"] as const

interface NaverPlayer {
  playerName: string
  shortName: string | null
  teamName: string | null
  backNumber: number | null
  league: string
}

async function getJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(API + path, { headers: { "User-Agent": UA } })
    if (!r.ok) return null
    const j = (await r.json()) as { result?: Record<string, unknown> }
    return j.result ?? null
  } catch {
    return null
  }
}

/** 현재 시즌 코드 — isSeason='Y' 우선, 없으면 가장 최근 연도 */
async function currentSeason(league: string): Promise<string | null> {
  const res = await getJson(`/statistics/categories/${league}/seasons`)
  const seasons = (res?.seasons ?? []) as { seasonCode: string; year: number; isSeason: string }[]
  if (seasons.length === 0) return null
  const cur = seasons.find((s) => s.isSeason === "Y")
  if (cur) return cur.seasonCode
  return [...seasons].sort((a, b) => b.year - a.year)[0]?.seasonCode ?? null
}

async function fetchLeaguePlayers(league: string): Promise<NaverPlayer[]> {
  const season = await currentSeason(league)
  if (!season) return []
  const res = await getJson(`/statistics/categories/${league}/seasons/${season}/players?size=50`)
  const rows = (res?.seasonPlayerStats ?? []) as Record<string, unknown>[]
  return rows
    .map((p) => ({
      playerName: String(p.playerName ?? "").trim(),
      shortName: p.shortName ? String(p.shortName).trim() : null,
      teamName: p.teamName ? String(p.teamName).trim() : null,
      backNumber: typeof p.backNumber === "number" ? p.backNumber : null,
      league,
    }))
    .filter((p) => p.playerName && /[가-힣]/.test(p.playerName))
}

async function main() {
  const write = process.argv.includes("--write")
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Supabase 자격증명 필요")
  const supabase = createClient(url, key)

  const notation = await loadNotation(supabase)
  console.log(`사전 인물 ${notation.persons.length}명\n`)

  const all: NaverPlayer[] = []
  for (const lg of LEAGUES) {
    const players = await fetchLeaguePlayers(lg)
    all.push(...players)
    console.log(`  ${lg.padEnd(11)} ${String(players.length).padStart(3)}명`)
  }

  const byName = new Map<string, NaverPlayer>()
  for (const p of all) if (!byName.has(p.playerName)) byName.set(p.playerName, p)

  const missing: NaverPlayer[] = []
  const known: NaverPlayer[] = []
  for (const p of byName.values()) {
    if (unknownPersonNames([p.playerName], notation.persons).length > 0) missing.push(p)
    else known.push(p)
  }

  // ⚠️ '표기 불일치' 자동 판정은 **의도적으로 하지 않는다.**
  // 처음엔 "사전 항목이 네이버 성씨로 끝나면 불일치"로 뽑았는데 실측 34건 중 상당수가
  // 오탐이었다 — '브랜든 윌리엄스'↔'네코 윌리엄스', '빅토르 무뇨스'↔'다니엘 무뇨스'는
  // 그냥 **다른 선수**이고 '콜린스'는 동명이인이 둘이다. 성씨만으로는 동명이인과
  // 표기 차이를 가를 수 없다. 진짜 판별자는 로마자인데(findUniqueRomanizedMatch)
  // 이 API 는 로마자를 주지 않는다.
  // 성씨 항목과 풀네임 항목의 공존은 원래 정상이다(각포 / 코디 각포 선례).
  // → **미등재만 채우고 기존 항목은 건드리지 않는다.** 틀린 검수 목록은 없느니만 못하다.

  console.log(`\n수집 ${all.length}명 (고유 ${byName.size})`)
  console.log(`  이미 등재 ${known.length} / 미등재 ${missing.length}`)

  if (missing.length > 0) {
    console.log(`\n[미등재 — --write 시 등재]`)
    for (const p of missing.slice(0, 40)) {
      console.log(
        `  ${p.playerName}${p.shortName && p.shortName !== p.playerName ? ` (${p.shortName})` : ""} — ${p.teamName}`
      )
    }
  }

  if (!write) {
    console.log(`\n(--write 를 주면 미등재 ${missing.length}명만 등재. 기존 항목은 손대지 않는다)`)
    return
  }

  let ok = 0
  for (const p of missing) {
    // shortName(성씨 단독)을 별칭으로 함께 등재 — 기사가 성씨만 쓰는 경우가 많고,
    // 그게 '카릭' 사고(풀네임만 있어서 성씨 오표기를 못 잡음)의 원인이었다.
    const alts = p.shortName && p.shortName !== p.playerName ? [p.shortName] : []
    const { error } = await supabase.from("news_alias_dictionary").insert({
      id: `player_naver_${p.playerName.replace(/\s+/g, "_")}`.slice(0, 60),
      category: "player",
      preferred_ko: p.playerName,
      // 네이버는 로마자를 주지 않는다. NOT NULL 이라 빈 문자열 — 기존 learned 항목과 같은 관행.
      // 로마자가 없으면 findUniqueRomanizedMatch 신원 매칭에는 못 쓰이지만, 표기 치환·게이트에는 쓰인다.
      romanized: "",
      surfaces: [p.playerName],
      hangul_alts: alts,
      confidence: 0.95,
      notes:
        `네이버 스포츠 시드 2026-08-09 — ${p.league} ${p.teamName ?? ""} ${p.backNumber ?? ""}`.trim(),
    })
    if (!error) ok++
    else console.error(`  실패 ${p.playerName}: ${error.message}`)
  }
  console.log(`\n신규 등재 ${ok}/${missing.length}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
