import { NextRequest, NextResponse } from "next/server"
import { auth as clerkAuth } from "@clerk/nextjs/server"
import { z } from "zod"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError, apiBadRequest, apiUnauthorized, checkRateLimit } from "@/lib/api-error"
import { aggregateMainVotes, latestMainChoice } from "@/lib/saga/votes"

export const dynamic = "force-dynamic"

/**
 * 사가 메인 투표 (Phase A W1).
 *
 *  GET  : 집계 + 내 현재 스탠스 (위젯 하이드레이션)
 *  POST : { choice: 'go' | 'stay' } — 로그인 필수. append-only 원장에 행 추가.
 *         같은 선택을 반복하면 행을 만들지 않는다(no-op) — 원장 도배 방지.
 *         종결 사가는 투표 불가 (정산 무결성 — 결과가 난 뒤의 표는 표가 아니다).
 */

const VoteSchema = z.object({ choice: z.enum(["go", "stay"]) })

async function findSaga(supabase: ReturnType<typeof createServiceRoleClient>, slug: string) {
  const { data } = await supabase.from("sagas").select("id, status").eq("slug", slug).maybeSingle()
  return data as { id: string; status: string } | null
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params
    const supabase = createServiceRoleClient()
    const saga = await findSaga(supabase, slug)
    if (!saga) return apiBadRequest("사가를 찾을 수 없습니다.")

    const { userId } = await clerkAuth()
    const [agg, myChoice] = await Promise.all([
      aggregateMainVotes(supabase, saga.id),
      userId ? latestMainChoice(supabase, saga.id, userId) : Promise.resolve(null),
    ])
    return NextResponse.json({ ...agg, myChoice })
  } catch (e) {
    return apiError("투표 조회 중 오류가 발생했습니다.", 500, e)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const limited = checkRateLimit(request, "STANDARD")
    if (limited) return limited

    const { userId } = await clerkAuth()
    if (!userId) return apiUnauthorized()

    const { slug } = await params
    const body = await request.json().catch(() => null)
    const parsed = VoteSchema.safeParse(body)
    if (!parsed.success) return apiBadRequest("choice 는 'go' 또는 'stay' 여야 합니다.")

    const supabase = createServiceRoleClient()
    const saga = await findSaga(supabase, slug)
    if (!saga) return apiBadRequest("사가를 찾을 수 없습니다.")
    if (saga.status !== "active") {
      return apiBadRequest("종결된 사가에는 투표할 수 없습니다.")
    }

    // 같은 선택 반복 = no-op (append-only 원장이라 무의미한 행을 쌓지 않는다)
    const current = await latestMainChoice(supabase, saga.id, userId)
    if (current !== parsed.data.choice) {
      const { error } = await supabase.from("saga_votes").insert({
        saga_id: saga.id,
        scope: "main",
        user_id: userId,
        choice: parsed.data.choice,
      })
      if (error) return apiError("투표 저장에 실패했습니다.", 500, error)
    }

    const agg = await aggregateMainVotes(supabase, saga.id)
    return NextResponse.json({ ...agg, myChoice: parsed.data.choice })
  } catch (e) {
    return apiError("투표 중 오류가 발생했습니다.", 500, e)
  }
}
