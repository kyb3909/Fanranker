/**
 * 스쿼드 적재 — live-football-api 판 (2026-08-18 운영자: "데이터 피드를 구매했으니 그걸로").
 *
 * ## 왜 필요한가
 * `team_squads` 로스터는 soccerway 스쿼드 페이지에서 왔는데 구멍이 크다 — 데포르티보가
 * 19명(오바메양·레오 로만·앙헬리뇨 누락), 비야레알이 17명이다. 그래서 매치 페이지에서
 * 득점자가 영문으로 남았다. LFA `team_squad` 는 같은 팀을 29명으로 주고, 이름도 축약 없이
 * 온다 ("Luiz Lúcio Reis Júnior").
 *
 * ## 안전 규율
 * - **기존 행을 건드리지 않는다.** 이름 토큰이 겹치는 선수는 이미 있는 것으로 보고 건너뛴다
 *   (중복 행이 생기면 한글화가 "후보 2명" 으로 판정해 오히려 이름이 안 나온다).
 * - 새 행은 `name_kr = null`, `source = 'lfa'` 로만 넣는다. 한글 표기는 나무위키 수확기와
 *   운영자 CSV 의 몫이다 — 여기서 발음을 지어내지 않는다.
 * - `--apply` 없이는 CSV 만 낸다.
 *
 * 실행:
 *   pnpm exec tsx scripts/import-squads-lfa.ts --backfill-teams --apply   # ① 팀 id 채우기
 *   pnpm exec tsx scripts/import-squads-lfa.ts                            # ② 미리보기(CSV)
 *   pnpm exec tsx scripts/import-squads-lfa.ts --apply                    # ③ 반영
 */
import "dotenv/config"
import { writeFileSync } from "fs"
import { createClient } from "@supabase/supabase-js"

const APPLY = process.argv.includes("--apply")
const BACKFILL_TEAMS = process.argv.includes("--backfill-teams")
const outArg = process.argv.find((a) => a.startsWith("--out="))
const OUT = outArg ? outArg.slice(6) : "workspace/squad-lfa-new.csv"

const BASE = "https://live-football-api.com/api/v1"
const KEY = process.env.LIVE_FOOTBALL_API_KEY

async function lfa<T>(endpoint: string, params: Record<string, string>): Promise<T | null> {
  if (!KEY) throw new Error("LIVE_FOOTBALL_API_KEY 없음")
  const qs = new URLSearchParams({ ...params, api_key: KEY })
  // ⚠️ matches 는 하루 800경기 913KB 라 LFA 서버 캐시가 비면 46초까지 간다 (2026-08-24 실측).
  //    20초로 끊으면 과거 날짜는 전부 실패하고 팀 id 백필이 통째로 빈다.
  const res = await fetch(`${BASE}/${endpoint}?${qs}`, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) return null
  const json = (await res.json()) as { success?: boolean; data?: T }
  return json.success ? (json.data ?? null) : null
}

/** 이름 대조용 토큰 — 발음기호·구두점 제거, 3글자 이상만 */
function tokens(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3)
}

/**
 * 이미 있는 선수인가 — **토큰이 하나라도 강하게 겹치면** 있는 것으로 본다.
 * 표기 순서가 다르다 (우리 "Aubameyang Pierre" / LFA "Pierre-Emerick Aubameyang").
 * 애매하면 "있다" 쪽으로 기운다 — 중복 행이 생기면 한글화가 통째로 막히기 때문이다.
 */
function alreadyHave(lfaName: string, existing: string[][]): boolean {
  const a = tokens(lfaName)
  if (a.length === 0) return true
  return existing.some((b) => {
    const shared = a.filter((t) => b.includes(t))
    if (shared.length === 0) return false
    // 한 토큰만 겹치면 성이 같은 남일 수 있다 — 4글자 이상 토큰이어야 동일인으로 본다
    return shared.length >= 2 || shared.some((t) => t.length >= 6)
  })
}

/**
 * 1군이 아닌 팀 — 유스·여자·리저브, 그리고 `(K)` 변종.
 *
 * LFA 목록에는 이들이 같은 이름 뿌리로 섞여 있어 **동점**을 만들고, 그 동점 때문에 1군이
 * 통째로 안 붙었다 (2026-08-24: 첼시·빌라·리버풀·토트넘·본머스가 전부 이것 때문에 공백).
 * `(K)` 는 같은 구단이 한 벌 더 실려 오는 것이라 토큰이 완전히 같아 정확일치로도 못 가른다
 * — 접미사 없는 쪽이 실제 경기에 쓰이므로 변종을 버린다.
 */
const NON_SENIOR =
  /\(k\)|\b(u\s?-?\s?\d{2}|under\s?\d{2}|women|womens|ladies|fem(?:enin\w*)?|feminin\w*|reserves?|youth|academy|juniors?|jugend|primavera|castilla|atl[eè]tic\b|ii|b)\b|\s(?:ii|b)$/i

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

interface LfaSquadPlayer {
  id?: string
  name?: string
  number?: string | number | null
  position?: string | null
}

const csvCell = (v: unknown) => {
  const s = String(v ?? "")
  return /[",\n]/.test(s) ? JSON.stringify(s) : s
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const { data: dict } = await supabase
    .from("team_dictionary")
    .select("soccerway_team_id, name_kr, name_en, lfa_team_id")
    .neq("status", "rejected")
  const teams = dict ?? []

  /* ── ① LFA 팀 id 백필 — 날짜별 경기 목록에 팀 id 가 같이 온다 ── */
  if (BACKFILL_TEAMS) {
    const seen = new Map<string, string>() // lfa team name → lfa id
    const today = new Date()
    for (let d = -30; d <= 7; d++) {
      const day = new Date(today.getTime() + d * 86400000).toISOString().slice(0, 10)
      const data = await lfa<{
        matches?: { home?: { id?: string; name?: string }; away?: { id?: string; name?: string } }[]
      }>("matches", { date: day, lang: "en" })
      for (const m of data?.matches ?? []) {
        for (const side of [m.home, m.away]) {
          if (side?.id && side.name) seen.set(side.name, side.id)
        }
      }
    }
    console.log(`LFA 팀 ${seen.size}개 수집 (최근 30일 + 향후 7일)`)

    let filled = 0
    for (const t of teams) {
      if (t.lfa_team_id || !t.name_en) continue
      const a = tokens(String(t.name_en))
      if (a.length === 0) continue
      // 정확일치를 접두일치보다 높게 — "Ath." 가 "AEK Athens" 에 붙는 사고를 막는다
      let best = 0
      let hits: { name: string; id: string }[] = []
      for (const [lfaName, id] of seen) {
        if (NON_SENIOR.test(lfaName)) continue
        const b = tokens(lfaName)
        const score = a.reduce(
          (sum, x) =>
            sum +
            (b.includes(x)
              ? 2
              : x.length >= 4 && b.some((y) => y.startsWith(x) || x.startsWith(y))
                ? 1
                : 0),
          0
        )
        if (score === 0) continue
        if (score > best) {
          best = score
          hits = []
        }
        if (score === best) hits.push({ name: lfaName, id })
      }
      // 동점이면 **전체 이름이 그대로 같은** 후보 하나로 좁힌다 (2026-08-24: 7,586개 중
      // "Aston Villa" 가 유스·여자팀과 동점이라 EPL 이 통째로 안 붙고 있었다).
      if (hits.length > 1) {
        const exact = hits.filter((h) => tokens(h.name).join(" ") === a.join(" "))
        if (exact.length === 1) hits = exact
      }
      if (hits.length !== 1) continue
      // 붙는 대상을 반드시 눈으로 볼 수 있게 — 엉뚱한 id 하나가 남의 선수단을 통째로 넣는다
      console.log(`    ${String(t.name_kr).padEnd(20)} ← ${hits[0].name}`)
      if (APPLY) {
        const { error } = await supabase
          .from("team_dictionary")
          .update({ lfa_team_id: hits[0].id })
          .eq("soccerway_team_id", t.soccerway_team_id)
        if (error) continue
      }
      filled++
    }
    console.log(`lfa_team_id ${filled}팀 ${APPLY ? "반영" : "매칭(드라이런)"}`)
    if (!APPLY) return
  }

  /* ── ② 팀별 스쿼드 적재 ── */
  const { data: fresh } = await supabase
    .from("team_dictionary")
    .select("soccerway_team_id, name_kr, lfa_team_id")
    .not("lfa_team_id", "is", null)
    .neq("status", "rejected")
  const targets = fresh ?? []
  console.log(`\nLFA 스쿼드 대상 ${targets.length}팀`)

  const rows: Record<string, string | number>[] = []
  let added = 0
  for (const t of targets) {
    const data = await lfa<{ squad?: LfaSquadPlayer[] }>("team_squad", {
      team_id: String(t.lfa_team_id),
      lang: "en",
    })
    const squad = (data?.squad ?? []).filter((p) => p.id && p.name)
    if (squad.length === 0) {
      console.log(`  · ${String(t.name_kr).padEnd(20)} 스쿼드 없음`)
      continue
    }

    const { data: have } = await supabase
      .from("team_squads")
      .select("name_en")
      .eq("soccerway_team_id", t.soccerway_team_id)
    const existing = (have ?? []).map((r) => tokens(String(r.name_en ?? "")))

    const missing = squad.filter((p) => !alreadyHave(String(p.name), existing))
    for (const p of missing) {
      const n = Number(p.number)
      rows.push({
        팀: String(t.name_kr),
        등번호: Number.isFinite(n) && n > 0 ? n : "",
        포지션: String(p.position ?? ""),
        영문명: String(p.name),
        soccerway_team_id: String(t.soccerway_team_id),
        player_id: String(p.id),
      })
      if (APPLY) {
        const { error } = await supabase.from("team_squads").upsert(
          {
            soccerway_team_id: t.soccerway_team_id,
            player_id: String(p.id),
            player_slug: slugify(String(p.name)),
            name_en: String(p.name),
            name_kr: null, // 표기는 운영자·나무위키 수확기의 몫 — 여기서 지어내지 않는다
            jersey_number: Number.isFinite(n) && n > 0 ? n : null,
            position: p.position ? String(p.position) : null,
            status: "proposed",
            source: "lfa",
          },
          { onConflict: "soccerway_team_id,player_id" }
        )
        if (error) continue
      }
      added++
    }
    console.log(
      `  ✓ ${String(t.name_kr).padEnd(20)} LFA ${String(squad.length).padStart(2)}명 / 기존 ${String(existing.length).padStart(2)}명 → 추가 ${missing.length}명`
    )
    await new Promise((r) => setTimeout(r, 120))
  }

  if (rows.length > 0) {
    const head = Object.keys(rows[0])
    const csv = [head.join(","), ...rows.map((r) => head.map((h) => csvCell(r[h])).join(","))].join(
      "\r\n"
    )
    writeFileSync(OUT, "﻿" + csv, "utf8")
    console.log(`\n${OUT} — ${rows.length}행`)
  }
  console.log(`\n합계 ${added}명 ${APPLY ? "적재" : "추가 예정(드라이런)"}`)
}

main().catch((e) => {
  console.error("[fatal]", e)
  process.exit(1)
})
