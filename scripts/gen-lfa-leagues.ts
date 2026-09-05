/**
 * lib/lfa/leagues.ts 생성기 (일회성).
 *
 * betman league_code → live-football-api 리그 id 매핑을 **카탈로그에서 뽑아** 만든다.
 * 손으로 옮겨 적으면 32자 해시에서 오타가 난다 — 반드시 생성해서 쓴다.
 *
 * 매핑 규칙은 (국가, 리그명 정확일치) 쌍이다. 이름만으로는 안 된다:
 * "Premier League"가 잉글랜드·아르헨티나에, "Serie A"가 이탈리아·브라질에 둘 다 있다.
 *
 * 선행 조건: `.lfa-probe-cache/leagues_*.json` (리그 카탈로그 응답). 없으면 API 를 한 번
 * 호출해 받아둔다 — 카탈로그는 1,416개 리그라 자주 부를 이유가 없다.
 *
 * 실행: pnpm exec tsx scripts/gen-lfa-leagues.ts
 */

import { readFileSync, writeFileSync, readdirSync } from "fs"
import { join } from "path"

const CACHE = join(process.cwd(), ".lfa-probe-cache")

/** betman league_code → [국가, LFA 리그명(정확일치), 비고] */
const RULES: [string, string, string, string?][] = [
  // 유럽 5대 리그
  ["EPL", "England", "Premier League"],
  ["라리가", "Spain", "LaLiga"],
  ["세리에A", "Italy", "Serie A"],
  ["분데스리", "Germany", "Bundesliga"],
  ["프리그1", "France", "Ligue 1"],
  // 유럽 대항전
  ["UCL", "Europe", "Champions League"],
  ["UEL", "Europe", "Europa League"],
  ["UECL", "Europe", "Conference League"],
  ["U슈퍼컵", "Europe", "UEFA Super Cup"],
  // 잉글랜드
  ["EFL챔", "England", "Championship"],
  ["잉글FA컵", "England", "FA Cup"],
  ["잉리그컵", "England", "League Cup", "카라바오컵"],
  ["잉슈퍼컵", "England", "Community Shield"],
  // 유럽 컵 — 자국 컵은 이름이 그냥 "Cup", 슈퍼컵은 "Super Cup" 이다
  ["독일FA컵", "Germany", "Cup", "DFB 포칼"],
  ["이탈FA컵", "Italy", "Cup", "코파 이탈리아"],
  ["스페FA컵", "Spain", "King's Cup", "코파 델 레이"],
  ["프랑FA컵", "France", "Cup", "쿠프 드 프랑스"],
  ["프슈퍼컵", "France", "Super Cup", "트로페 데 샹피옹"],
  ["네슈퍼컵", "Holland", "Super Cup", "요한 크루이프 실드"],
  // 기타 유럽 리그
  ["에레디비", "Holland", "Eredivisie"],
  ["엘리테세", "Norway", "eliteserien", "소문자 주의"],
  // 한국
  ["K리그1", "South Korea", "K-League", "동명 2건 — 실측 경기에 쓰인 id 채택"],
  ["K리그2", "South Korea", "K-League 2"],
  ["한국FA컵", "South Korea", "FA Cup"],
  // 일본
  ["J1리그", "Japan", "J1 League"],
  ["J2리그", "Japan", "J2 League"],
  ["J1백년", "Japan", "J1 100 Year Vision League"],
  ["J2J3백년", "Japan", "J2/J3 100 Year Vision League"],
  // 미국
  ["MLS", "USA", "MLS"],
  ["미국FA컵", "USA", "Open Cup"],
  // 아시아
  ["ACLE", "Asia", "AFC Champions League"],
  ["ACL2", "Asia", "AFC Champions League 2"],
  ["축ASEA챔", "Asia", "ASEAN Championship"],
  // 기타
  ["A리그", "Australia", "A League"],
  ["호주FA컵", "Australia", "FFA Cup"],
  ["코파리베", "South America", "Libertadores Cup"],
  ["C챔피언", "North/Central America", "CONCACAF Champions League"],
]

/** 동명이 여럿일 때 실측 경기 데이터에 실제로 등장한 id 를 우선한다 */
function observedIds(): Map<string, Set<string>> {
  const seen = new Map<string, Set<string>>()
  for (const f of readdirSync(CACHE)) {
    if (!f.startsWith("matches_")) continue
    const j = JSON.parse(readFileSync(join(CACHE, f), "utf-8"))
    for (const m of j?.data?.matches ?? []) {
      const key = `${m.league?.country}|${m.league?.name}`
      if (!seen.has(key)) seen.set(key, new Set())
      seen.get(key)!.add(m.league.id)
    }
  }
  return seen
}

function main() {
  const catalogFile = readdirSync(CACHE).find((f) => f.startsWith("leagues_"))
  if (!catalogFile) {
    throw new Error(
      `${CACHE}/leagues_*.json 없음 — GET /api/v1/leagues?api_key=…&lang=en 응답을 그 경로에 저장할 것`
    )
  }
  const catalog = JSON.parse(readFileSync(join(CACHE, catalogFile), "utf-8"))
  const byCountry = new Map<string, { name: string; id: string }[]>()
  for (const c of catalog.data.data) byCountry.set(c.country, c.leagues)

  const obs = observedIds()
  const out: { code: string; id: string; label: string; note?: string }[] = []
  const problems: string[] = []

  for (const [code, country, name, note] of RULES) {
    const lgs = byCountry.get(country)
    if (!lgs) {
      problems.push(`${code}: 국가 '${country}' 없음`)
      continue
    }
    const hits = lgs.filter((l) => l.name === name)
    if (hits.length === 0) {
      problems.push(`${code}: '${country}/${name}' 없음`)
      continue
    }
    let id = hits[0].id
    if (hits.length > 1) {
      const seen = obs.get(`${country}|${name}`)
      const confirmed = hits.find((h) => seen?.has(h.id))
      if (confirmed) {
        id = confirmed.id
      } else {
        problems.push(
          `${code}: '${country}/${name}' ${hits.length}건 중 실측 확인 불가 — 첫 항목 채택`
        )
      }
    }
    out.push({ code, id, label: `${country} / ${name}`, note })
  }

  // 실측 경기에 등장했는데 매핑에 없는 리그 (참고용)
  const mappedIds = new Set(out.map((o) => o.id))
  const unmapped = [...obs.entries()].filter(([, ids]) => ![...ids].some((i) => mappedIds.has(i)))

  // 정렬 패딩을 넣지 않는다 — prettier 가 걷어내서 재생성마다 diff 가 난다 (멱등 유지)
  const lines = out
    .map((o) => `  ["${o.code}", "${o.id}"], // ${o.label}${o.note ? ` — ${o.note}` : ""}`)
    .join("\n")

  const src = `/**
 * betman league_code → live-football-api 리그 id (2026-08-17).
 *
 * ⚠️ 이 파일은 \`scripts/gen-lfa-leagues.ts\` 가 카탈로그에서 생성한다. 손으로 고치지 말 것 —
 *    32자 해시는 눈으로 검증이 안 된다. 리그를 추가하려면 생성기의 RULES 에 한 줄 넣고 재생성한다.
 *
 * 매핑 키가 (국가, 리그명) 쌍인 이유: 이름만으로는 충돌한다. "Premier League" 는 잉글랜드와
 * 아르헨티나에, "Serie A" 는 이탈리아와 브라질에 둘 다 존재한다. 자국 컵대회는 이름이 그냥
 * "Cup"(코파 이탈리아·쿠프 드 프랑스·DFB 포칼)이고 슈퍼컵은 "Super Cup" 이다.
 */

import { isMatchPageLeague } from "@/lib/match/leagues"

/** betman league_code → LFA league id */
export const LFA_LEAGUE_IDS: ReadonlyMap<string, string> = new Map([
${lines}
])

/**
 * 크레딧 게이트 (2026-08-24 크레딧 30,100 소진 사고 후속).
 *
 * 매핑이 있어도 **매치센터 대상 리그가 아니면 null** — 여기서 null 이면 resolveMatch 가 조기
 * 반환해 경기별 호출(details·lineups·preview)이 통째로 안 나간다. 대상 밖(K/J리그·MLS·
 * 호주·ASEAN·코파·CONCACAF·에레디비지에 등)은 매치 페이지 자체가 없어 크레딧을 쓸 이유가 없다.
 * 일정 페이지 스코어는 날짜 단위 1콜에서 오므로 여기 영향 없음.
 *
 * 기준 목록은 lib/match/leagues.ts 의 화이트리스트 **하나**다 — 여기 복사본을 두지 않는다
 * (2026-09-02: 복사본이 있었고 이미 갈라져 있었다. 시험 리그의 만료도 그쪽이 결정한다).
 * ⚠️ 이 게이트는 생성기 템플릿에 있다 — 종전엔 손으로 덧붙인 것이라 재생성 한 번이면 사라졌다.
 */
export function lfaLeagueId(betmanLeagueCode: string | null | undefined): string | null {
  if (!betmanLeagueCode) return null
  if (!isMatchPageLeague(betmanLeagueCode)) return null
  return LFA_LEAGUE_IDS.get(betmanLeagueCode) ?? null
}

/** LFA 리그 id → betman league_code (역방향 조회) */
export const BETMAN_CODE_BY_LFA_ID: ReadonlyMap<string, string> = new Map(
  [...LFA_LEAGUE_IDS].map(([code, id]) => [id, code])
)
`

  writeFileSync(join(process.cwd(), "lib/lfa/leagues.ts"), src, "utf-8")
  console.log(`✓ lib/lfa/leagues.ts 생성 — ${out.length}개 리그`)
  if (problems.length) {
    console.log(`\n⚠️ 미해결 ${problems.length}건:`)
    for (const p of problems) console.log(`   ${p}`)
  }
  if (unmapped.length) {
    console.log(`\n(참고) 실측 경기에 등장했으나 매핑 대상 아님: ${unmapped.length}개 리그`)
  }
}

main()
