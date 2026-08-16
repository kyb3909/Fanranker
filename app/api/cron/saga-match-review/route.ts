import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { buildMatchReview } from "@/lib/saga/match-review"
import { seasonStartIso, seasonEndIso } from "@/lib/saga/season"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * GET /api/cron/saga-match-review — 종료된 경기를 각 팀 시즌 실록에 카드로 적재 (D17).
 *
 * 활성 시즌 사가(saga_type='season')를 돌며 그 팀의 최근 종료 경기를 찾아 **그 팀 관점의**
 * 리뷰 카드를 만든다. 아스널 3-0 맨시티라면 아스널 문서엔 아스널이 주어인 카드가,
 * 맨시티 문서엔 맨시티가 주어인 카드가 각각 쌓인다 (2026-08-17 오너).
 *
 * 멱등: (saga_id, cluster_key) 유니크 — 이미 있는 경기는 건너뛴다(재작성 안 함).
 * fail-open: 한 경기가 실패해도 나머지는 계속. 게이트 미통과 카드는 만들지 않는다.
 *
 * 킬스위치: SAGA_MATCH_REVIEW=off
 */

/** 스캔 범위 — 종료 직후 반영이 목적이라 넓게 잡을 이유가 없다 */
const LOOKBACK_HOURS = 48
/** 킥오프 후 이 시간이 지나야 종료 후보로 본다 (연장·승부차기 여유 포함) */
const MIN_ELAPSED_MS = 2.5 * 3600_000
/** 회당 카드 생성 상한 — LLM 비용 방어 */
const MAX_CARDS = 12

interface SeasonSubject {
  team_kr?: string
  aliases?: string[]
  season?: string
}

async function handler(request: NextRequest) {
  const authError = verifyCronSecret(request)
  if (authError) return authError
  if (process.env.SAGA_MATCH_REVIEW === "off") {
    return NextResponse.json({ success: true, skipped: "SAGA_MATCH_REVIEW off" })
  }

  const supabase = createServiceRoleClient()
  const { data: sagas } = await supabase
    .from("sagas")
    .select("id, slug, subject, entry_count")
    .eq("saga_type", "season")
    .eq("status", "active")

  const now = Date.now()
  const since = new Date(now - LOOKBACK_HOURS * 3600_000).toISOString()
  const until = new Date(now - MIN_ELAPSED_MS).toISOString()

  let created = 0
  let skipped = 0
  const errors: string[] = []
  const written: string[] = []

  for (const saga of sagas ?? []) {
    if (created >= MAX_CARDS) break
    const subject = (saga.subject ?? {}) as SeasonSubject
    const teamKr = subject.team_kr
    const season = subject.season
    if (!teamKr || !season) continue

    // betman 은 한글 표기 — 별칭 중 한글만 매칭에 쓴다
    const names = [...new Set([teamKr, ...(subject.aliases ?? [])])].filter((a) =>
      /[가-힣]/.test(a)
    )
    if (names.length === 0) continue
    const orExpr = names.map((n) => `home_team_name.eq.${n},away_team_name.eq.${n}`).join(",")

    const { data: games } = await supabase
      .from("betman_games")
      .select("id, home_team_name, away_team_name, league_code, match_time")
      .eq("sport", "축구")
      .or(orExpr)
      .gte("match_time", since)
      .lte("match_time", until)
      // 시즌 문서엔 그 시즌 경기만 (season.ts 와 같은 경계)
      .gte("match_time", seasonStartIso(season))
      .lt("match_time", seasonEndIso(season))
      .order("match_time", { ascending: true })

    // 마켓별 다중 행 → 경기 단위로 접는다
    const byMatch = new Map<string, NonNullable<typeof games>[number]>()
    for (const g of games ?? []) {
      const key = `${g.home_team_name}|${g.away_team_name}|${g.match_time}`
      if (!byMatch.has(key)) byMatch.set(key, g)
    }
    if (byMatch.size === 0) continue

    const { data: existing } = await supabase
      .from("saga_entries")
      .select("cluster_key")
      .eq("saga_id", saga.id)
    const done = new Set((existing ?? []).map((e) => e.cluster_key as string))

    let addedForSaga = 0
    for (const g of byMatch.values()) {
      if (created >= MAX_CARDS) break
      try {
        const card = await buildMatchReview(
          {
            gameId: String(g.id),
            homeTeam: String(g.home_team_name),
            awayTeam: String(g.away_team_name),
            leagueCode: String(g.league_code ?? ""),
            matchTime: String(g.match_time),
          },
          { teamKr }
        )
        if (!card) {
          skipped++
          continue
        }
        if (done.has(card.clusterKey)) {
          skipped++
          continue
        }

        const { error } = await supabase.from("saga_entries").insert({
          saga_id: saga.id,
          cluster_key: card.clusterKey,
          headline: card.headline,
          summary: card.summary,
          tier: "official",
          stage_after: null,
          // D5: 외부 기사 본문·링크를 싣지 않는다. 리뷰는 구조화 데이터에서 자체 작성한 것이다
          origin: { outlet: null, reporter: null, url: null, published_at: g.match_time },
          echoes: [],
          occurred_at: card.occurredAt,
        })
        if (error) {
          // 유니크 충돌은 동시 실행 — 오류가 아니다
          if (error.code === "23505") skipped++
          else errors.push(`${saga.slug} ${card.clusterKey}: ${error.message}`)
          continue
        }
        done.add(card.clusterKey)
        created++
        addedForSaga++
        written.push(`${saga.slug}: ${card.headline}`)
      } catch (e) {
        errors.push(`${saga.slug} ${g.id}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    if (addedForSaga > 0) {
      const { count } = await supabase
        .from("saga_entries")
        .select("id", { count: "exact", head: true })
        .eq("saga_id", saga.id)
      await supabase
        .from("sagas")
        .update({
          entry_count: count ?? (saga.entry_count ?? 0) + addedForSaga,
          last_event_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", saga.id)
    }
  }

  return NextResponse.json({ success: true, created, skipped, written, errors })
}

export const GET = withCronLog("saga-match-review", handler)
