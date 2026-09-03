import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { lfaFetch } from "@/lib/lfa/client"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { apiError } from "@/lib/api-error"

export const dynamic = "force-dynamic"
export const maxDuration = 120

/**
 * 스쿼드 동기화 — 이적시장 중 선수 추가·이탈 자동 반영 (2026-08-25 운영자 요청:
 * "이적 시장이 안 끝나서 선수들이 추가되고 사라질 수도 있거든? 그거는 나중에 자동 반영").
 *
 * ## 무엇을 하나
 * 곧 경기가 있는 팀의 LFA 스쿼드를 받아 우리 `team_squads` 와 맞춘다.
 *   새로 온 선수  → 행 추가 (`name_kr = null`) → 검수 지면에 **자동으로 나타난다**
 *   떠난 선수     → `status = 'left'` 로 표시
 *
 * ## ⚠️ 떠난 선수를 지우지 않는 이유
 * 이름은 **과거 경기에도 필요하다.** 지난달 리포트·라인업이 그 선수를 참조하므로, 행을
 * 지우면 옛 기록이 영문으로 되돌아간다. 그래서 남기되 표시만 한다.
 * ⚠️ 그리고 `status='rejected'` 를 쓰면 안 된다 — 읽는 경로 5곳이 전부
 *    `.neq("status","rejected")` 라 이름이 즉시 안 나오게 된다. `left` 는 그 필터를
 *    통과하므로 **과거 기록은 그대로 살아 있고**, 검수 지면에서만 제외된다.
 *
 * ## 크레딧
 * LFA `team_squad` 는 **팀당 1콜**이다. 하루 한 번, 앞으로 3일 안에 경기가 있는 팀만 —
 * 이적시장이 열려 있는 동안에도 하루 수십 콜 수준이다.
 * ⚠️ 유저 요청이 아니라 크론이므로 호출 수가 트래픽과 무관하다 (lfa_credits 규율).
 */

/** 앞으로 며칠 안에 경기가 있는 팀까지 볼 것인가 */
const LOOKAHEAD_DAYS = 3

interface LfaPlayer {
  /** ⚠️ 피드의 실제 키는 `id` 다 (scripts/import-squads-lfa.ts 와 동일). `player_id` 만 읽던
   *  2026-08-25~09-03 동안 id 가 항상 비어 slug 가 id 로 들어갔고, 이탈 판정은 "전원 이탈" 이었다
   *  (CHECK 제약이 left 를 막고 있어 겉으로 안 보였을 뿐). */
  id?: string | number
  player_id?: string | number
  name?: string
  shirt_number?: number | string
  position?: string
}

/** LFA 응답에서 선수 배열을 꺼낸다 — 키 이름이 흔들려 여러 후보를 본다 */
function extractPlayers(payload: unknown): LfaPlayer[] {
  const p = payload as Record<string, unknown> | null
  for (const key of ["squad", "players", "team_squad"]) {
    const v = p?.[key]
    if (Array.isArray(v)) return v as LfaPlayer[]
  }
  return []
}

function idOf(p: LfaPlayer): string | null {
  const v = p.player_id ?? p.id
  return v == null || v === "" ? null : String(v)
}

/** 이름 → 안정 키. LFA 가 표기를 조금씩 바꿔도 같은 선수로 보게 한다 */
function slugOf(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

async function cronGet(request: NextRequest) {
  const authError = verifyCronSecret(request)
  if (authError) return authError

  const supabase = createServiceRoleClient()
  try {
    // ① 대상 팀 — 기본은 곧 경기가 있는 팀. `?scope=all&offset=&limit=` 이면 사전에서
    //    lfa_team_id 가 있는 팀 전체를 잘라 돈다 (이적시장 마감 뒤 일괄 갈무리용,
    //    2026-09-03). 팀당 1크레딧이라 한 번에 limit(기본 30·최대 40) 팀까지만 —
    //    maxDuration 120s 안에서 끝나는 크기다.
    const url = new URL(request.url)
    const scopeAll = url.searchParams.get("scope") === "all"
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0)
    const limit = Math.min(40, Math.max(1, Number(url.searchParams.get("limit")) || 30))

    let dict: { soccerway_team_id: string; name_kr: string | null; lfa_team_id: string | null }[]
    if (scopeAll) {
      const { data } = await supabase
        .from("team_dictionary")
        .select("soccerway_team_id, name_kr, lfa_team_id")
        .not("lfa_team_id", "is", null)
        .order("soccerway_team_id")
        .range(offset, offset + limit - 1)
      dict = data ?? []
    } else {
      const until = new Date(Date.now() + LOOKAHEAD_DAYS * 86400_000).toISOString()
      const { data: games } = await supabase
        .from("betman_games")
        .select("home_team_name, away_team_name")
        .gte("match_time", new Date().toISOString())
        .lte("match_time", until)
      const teamNames = new Set<string>()
      for (const g of games ?? []) {
        if (g.home_team_name) teamNames.add(String(g.home_team_name))
        if (g.away_team_name) teamNames.add(String(g.away_team_name))
      }
      if (teamNames.size === 0) {
        return NextResponse.json({ mode: "squad-sync", teams: 0, note: "예정 경기 없음" })
      }

      const { data } = await supabase
        .from("team_dictionary")
        .select("soccerway_team_id, name_kr, lfa_team_id")
        .in("name_kr", [...teamNames])
        .not("lfa_team_id", "is", null)
      dict = data ?? []
    }

    let added = 0
    let upgraded = 0
    let left = 0
    let scanned = 0
    const failures: string[] = []

    for (const t of dict) {
      const teamId = String(t.soccerway_team_id)
      const lfaId = String(t.lfa_team_id)
      scanned++

      const payload = await lfaFetch<unknown>("team_squad", { team_id: lfaId }).catch(() => null)
      const players = extractPlayers(payload)
      // ⚠️ 빈 응답을 "전원 이탈" 로 해석하면 스쿼드가 통째로 죽는다. 아무것도 안 한다.
      if (players.length === 0) {
        failures.push(t.name_kr ? String(t.name_kr) : teamId)
        continue
      }

      // ⚠️ 대조 키는 이름이 아니라 player_id (2026-08-27 사고 교훈).
      //    LFA 는 이름 포맷을 예고 없이 바꾼다 ("Mohammed Kudus" → "M. Kudus" 실사고).
      //    slug(이름 기반)로 대조하면 포맷 변경 한 번에 전원이 "새 선수 + 전원 이탈" 로
      //    오판되어, 중복행 대량 삽입 + 멀쩡한 행 전부 left 처리가 된다.
      const feedIds = new Set<string>()
      const feedSlugs = new Set<string>()
      for (const p of players) {
        const id = idOf(p)
        if (id) feedIds.add(id)
        if (p.name) feedSlugs.add(slugOf(String(p.name)))
      }

      const { data: existing } = await supabase
        .from("team_squads")
        .select("player_id, player_slug, status, source")
        .eq("soccerway_team_id", teamId)
      const knownIds = new Set((existing ?? []).map((r) => String(r.player_id)))
      const knownSlugs = new Set((existing ?? []).map((r) => String(r.player_slug)))
      // 예전 동기화가 id 를 못 읽어 slug 를 id 로 넣은 행 (player_id === player_slug)
      const legacySlugIds = new Set(
        (existing ?? [])
          .filter((r) => String(r.player_id) === String(r.player_slug))
          .map((r) => String(r.player_slug))
      )

      // ② 새로 온 선수 — name_kr 은 비워 둔다. 발음을 여기서 지어내지 않는다.
      //    id 가 이미 있으면 표기만 바뀐 기존 선수다 — 건드리지 않는다.
      for (const p of players) {
        if (!p.name) continue
        const slug = slugOf(String(p.name))
        const realId = idOf(p)
        const pid = realId ?? slug
        if (!slug || knownIds.has(pid)) continue
        if (knownSlugs.has(slug)) {
          // slug 를 id 로 갖고 있던 행은 진짜 id 로 승격 — 다음 재대조가 이름 포맷 변경에 안 흔들린다
          if (realId && legacySlugIds.has(slug)) {
            const { error } = await supabase
              .from("team_squads")
              .update({ player_id: realId, updated_at: new Date().toISOString() })
              .eq("soccerway_team_id", teamId)
              .eq("player_id", slug)
            if (!error) {
              knownIds.add(realId)
              upgraded++
            }
          }
          continue
        }
        const { error } = await supabase.from("team_squads").insert({
          soccerway_team_id: teamId,
          player_slug: slug,
          player_id: pid,
          name_en: String(p.name),
          jersey_number: p.shirt_number ? Number(p.shirt_number) || null : null,
          position: p.position ? String(p.position) : "",
          source: "lfa",
          status: "proposed",
        })
        if (!error) added++
      }

      // ③ 떠난 선수 — 지우지 않고 표시만. 과거 경기 이름이 살아 있어야 한다.
      //    ⚠️ 판정은 source='lfa' 행에만 — 나무위키·soccerway 행의 id 는 LFA 피드에
      //    영영 안 나오므로, 포함하면 그 행 전부가 매번 "이탈" 로 오판된다.
      //    id 나 이름(slug) 어느 한쪽이라도 피드에 있으면 "있는 선수" 다 — slug 를 id 로 가진
      //    옛 행이 id 대조만으로 전원 이탈 처리된 2026-09-03 사고의 재발 방지.
      for (const r of existing ?? []) {
        if (String(r.source) !== "lfa") continue
        const status = String(r.status)
        if (status === "left" || status === "rejected") continue
        if (feedIds.has(String(r.player_id)) || feedSlugs.has(String(r.player_slug))) continue
        const { error } = await supabase
          .from("team_squads")
          .update({ status: "left", updated_at: new Date().toISOString() })
          .eq("soccerway_team_id", teamId)
          .eq("player_id", String(r.player_id))
        if (!error) left++
      }
    }

    return NextResponse.json({
      mode: "squad-sync",
      scope: scopeAll ? "all" : "upcoming",
      ...(scopeAll ? { offset, limit } : {}),
      teams: scanned,
      added,
      upgraded,
      left,
      failures: failures.slice(0, 10),
    })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}

export const GET = withCronLog("squad-sync", cronGet)
export async function POST(request: NextRequest) {
  return cronGet(request)
}
