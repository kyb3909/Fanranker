/**
 * 경기 파이프라인 실시간 감시 (일회성 테스트 하네스, 2026-09-04)
 *
 * 한 경기를 골라 킥오프 전후로 각 단계가 실제로 도는지 지켜본다.
 * **변화가 있을 때만** 한 줄 출력한다 — Monitor 도구가 stdout 한 줄을 알림 하나로 쓴다.
 *
 *   pnpm exec tsx scripts/_match-watch.ts                  # 기본: 리버풀 (다음 24h)
 *   MATCH_TEAM=리버풀 POLL_SEC=120 pnpm exec tsx scripts/_match-watch.ts
 *   MATCH_ONCE=1 pnpm exec tsx scripts/_match-watch.ts      # 1회만 찍고 종료 (사후 점검용)
 *
 * 보는 것:
 *   1. betman 상태·스코어 (형제 행 전수 → 비어있지 않은 값 채택)
 *   2. 라인업 저장 (event_id·선발/벤치 수 — 벤치 0 이면 경고: 2026-08-31 subs 오독 재발 신호)
 *   3. 매치 리포트 + 실패 원장(match_report_attempts)
 *   4. 뉴스 유입 (티커·저수지에서 해당 팀 언급)
 *   5. LFA 파이프라인 생존 (마지막 호출 경과·잔여 크레딧)
 *   6. 매치 페이지 HTTP 상태 (10분마다)
 */
import "dotenv/config"
import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 없음")
const db = createClient(url, key, { auth: { persistSession: false } })

const TEAM = process.env.MATCH_TEAM ?? "리버풀"
const POLL_MS = Number(process.env.POLL_SEC ?? 120) * 1000
const ONCE = process.env.MATCH_ONCE === "1"
const SITE = "https://gongnori.fan"

function kst(d: Date = new Date()): string {
  const p = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d)
  return `${p} KST`
}
function say(icon: string, stage: string, msg: string): void {
  console.log(`${kst()} ${icon} [${stage}] ${msg}`)
}

interface Target {
  ids: string[]
  label: string
  kickoff: Date
  homeKr: string
  awayKr: string
}

async function findMatch(): Promise<Target | null> {
  const { data, error } = await db
    .from("betman_games")
    .select("id, game_no, match_time, league_code, home_team_name, away_team_name")
    .gte("match_time", new Date(Date.now() - 6 * 3600_000).toISOString())
    .lte("match_time", new Date(Date.now() + 24 * 3600_000).toISOString())
    .order("match_time")
  if (error) throw new Error(`경기 조회 실패: ${error.message}`)
  const hit = (data ?? []).filter(
    (g) => g.home_team_name?.includes(TEAM) || g.away_team_name?.includes(TEAM)
  )
  if (hit.length === 0) return null
  const first = hit[0]
  const same = hit.filter((g) => g.match_time === first.match_time)
  return {
    ids: same.map((g) => g.id),
    label: `${first.home_team_name} vs ${first.away_team_name} (${first.league_code}, 형제 ${same.length}행)`,
    kickoff: new Date(first.match_time),
    homeKr: String(first.home_team_name),
    awayKr: String(first.away_team_name),
  }
}

/** 형제 행 전수에서 비어있지 않은 값을 고른다 (pick-sibling-row 와 같은 취지) */
function pick<T>(rows: T[], f: (r: T) => unknown): T | undefined {
  return rows.find((r) => f(r) !== null && f(r) !== undefined)
}

type Snap = Record<string, string>

/**
 * LFA 실황 — **라이브·FT 점수의 실제 공급원**.
 *
 * ⚠️ betman 으로 FT 를 재면 안 된다. betman 의 status='completed' 와 스코어는 FT 가 아니라
 *    **회차 정산** 시점에 들어온다 — 최근 10일 실측 킥오프 +22~35시간(EPL 최소 12.6h).
 *    화면의 라이브/FT 는 전적으로 이쪽이다.
 */
async function lfaLive(t: Target): Promise<string | undefined> {
  /**
   * ⚠️ **이 경기의 LFA event id 로 찾는다.**
   * 종전엔 영문 팀명 포함 검색이었고 기본값이 `"Liverpool"` 이라, MATCH_TEAM_EN 을 안 주면
   * 엉뚱한 경기(찰턴 0:4 리버풀)의 스코어를 이 경기 실황으로 보여줬다 — 2026-09-08 우디네세
   * 경기를 보다 실제로 오독했다. 이름 대조는 마지막 수단으로만 남긴다.
   */
  const { data: det } = await db
    .from("match_details_cache")
    .select("lfa_match_id")
    .in("game_id", t.ids)
    .not("lfa_match_id", "is", null)
    .limit(1)
    .maybeSingle()
  const eventId = (det?.lfa_match_id as string | null) ?? null

  /**
   * id 가 아직 없을 때의 대비책 — **두 팀을 모두** 맞춘다.
   * 한 팀만 보면 그 팀의 다른 경기(컵·전날 경기)를 물어온다. 이름이 하나뿐이면
   * 킥오프 시각까지 겹칠 때만 받아들인다.
   */
  const names = [process.env.MATCH_TEAM_EN, ...(await teamNamesEn(t))].filter(
    (v): v is string => !!v && v.length > 1
  )
  if (!eventId && names.length === 0) return "⚠️매치 id 도 영문 팀명도 없어 실황을 못 고름"

  const today = new Date().toISOString().slice(0, 10)
  const yday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10)
  const { data } = await db.from("lfa_day_cache").select("date_utc, payload").in("date_utc", [yday, today])
  type Ev = {
    id: string
    kickoff?: string | null
    home: { name: string; score: string | null }
    away: { name: string; score: string | null }
    status: { status: string; display: string; is_live: boolean }
  }
  const has = (side: string | undefined, en: string) =>
    !!side && side.toLowerCase().includes(en.toLowerCase())
  /** 이 경기 킥오프와 90분 안이면 같은 경기로 본다 (LFA 시각 표기가 조금씩 흔들린다) */
  const nearKickoff = (e: Ev) => {
    if (!e.kickoff) return false
    const d = Math.abs(new Date(e.kickoff).getTime() - t.kickoff.getTime())
    return Number.isFinite(d) && d <= 90 * 60_000
  }

  for (const row of data ?? []) {
    const evs = (row.payload as Ev[]) ?? []
    let hit: Ev | undefined
    if (eventId) {
      hit = evs.find((e) => e.id === eventId)
    } else {
      // ① 두 팀이 다 맞는 경기 (양쪽 방향 모두 허용)
      hit = evs.find((e) =>
        names.some(
          (a) =>
            names.some(
              (b) => a !== b && ((has(e.home?.name, a) && has(e.away?.name, b)) || (has(e.home?.name, b) && has(e.away?.name, a)))
            )
        )
      )
      // ② 이름이 하나뿐이면 킥오프까지 겹쳐야 받는다
      if (!hit) {
        hit = evs.find((e) => names.some((a) => has(e.home?.name, a) || has(e.away?.name, a)) && nearKickoff(e))
      }
    }
    if (hit) {
      const how = eventId ? "" : " (id 없음 — 이름·킥오프로 추정)"
      return `${hit.home.name} ${hit.home.score ?? "-"}:${hit.away.score ?? "-"} ${hit.away.name} [${hit.status.display}/${hit.status.status}] event=${hit.id}${how}`
    }
  }
  return undefined
}

/** 이 경기 두 팀의 영문명 (사전) — 한쪽만 등재돼 있어도 그것만 돌려준다 */
async function teamNamesEn(t: Target): Promise<string[]> {
  const { data } = await db
    .from("team_dictionary")
    .select("name_kr, name_en")
    .in("name_kr", [t.homeKr, t.awayKr])
    .not("name_en", "is", null)
  return (data ?? []).map((r) => String(r.name_en))
}

async function snapshot(t: Target, startIso: string, heavy: boolean): Promise<Snap> {
  const s: Snap = {}

  const { data: games } = await db
    .from("betman_games")
    .select("status, home_score, away_score")
    .in("id", t.ids)
  if (games?.length) {
    s.status = [...new Set(games.map((g) => g.status))].sort().join("/")
    // betman 스코어는 정산 산물이라 FT 판정에 쓰지 않는다 (위 lfaLive 주석 참조)
    const sc = pick(games, (g) => (g as { home_score: number | null }).home_score)
    s.betman정산 = sc ? `${sc.home_score}-${sc.away_score}` : "미정산(정상 — 킥오프 +12~35h)"
  }

  if (heavy) {
    const live = await lfaLive(t)
    s.LFA실황 = live ?? "⚠️LFA 목록에서 못 찾음"
  }

  const { data: lus } = await db
    .from("match_lineups")
    .select("event_id, payload, created_at")
    .in("game_id", t.ids)
  if (lus?.length) {
    const p = lus[0].payload as {
      home?: { starters?: unknown[]; bench?: unknown[] }
      away?: { starters?: unknown[]; bench?: unknown[] }
    }
    const n = (x?: unknown[]) => x?.length ?? 0
    s.lineup = `event=${lus[0].event_id} 선발 ${n(p.home?.starters)}/${n(p.away?.starters)} 벤치 ${n(p.home?.bench)}/${n(p.away?.bench)}`
  } else {
    s.lineup = "없음"
  }

  const { data: reps } = await db.from("match_reports").select("title").in("game_id", t.ids)
  s.report = reps?.length ? `있음: ${reps[0].title}` : "없음"

  const { data: att } = await db
    .from("match_report_attempts")
    .select("stage, reason, attempted_at")
    .in("game_id", t.ids)
    .order("attempted_at", { ascending: false })
    .limit(1)
  if (att?.length) s.attempt = `${att[0].stage} — ${att[0].reason ?? ""}`.trim()

  const { data: tk } = await db
    .from("news_ticker_items")
    .select("headline_kr, original_title")
    .gte("created_at", startIso)
  const kw = [TEAM, "liverpool", "ipswich", "입스위치"]
  const hits = (tk ?? []).filter((r) =>
    kw.some((k) => `${r.headline_kr ?? ""} ${r.original_title ?? ""}`.toLowerCase().includes(k.toLowerCase()))
  )
  s.news = `티커 신규 ${tk?.length ?? 0}건 (해당팀 ${hits.length}건)`

  const { data: lfa } = await db
    .from("lfa_usage_log")
    .select("called_at, credits_remaining")
    .order("called_at", { ascending: false })
    .limit(1)
  if (lfa?.length) {
    // ⚠️ 경과 분을 그대로 넣으면 폴링마다 값이 바뀌어 매번 알림이 울린다.
    //    "살아있음/정체" 두 상태로만 접는다.
    const mins = Math.round((Date.now() - new Date(lfa[0].called_at).getTime()) / 60000)
    s.lfa = mins > 45 ? `⚠️정체 — 마지막 호출 ${Math.floor(mins / 15) * 15}분 이상 전` : "살아있음"
  }

  return s
}

async function checkPage(id: string): Promise<string> {
  try {
    const res = await fetch(`${SITE}/match/${id}`, { cache: "no-store" })
    return `${res.status}`
  } catch (e) {
    return `실패(${e instanceof Error ? e.message : String(e)})`
  }
}

async function main(): Promise<void> {
  const t = await findMatch()
  if (!t) {
    say("❌", "대상", `"${TEAM}" 경기를 다음 24시간 안에서 못 찾음`)
    return
  }
  const startIso = new Date().toISOString()
  say("▶", "시작", `${t.label} · 킥오프 ${kst(t.kickoff)} · 폴링 ${POLL_MS / 1000}초`)

  let prev: Snap = {}
  let lastPage = 0
  let lastBeat = Date.now()
  let lastHeavy = 0

  for (;;) {
    try {
      // LFA 목록은 하루치 전체(수백 KB)라 15분마다만 훑는다 — lfa-warm 주기와 같다
      const heavy = ONCE || Date.now() - lastHeavy > 15 * 60_000
      if (heavy) lastHeavy = Date.now()
      const cur = await snapshot(t, startIso, heavy)
      for (const [k, v] of Object.entries(cur)) {
        if (prev[k] === v) continue
        const warn =
          v.includes("⚠️") ||
          (k === "lineup" && v.includes("벤치 0/0")) ||
          (k === "attempt" && !v.startsWith("published"))
        say(warn ? "⚠️" : "✅", k, v)
      }
      // 무거운 검사는 15분마다만 도니, 빠진 키는 이전 값을 이어받는다
      // (덮어쓰면 다음 회차에 같은 값이 "변화"로 잡혀 알림이 두 번 울린다)
      prev = { ...prev, ...cur }

      if (Date.now() - lastPage > 10 * 60_000) {
        lastPage = Date.now()
        const code = await checkPage(t.ids[0])
        if (code !== "200") say("⚠️", "page", `/match/${t.ids[0]} → ${code}`)
      }

      if (Date.now() - lastBeat > 30 * 60_000) {
        lastBeat = Date.now()
        say("·", "heartbeat", `${prev.LFA실황 ?? "LFA ?"} / 라인업 ${prev.lineup ?? "?"} / 리포트 ${prev.report ?? "?"}`)
      }
    } catch (e) {
      say("⚠️", "watch", `폴링 실패(계속함): ${e instanceof Error ? e.message : String(e)}`)
    }
    if (ONCE) return
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
}

void main()
