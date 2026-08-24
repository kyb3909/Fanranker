import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError } from "@/lib/api-error"
import { DRAFT_GAMES } from "@/lib/draft/games-catalog"

/**
 * 드래프트 픽 통계 (2026-08-25).
 *
 * 운영자: "사람들이 뽑은 데이터를 기반으로 순위 같은 걸 시각화해달라."
 * 종전 게임은 브라우저에서만 돌고 끝나면 아무것도 안 남았다 — FPL 소유율은 남의 집
 * 지표고, "우리 유저가 누굴 얼마나 자주·몇 라운드에 뽑는가" 는 이 라우트가 쌓는다.
 *
 * POST: 드래프트 완주 시 한 판 몫을 일괄 기록 (비로그인 포함 — 게임이 익명 플레이라).
 * GET:  ?slug=epl → { games, players: { [id]: { picks, avgRound } } }
 *
 * ⚠️ 캐시: 이 경로는 next.config 캐시 패턴에 안 잡히므로 GET 에 직접 s-maxage 를 단다.
 *    한 판 끝날 때마다 최신일 필요는 없다 — 5분이면 충분.
 */

// ⚠️ Next 가 GET 라우트를 정적으로 캐시해 한 박자 늦은 응답을 줬다 (실측: DB 에
//    1판 있는데 games:0). CDN 캐시는 아래 Cache-Control 헤더가 담당한다.
export const dynamic = "force-dynamic"

const VALID_SLUGS = new Set(DRAFT_GAMES.map((g) => g.slug))
const PLAYER_ID_RE = /^[a-z0-9-]{1,24}$/i

interface PickRow {
  playerId: string
  round: number
  pickNo: number
  pickedBy: "human" | "ai"
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      draftId?: string
      gameSlug?: string
      picks?: PickRow[]
    } | null

    const draftId = body?.draftId
    const gameSlug = body?.gameSlug
    const picks = body?.picks

    if (
      !draftId ||
      !/^[0-9a-f-]{36}$/i.test(draftId) ||
      !gameSlug ||
      !VALID_SLUGS.has(gameSlug) ||
      !Array.isArray(picks) ||
      picks.length === 0 ||
      picks.length > 120
    ) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 })
    }
    for (const p of picks) {
      if (
        !PLAYER_ID_RE.test(p.playerId ?? "") ||
        !Number.isInteger(p.round) ||
        p.round < 1 ||
        p.round > 30 ||
        !Number.isInteger(p.pickNo) ||
        p.pickNo < 1 ||
        p.pickNo > 120 ||
        (p.pickedBy !== "human" && p.pickedBy !== "ai")
      ) {
        return NextResponse.json({ error: "잘못된 픽 데이터입니다." }, { status: 400 })
      }
    }

    const supabase = createServiceRoleClient()

    // 같은 draft_id 재전송은 무시 (새로고침·재시도 멱등)
    const { data: exists } = await supabase
      .from("draft_game_picks")
      .select("id")
      .eq("draft_id", draftId)
      .limit(1)
      .maybeSingle()
    if (exists) return NextResponse.json({ ok: true, dedup: true })

    const { error } = await supabase.from("draft_game_picks").insert(
      picks.map((p) => ({
        draft_id: draftId,
        game_slug: gameSlug,
        player_id: p.playerId,
        round: p.round,
        pick_no: p.pickNo,
        picked_by: p.pickedBy,
      }))
    )
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiError("픽 기록 실패", 500, e)
  }
}

export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("slug") ?? ""
    if (!VALID_SLUGS.has(slug)) {
      return NextResponse.json({ error: "잘못된 slug 입니다." }, { status: 400 })
    }
    const supabase = createServiceRoleClient()
    const { data, error } = await supabase.rpc("draft_pick_stats", { p_slug: slug })
    if (error) throw error
    return NextResponse.json(data ?? { games: 0, players: {} }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    })
  } catch (e) {
    return apiError("픽 통계 조회 실패", 500, e)
  }
}
