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
 * 현재 활성 폴 전부(최대 3개) + 옵션별 집계 + (로그인 시) 내 투표.
 * 비로그인도 질문/결과는 볼 수 있음(콘텐츠 소비). 투표만 로그인 필요.
 *
 * 2026-07-30 복수 폴 지원 — 운영자가 설문 2개를 동시에 걸고 싶어함
 * (첼시vs리버풀 순위 + 토트넘 최종 순위). 응답이 { polls: [...] } 배열로 변경.
 */
export async function GET() {
  try {
    const supabase = createServiceRoleClient()

    const { data: pollRows, error } = await supabase
      .from("polls")
      .select("id, question, options, allow_reason, closes_at")
      .eq("is_active", true)
      .is("post_id", null) // VS 쟁점 폴(게시물 연결)은 사이드바 위젯에서 제외
      .order("created_at", { ascending: false })
      .limit(3)

    if (error) return apiError("설문 조회 실패", 500, error)
    const now = new Date().toISOString()
    const activePolls = (pollRows ?? []).filter((p) => !p.closes_at || p.closes_at >= now)
    if (activePolls.length === 0) {
      const empty = NextResponse.json({ polls: [] })
      empty.headers.set("Cache-Control", "no-store")
      return empty
    }

    const { data: votes } = await supabase
      .from("poll_votes")
      .select("poll_id, option_key, user_id, reason")
      .in(
        "poll_id",
        activePolls.map((p) => p.id)
      )

    const user = await currentUser()

    const polls = activePolls.map((poll) => {
      const options = (poll.options as PollOption[]) ?? []
      const pollVotes = (votes ?? []).filter((v) => v.poll_id === poll.id)
      const results: Record<string, number> = {}
      for (const o of options) results[o.key] = 0
      for (const v of pollVotes) {
        results[v.option_key] = (results[v.option_key] ?? 0) + 1
      }
      let myVote: { optionKey: string; reason: string | null } | null = null
      if (user) {
        const mine = pollVotes.find((v) => v.user_id === user.id)
        if (mine) myVote = { optionKey: mine.option_key, reason: mine.reason ?? null }
      }
      return {
        poll: {
          id: poll.id,
          question: poll.question,
          options,
          allowReason: poll.allow_reason,
        },
        results,
        total: pollVotes.length,
        myVote,
      }
    })

    const res = NextResponse.json({ polls })
    res.headers.set("Cache-Control", "no-store")
    return res
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
