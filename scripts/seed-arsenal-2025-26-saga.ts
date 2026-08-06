/**
 * 아스날 2025-26 시즌 사가 — 완전체 레퍼런스 시드 (2026-08-07 오너:
 * "아스날 2025-26 시즌 스케쥴을 따라서 사가 페이지를 하나 만들어줘…완전체 레퍼런스")
 *
 * 데이터: scripts/data/arsenal-2025-26-season.json — 위키피디아 시즌 문서(완결
 * 시즌 정본, footballbox 아이콘 파싱으로 골/카드 구분) + 소커웨이 결과 페이지
 * 실수확(팀 해시·경기 URL). 68경기: PL 38 + FA컵 4 + EFL컵 6 + UCL 15 + 친선 5.
 * 골 목록이 스코어와 안 맞는 3경기는 득점자 비표시 (틀린 사실 게재 금지).
 *
 * 시즌 사실: PL 우승(26승 7무 5패 승점 85) · UCL 준우승(결승 vs PSG 승부차기) ·
 * EFL컵 준우승 · FA컵 8강 — 위키 인포박스 실측.
 *
 * 각 경기 = saga_entries 1행 (D17 경기 카드의 데이터 형태). status='closed' 라
 * 활성 피드에는 안 뜨고 /saga/arsenal-2025-26 직접 URL 로만 열람 (레퍼런스 용도).
 *
 * 실행: pnpm exec tsx scripts/seed-arsenal-2025-26-saga.ts [--apply]  (기본 드라이런)
 * 멱등: saga 는 identity_key, 엔트리는 (saga_id, cluster_key) 유니크.
 */

import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import seasonData from "./data/arsenal-2025-26-season.json"

const APPLY = process.argv.includes("--apply")
const SAGA_BOT = "user_saga_bot"
const SEASON = "2025-26"
const SLUG = "arsenal-2025-26"

interface SeasonMatchRow {
  date: string
  comp: string
  round: number | null
  isHome: boolean
  oppEn: string
  oppKr: string
  arsScore: number
  oppScore: number
  result: "W" | "L" | "D"
  scoreRaw: string
  arsGoals: string
  oppGoals: string
  att: string | null
  url: string
  /** 한국어 경기 리포트 (위키 시즌 리뷰 서술 + 팩트 기반 재작성, 2026-08-07) */
  report?: string
}

const SUMMARY = [
  "아스날의 2025-26 시즌 완결 문서 — 프리미어리그 우승(26승 7무 5패, 승점 85, 득실 +44).",
  "UEFA 챔피언스리그 준우승(결승 부다페스트, PSG에 1-1 후 승부차기 3-4),",
  "EFL컵 준우승(결승 0-2 맨체스터 시티), FA컵 8강.",
  "전 68경기가 아래 연대기에 시간순으로 기록되어 있습니다.",
].join(" ")

function headlineFor(m: SeasonMatchRow): string {
  const compLabel = m.comp === "프리미어리그" && m.round ? `프리미어리그 ${m.round}R` : m.comp
  // 프리시즌 친선은 중립지 개최가 많아 홈/원정 표기가 오해를 부른다 — 생략
  const venue = m.comp.includes("친선") ? "" : ` (${m.isHome ? "홈" : "원정"})`
  const pen = m.scoreRaw.match(/\(\s*(\d+)\s*-\s*(\d+)\s*p\s*\)/)
  // 승부차기: scoreRaw 는 홈-원정 순 → 아스날 관점으로 뒤집기
  const penLabel = pen
    ? ` (승부차기 ${m.isHome ? `${pen[1]}-${pen[2]}` : `${pen[2]}-${pen[1]}`})`
    : ""
  const aet = /a\.e\.t/.test(m.scoreRaw) ? " 연장" : ""
  return `[${compLabel}] 아스널 ${m.arsScore}-${m.oppScore} ${m.oppKr}${venue}${aet}${penLabel}`
}

function summaryFor(m: SeasonMatchRow): string | null {
  // 리포트가 정본 (경기 전개·논란·기록 맥락 포함 — 2026-08-07 오너: "경기 리포트를 작성해줘야해")
  if (m.report) return m.report
  const parts: string[] = []
  if (m.arsGoals) parts.push(`득점 — ${m.arsGoals}`)
  if (m.oppGoals) parts.push(`실점 — ${m.oppGoals}`)
  if (m.att) parts.push(`관중 ${m.att}명`)
  return parts.length > 0 ? parts.join(" · ") : null
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("SUPABASE env 누락")
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const rows = seasonData as SeasonMatchRow[]
  console.log(`[seed] ${SLUG} — ${rows.length}경기, mode=${APPLY ? "apply" : "dry-run"}`)

  if (!APPLY) {
    for (const m of rows.slice(0, 5)) console.log("  (dry)", headlineFor(m), "|", summaryFor(m))
    console.log(`  … 외 ${rows.length - 5}건`)
    console.log("[done] 드라이런 — 반영은 --apply")
    return
  }

  const subject = {
    team_id: "arsenal",
    team_kr: "아스널",
    team_fpl: "Arsenal",
    aliases: ["아스널", "아스날", "Arsenal"],
    season: SEASON,
  }
  const identity = `season:arsenal:${SEASON}`

  let { data: saga } = await supabase
    .from("sagas")
    .select("id, slug")
    .eq("identity_key", identity)
    .maybeSingle()

  if (!saga) {
    const { data: category } = await supabase
      .from("categories")
      .select("id")
      .eq("slug", "saga")
      .single()
    if (!category) throw new Error("saga 카테고리 없음")

    const { data: post, error: postErr } = await supabase
      .from("posts")
      .insert({
        user_id: SAGA_BOT,
        category_id: category.id,
        community_slug: "saga",
        title: `아스널 ${SEASON} 시즌`,
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "이 글은 시즌 문서의 토론 앵커입니다." }],
            },
          ],
        },
      })
      .select("id")
      .single()
    if (postErr || !post) throw new Error(`앵커 실패: ${postErr?.message}`)

    const { data: created, error } = await supabase
      .from("sagas")
      .insert({
        saga_type: "season",
        slug: SLUG,
        title: `아스널 ${SEASON} 시즌`,
        identity_key: identity,
        subject,
        window_key: SEASON,
        summary: SUMMARY,
        anchor_post_id: post.id,
        stage: "active",
        // 완결 시즌 — 활성 피드 비노출, 직접 URL 열람 (레퍼런스)
        status: "closed",
        closed_at: "2026-05-31T00:00:00Z",
        is_confirmed: true,
        last_event_at: "2026-05-31T00:00:00Z",
      })
      .select("id, slug")
      .single()
    if (error || !created) throw new Error(`사가 생성 실패: ${error?.message}`)
    saga = created
    console.log(`사가 생성: /saga/${saga.slug}`)
  } else {
    console.log(`사가 존재: /saga/${saga.slug} — 엔트리만 보충`)
  }

  let ok = 0
  for (const m of rows) {
    const cluster = `match:${m.date}:${m.oppEn.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
    // 재실행 시 내용 교정까지 반영 (데이터 정화 후 재시드 대비)
    const { error } = await supabase.from("saga_entries").upsert(
      {
        saga_id: saga.id,
        cluster_key: cluster,
        headline: headlineFor(m),
        summary: summaryFor(m),
        tier: "official",
        stage_after: null,
        origin: {
          outlet: "Soccerway",
          reporter: null,
          url: m.url,
          published_at: `${m.date}T12:00:00Z`,
        },
        echoes: [],
        occurred_at: `${m.date}T12:00:00Z`,
      },
      { onConflict: "saga_id,cluster_key" }
    )
    if (error) console.error(`  엔트리 실패 ${cluster}: ${error.message}`)
    else ok++
  }

  await supabase
    .from("sagas")
    .update({ entry_count: rows.length, updated_at: new Date().toISOString() })
    .eq("id", saga.id)

  console.log(`[done] 엔트리 ${ok}건 반영(upsert) → /saga/${SLUG}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
