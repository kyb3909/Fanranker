import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { currentUser } from "@clerk/nextjs/server"
import { apiError } from "@/lib/api-error"

interface PollOption {
  key: string
  label: string
}

/**
 * GET /api/polls/active
 * 현재 활성 폴 1개 + 옵션별 집계 + (로그인 시) 내 투표.
 * 비로그인도 질문/결과는 볼 수 있음(콘텐츠 소비). 투표만 로그인 필요.
 */
export async function GET() {
  try {
    const supabase = createServiceRoleClient()

    const { data: poll, error } = await supabase
      .from("polls")
      .select("id, question, options, allow_reason, closes_at")
      .eq("is_active", true)
      .is("post_id", null) // VS 쟁점 폴(게시물 연결)은 사이드바 위젯에서 제외
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) return apiError("설문 조회 실패", 500, error)
    if (!poll || (poll.closes_at && poll.closes_at < new Date().toISOString())) {
      const empty = NextResponse.json({ poll: null })
      empty.headers.set("Cache-Control", "no-store")
      return empty
    }

    const { data: votes } = await supabase
      .from("poll_votes")
      .select("option_key, user_id, reason")
      .eq("poll_id", poll.id)

    const options = (poll.options as PollOption[]) ?? []
    const results: Record<string, number> = {}
    for (const o of options) results[o.key] = 0
    for (const v of votes ?? []) {
      results[v.option_key] = (results[v.option_key] ?? 0) + 1
    }

    let myVote: { optionKey: string; reason: string | null } | null = null
    const user = await currentUser()
    if (user) {
      const mine = (votes ?? []).find((v) => v.user_id === user.id)
      if (mine) myVote = { optionKey: mine.option_key, reason: mine.reason ?? null }
    }

    const res = NextResponse.json({
      poll: {
        id: poll.id,
        question: poll.question,
        options,
        allowReason: poll.allow_reason,
      },
      results,
      total: (votes ?? []).length,
      myVote,
    })
    res.headers.set("Cache-Control", "no-store")
    return res
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
