/**
 * 리딩 무대 배경 — 질문 속 팀을 실제 경기 일정에 연결한다.
 *
 * ## 왜 "일정"만 주입하나 (2026-08-13 설계 결정)
 * 목표는 정확한 예측이 아니라 **"루나가 축구를 아는 느낌"**이다. 최근 폼·순위·부상을
 * 넣는 순간 출력이 전력 분석문이 되고, 화면 하단 상시 고지("경기 결과를 예측하지
 * 않으며")와 실제 동작이 모순된다 — 카카오 심사 소명과 정면 충돌. 그래서 주입은
 * 날짜·대회·홈/원정·구장까지만, 외부 검색 없이 내부 betman_games 로만 한다.
 *
 * ## 매칭이 관대할 수 없는 이유
 * betman 팀명은 라운드마다 표기가 흔들린다("맨체스U" ↔ "맨체스터 유나이티드" ↔
 * "맨체스터유나이티드"). 그래서 두 갈래로 잡는다:
 *   1. 전체 팀명 부분일치 — 질문에 DB 표기 전체가 그대로 들어있는 경우 (리버풀, 토트넘)
 *   2. 별칭 사전 — 유저 표기(맨유, 아스날)와 DB 축약(맨체스U)이 다른 인기 구단만 수동 등록
 * 못 잡으면 그냥 배경 없이 리딩한다 — 틀린 무대를 세우는 것보다 낫다(fail-open).
 */
import type { SupabaseClient } from "@supabase/supabase-js"

export interface FixtureRow {
  home_team_name: string
  away_team_name: string
  match_time: string
  sport: string | null
  league_code: string | null
  venue: string | null
}

/** 공백·구분 기호를 지운 소문자 — betman 표기 흔들림('브라이턴&호브 앨비언')을 흡수 */
function norm(s: string): string {
  return s.toLowerCase().replace(/[\s&·.\-]/g, "")
}

/**
 * 유저 표기(q) ↔ DB 표기 프리픽스(db)가 다른 구단만 등록한다.
 * 전체 팀명이 질문에 그대로 나오는 구단(리버풀·첼시 등)은 여기 없어도 잡힌다.
 * ⚠️ 한 글자·범용 단어 별칭 금지 — "밀란"은 인터 밀란 질문에도 걸리므로 뺐다.
 */
const TEAM_ALIASES: { q: string[]; db: string[] }[] = [
  { q: ["맨유", "맨체스터유나이티드", "맨유나이티드"], db: ["맨체스터유나이티드", "맨체스u"] },
  { q: ["맨시티", "맨체스터시티"], db: ["맨체스터시티", "맨체스c"] },
  { q: ["아스날", "아스널"], db: ["아스널"] },
  { q: ["토트넘", "스퍼스"], db: ["토트넘"] },
  { q: ["울버햄프턴", "울버햄튼", "울브스"], db: ["울버햄프"] },
  { q: ["애스턴빌라", "아스톤빌라"], db: ["애스턴빌라", "a빌라"] },
  { q: ["브라이턴", "브라이튼"], db: ["브라이턴"] },
  { q: ["본머스"], db: ["본머스", "afc본머스"] },
  { q: ["레알마드리드", "레알"], db: ["레알마드리"] },
  { q: ["바르셀로나", "바르사"], db: ["바르셀로나", "fc바르셀로나"] },
  { q: ["아틀레티코마드리드", "아틀레티코"], db: ["아틀레티코", "at마드리드"] },
  { q: ["바이에른뮌헨", "바이에른", "바이언"], db: ["바이에른"] },
  { q: ["파리생제르맹", "psg"], db: ["파리생제르", "psg"] },
  { q: ["도르트문트", "돌문"], db: ["도르트문", "보루시아도르트문트"] },
  { q: ["유벤투스", "유베"], db: ["유벤투스"] },
  // NBA — betman 은 4자 축약(보스셀틱·골든워리)이 흔하다. 프리픽스는 실측 DB 표기 기준.
  // ⚠️ 야구와 도시명이 겹치는 팀(클리블랜드·미네소타 등)은 도시명 프리픽스 금지 —
  //    구단명까지 포함한 프리픽스만 써서 다른 종목 row 에 안 걸리게 한다.
  { q: ["레이커스"], db: ["la레이커"] },
  { q: ["클리퍼스"], db: ["la클리퍼"] },
  { q: ["골든스테이트", "워리어스", "골스"], db: ["골든워리", "골든스테이트"] },
  { q: ["셀틱스"], db: ["보스셀틱", "보스턴셀틱"] },
  { q: ["밀워키", "벅스"], db: ["밀워벅스", "밀워키벅스"] },
  { q: ["오클라호마", "썬더"], db: ["오클썬더", "오클라호마"] },
  { q: ["덴버", "너게츠", "너기츠"], db: ["덴버너게"] },
  { q: ["댈러스", "매버릭스"], db: ["댈러매버", "댈러스매버릭스"] },
  { q: ["샌안토니오", "스퍼스"], db: ["샌안스퍼", "샌안토니오"] },
  { q: ["캐벌리어스", "캐브스"], db: ["클리블랜드캐벌"] },
  { q: ["미네소타", "팀버울브스"], db: ["미네울브", "미네소타팀버"] },
  { q: ["마이애미"], db: ["마이히트", "마이애미히트"] },
  { q: ["시카고불스", "불스"], db: ["시카불스", "시카고불스"] },
  { q: ["피닉스", "선즈"], db: ["피닉"] },
  { q: ["휴스턴", "로케츠"], db: ["휴스로케", "휴스턴로케츠"] },
]

/**
 * 질문이 이 DB 팀명을 가리키는가.
 * 반환은 매칭 강도 — 전체 팀명 일치(2)가 별칭(1)보다 세다. "레알 이길까?"가
 * 레알 소시에다드 경기(전체명 일치)와 레알 마드리드 별칭에 동시에 걸릴 때
 * 전체명이 이기게 하기 위한 장치다.
 */
function teamMatchScore(questionNorm: string, dbName: string): number {
  const dbNorm = norm(dbName)
  if (dbNorm.length >= 2 && questionNorm.includes(dbNorm)) return 2
  for (const { q, db } of TEAM_ALIASES) {
    if (db.some((p) => dbNorm.startsWith(norm(p))) && q.some((a) => questionNorm.includes(norm(a))))
      return 1
  }
  return 0
}

function kstDateString(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(d)
}

/**
 * 질문 속 날짜 힌트 → KST "YYYY-MM-DD". 없으면 null.
 * "9월 17일" / 오늘 / 내일 / 모레만 v1 — 그 외 표현은 힌트 없음으로 취급해
 * "가장 가까운 경기" 규칙에 맡긴다.
 */
export function parseDateHint(question: string, now: Date): string | null {
  const md = question.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/)
  if (md) {
    const [y, m] = kstDateString(now).split("-").map(Number)
    const month = Number(md[1])
    const day = Number(md[2])
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    // 이미 지난 월일이면 내년 얘기로 본다 (연말 → 연초 질문)
    const year = month < m || (month === m && day < Number(kstDateString(now).slice(8))) ? y + 1 : y
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  }
  const rel = question.includes("모레") ? 2 : question.includes("내일") ? 1 : null
  if (rel !== null) return kstDateString(new Date(now.getTime() + rel * 86400_000))
  if (question.includes("오늘")) return kstDateString(now)
  return null
}

interface MatchedFixture {
  home: string
  away: string
  kickoffIso: string
  league: string | null
  venue: string | null
}

/**
 * 후보 경기들에서 질문에 맞는 한 경기를 고른다. 없으면 null.
 * 우선순위: 두 팀 다 언급 > 매칭 강도 > 킥오프 가까운 순.
 * 날짜를 콕 집었는데 그 날짜에 경기가 없으면 null — 다른 날 경기를 무대로
 * 세우면 루나가 엉뚱한 경기 얘기를 하게 된다.
 */
export function selectFixture(
  question: string,
  rows: FixtureRow[],
  now: Date
): MatchedFixture | null {
  const qNorm = norm(question)
  const dateHint = parseDateHint(question, now)

  // 같은 경기가 마켓(일반/핸디캡/언더오버)마다 별도 row 라 매치 단위로 접는다
  const seen = new Set<string>()
  const candidates: { row: FixtureRow; score: number }[] = []
  for (const row of rows) {
    const key = `${row.home_team_name}_${row.away_team_name}_${row.match_time}`
    if (seen.has(key)) continue
    seen.add(key)
    const score =
      teamMatchScore(qNorm, row.home_team_name) + teamMatchScore(qNorm, row.away_team_name)
    if (score > 0) candidates.push({ row, score })
  }
  if (candidates.length === 0) return null

  const pool = dateHint
    ? candidates.filter((c) => kstDateString(new Date(c.row.match_time)) === dateHint)
    : candidates
  if (pool.length === 0) return null

  pool.sort(
    (a, b) =>
      b.score - a.score ||
      new Date(a.row.match_time).getTime() - new Date(b.row.match_time).getTime()
  )
  const best = pool[0].row
  return {
    home: best.home_team_name,
    away: best.away_team_name,
    kickoffIso: best.match_time,
    league: leagueLabel(best.league_code),
    venue: best.venue,
  }
}

/** betman league_code → 사람이 읽는 대회명. 모르는 코드·식별자성 코드는 숨긴다. */
function leagueLabel(code: string | null): string | null {
  if (!code) return null
  const MAP: Record<string, string> = {
    EPL: "프리미어리그",
    UCL: "챔피언스리그",
    UEL: "유로파리그",
    EFL챔: "EFL 챔피언십",
    라리가: "라리가",
    세리에A: "세리에 A",
    분데스리: "분데스리가",
    에레디비: "에레디비시",
    프리그1: "리그 1",
    K리그1: "K리그1",
    K리그2: "K리그2",
    J1리그: "J1리그",
    MLS: "MLS",
    코파리베: "코파 리베르타도레스",
    축월드컵: "월드컵",
  }
  if (MAP[code]) return MAP[code]
  // "56", "c8" 같은 내부 식별자는 무대 배경으로 못 쓴다
  return /^[0-9a-z]+$/i.test(code) ? null : code
}

/** 프롬프트에 넣는 한 줄 — 일정 사실만, 전력 정보 없음 */
export function formatFixtureLine(f: MatchedFixture): string {
  const when = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(f.kickoffIso))
  const parts = [`${when} 킥오프`, f.league, `${f.home}(홈) vs ${f.away}(원정)`, f.venue]
  return `- ${parts.filter(Boolean).join(" · ")}`
}

/**
 * 질문 → 무대 배경 한 줄. 매칭 실패·조회 실패 모두 null (리딩은 배경 없이 성립).
 * 향후 10일 창 — betman 은 발매 회차 단위라 그보다 먼 경기는 어차피 없다.
 */
export async function findFixtureLine(
  supabase: SupabaseClient,
  question: string,
  now: Date
): Promise<string | null> {
  const end = new Date(now.getTime() + 10 * 86400_000)
  const { data, error } = await supabase
    .from("betman_games")
    .select("home_team_name, away_team_name, match_time, sport, league_code, venue")
    .eq("status", "scheduled")
    .neq("home_team_name", "미정")
    .neq("away_team_name", "미정")
    .gt("match_time", now.toISOString())
    .lte("match_time", end.toISOString())
    .order("match_time", { ascending: true })
    .limit(400)
  if (error || !data) return null
  const fixture = selectFixture(question, data as FixtureRow[], now)
  return fixture ? formatFixtureLine(fixture) : null
}
