#!/usr/bin/env node
/**
 * Betman 핸디캡 매핑 진단 도구
 *
 * stuck 된 in_progress 핸디캡 게임의 winrstDetl 응답을 직접 받아서
 * vps-betman-scraper.ts 의 buildMatchKey() 가 일반/핸디캡 row 사이에서
 * 매칭 실패하는지 (= stuck 의 원인 가설) 직접 검증한다.
 *
 * 사용법:
 *   pnpm exec tsx scripts/diagnose-betman-handi-mapping.ts            # 가장 최근 stuck 자동
 *   pnpm exec tsx scripts/diagnose-betman-handi-mapping.ts <game_id>  # 특정 게임 강제
 *
 * 한국 IP 에서만 동작 (betman.co.kr 차단). 사용자 로컬에서 실행할 것.
 */

import "dotenv/config"
import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("환경변수 누락: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const BETMAN_BASE = "https://www.betman.co.kr"
const GM_ID = "G101"

const HANDI_NAMES: Record<number, string> = {
  0: "일반",
  2: "핸디캡",
  5: "SUM",
  6: "S핸디캡",
  7: "S언더오버",
  9: "언더오버",
  14: "일반",
}

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
  "X-Requested-With": "XMLHttpRequest",
  Origin: BETMAN_BASE,
}

interface ResultItem {
  GAME_RESULT: string
  GM_SEQ: number
  MCH_SCORE: string
  HANDI_VAL: number
  HOME_TEAM: string
  AWAY_TEAM: string
  FIX_MCH_DTM?: string
}

// vps-betman-scraper.ts 와 동일한 키 생성 로직.
function buildMatchKey(item: Pick<ResultItem, "HOME_TEAM" | "AWAY_TEAM" | "FIX_MCH_DTM">): string {
  const base = `${item.HOME_TEAM.trim()}|${item.AWAY_TEAM.trim()}`
  return item.FIX_MCH_DTM ? `${base}|${item.FIX_MCH_DTM}` : base
}

async function fetchWinrstDetl(gmTs: string): Promise<ResultItem[] | null> {
  await fetch(`${BETMAN_BASE}/main/mainPage/gamebuy/winrstDetl.do?gmId=${GM_ID}&gmTs=${gmTs}`, {
    headers: { "User-Agent": BROWSER_HEADERS["User-Agent"] },
  }).catch(() => {})

  const resp = await fetch(`${BETMAN_BASE}/gamebuy/winrst/inqWinrstDetlBody.do`, {
    method: "POST",
    headers: {
      ...BROWSER_HEADERS,
      "Content-Type": "application/json;charset=UTF-8",
      Referer: `${BETMAN_BASE}/main/mainPage/gamebuy/winrstDetl.do?gmId=${GM_ID}&gmTs=${gmTs}`,
    },
    body: JSON.stringify({
      gmId: GM_ID,
      gmTs: Number(gmTs),
      _sbmInfo: { _sbmInfo: { debugMode: "false" } },
    }),
  })

  if (!resp.ok) {
    console.error(`betman API 실패: HTTP ${resp.status}`)
    return null
  }

  const data = await resp.json()
  const items = data?.detlBody
  if (!Array.isArray(items)) return null
  return items as ResultItem[]
}

async function pickTargetGame(targetId?: string) {
  if (targetId) {
    const { data, error } = await supabase
      .from("betman_games")
      .select(
        "id, game_no, sport, game_type, home_team_name, away_team_name, match_time, round_id, status, result"
      )
      .eq("id", targetId)
      .single()
    if (error || !data) {
      console.error("게임 조회 실패:", error)
      process.exit(1)
    }
    return data
  }

  const { data, error } = await supabase
    .from("betman_games")
    .select(
      "id, game_no, sport, game_type, home_team_name, away_team_name, match_time, round_id, status, result"
    )
    .eq("status", "in_progress")
    .is("result", null)
    .eq("game_type", "핸디캡")
    .order("match_time", { ascending: false })
    .limit(1)
    .single()

  if (error || !data) {
    console.error("최근 stuck 핸디캡 게임 없음:", error)
    process.exit(1)
  }
  return data
}

async function main() {
  const game = await pickTargetGame(process.argv[2])

  console.log("=== 진단 대상 ===")
  console.log(`game_id      : ${game.id}`)
  console.log(`종목/타입    : ${game.sport} / ${game.game_type}`)
  console.log(`매치         : ${game.home_team_name} vs ${game.away_team_name}`)
  console.log(`match_time   : ${game.match_time}`)
  console.log(`status/result: ${game.status} / ${game.result ?? "NULL"}`)
  console.log()

  const { data: round } = await supabase
    .from("betman_rounds")
    .select("gm_ts")
    .eq("id", game.round_id)
    .single()
  if (!round) {
    console.error("round 조회 실패")
    process.exit(1)
  }

  console.log(`round.gm_ts: ${round.gm_ts}`)
  console.log()

  console.log("=== betman winrstDetl 호출 중... ===")
  const items = await fetchWinrstDetl(round.gm_ts)
  if (!items || items.length === 0) {
    console.log("⚠️  응답이 비어있거나 detlBody 없음 → 라운드 만료/누락 가능성")
    process.exit(0)
  }
  console.log(`총 ${items.length} row 응답`)
  console.log()

  const homeName = (game.home_team_name ?? "").trim()
  const awayName = (game.away_team_name ?? "").trim()

  const matchedRows = items.filter((it) => {
    const h = (it.HOME_TEAM ?? "").trim()
    const a = (it.AWAY_TEAM ?? "").trim()
    return (
      (h.includes(homeName) || homeName.includes(h)) &&
      (a.includes(awayName) || awayName.includes(a))
    )
  })

  if (matchedRows.length === 0) {
    console.log("🚨 결론: betman 응답에 동일 매치 row 자체가 없음")
    console.log(
      "   → winrstDetl 응답에서 해당 경기가 빠진 케이스 (라운드 만료 또는 betman 측 누락)"
    )
    console.log("   → 매핑 결함 아님. pending-results days 제한 확장 또는 manual cancel 필요.")
    console.log()
    console.log("응답 샘플 5건 (실제 어떤 매치들이 있는지):")
    items
      .slice(0, 5)
      .forEach((it, i) =>
        console.log(
          `  ${i + 1}. [${it.HANDI_VAL}=${HANDI_NAMES[it.HANDI_VAL] ?? "?"}] ${it.HOME_TEAM} vs ${it.AWAY_TEAM} @${it.FIX_MCH_DTM ?? "-"}`
        )
      )
    return
  }

  console.log(`=== 동일 매치 row ${matchedRows.length}건 ===`)
  for (const row of matchedRows) {
    const typeName = HANDI_NAMES[row.HANDI_VAL] ?? `?(${row.HANDI_VAL})`
    console.log(`[HANDI_VAL=${row.HANDI_VAL} / ${typeName}]`)
    console.log(`  HOME_TEAM    : "${row.HOME_TEAM}"`)
    console.log(`  AWAY_TEAM    : "${row.AWAY_TEAM}"`)
    console.log(`  FIX_MCH_DTM  : ${row.FIX_MCH_DTM ?? "(없음)"}`)
    console.log(`  GAME_RESULT  : "${row.GAME_RESULT}", MCH_SCORE: "${row.MCH_SCORE}"`)
    console.log(`  buildMatchKey: ${buildMatchKey(row)}`)
  }
  console.log()

  const normalRow = matchedRows.find((r) => HANDI_NAMES[r.HANDI_VAL] === "일반")
  const handiRow = matchedRows.find((r) => HANDI_NAMES[r.HANDI_VAL] === "핸디캡")

  console.log("=== 매핑 시뮬레이션 (buildMatchKey 기준) ===")

  if (!normalRow) {
    console.log(
      "❌ 일반(HANDI_VAL=0/14) row 없음 → actualScoreMap 자체가 비어 핸디캡 점수 매핑 불가"
    )
  }
  if (!handiRow) {
    console.log("❌ 핸디캡(HANDI_VAL=2) row 없음 → 핸디캡 결과 자체가 응답에 없음")
  }

  if (normalRow && handiRow) {
    const normalKey = buildMatchKey(normalRow)
    const handiKey = buildMatchKey(handiRow)
    console.log()
    console.log(`일반 key  : "${normalKey}"`)
    console.log(`핸디캡 key: "${handiKey}"`)

    if (normalKey === handiKey) {
      console.log()
      console.log("🎯 매칭 ✅ — score map 매핑은 정상.")
      console.log(
        "   → stuck 원인은 buildMatchKey 가 아님. GAME_RESULT 빈 값 또는 다른 매핑 로직 점검 필요."
      )
      if (handiRow.GAME_RESULT === "" || handiRow.GAME_RESULT == null) {
        console.log(
          `   ⚠️ 단, 핸디캡 row 의 GAME_RESULT 가 비어있음 → mapped.result === "" 로 continue 됨`
        )
      }
    } else {
      console.log()
      console.log("🚨 매칭 ❌ — 핸디캡 매핑 결함 가설 확정")
      const diffs: string[] = []
      if (normalRow.HOME_TEAM.trim() !== handiRow.HOME_TEAM.trim())
        diffs.push(`HOME_TEAM 불일치 ("${normalRow.HOME_TEAM}" ≠ "${handiRow.HOME_TEAM}")`)
      if (normalRow.AWAY_TEAM.trim() !== handiRow.AWAY_TEAM.trim())
        diffs.push(`AWAY_TEAM 불일치 ("${normalRow.AWAY_TEAM}" ≠ "${handiRow.AWAY_TEAM}")`)
      if (normalRow.FIX_MCH_DTM !== handiRow.FIX_MCH_DTM)
        diffs.push(`FIX_MCH_DTM 불일치 ("${normalRow.FIX_MCH_DTM}" ≠ "${handiRow.FIX_MCH_DTM}")`)
      console.log(`   차이: ${diffs.join("; ")}`)
      console.log(
        "   → vps-betman-scraper.ts 의 buildMatchKey 를 normalize (예: 팀명 prefix 매칭) 또는 GM_SEQ 기반 키로 변경 필요."
      )
    }
  }
}

main().catch((e) => {
  console.error("진단 실패:", e)
  process.exit(1)
})
