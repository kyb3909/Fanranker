import { NextRequest, NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { NEWS_BOT_USER_ID } from "@/lib/news/publish"
import { filterErrorReportCandidates, classifyErrorReports } from "@/lib/news/comment-reports"
import { notifyDiscordOps } from "@/lib/discord-notify"

export const maxDuration = 60
export const dynamic = "force-dynamic"

/**
 * GET/POST /api/cron/news-comment-reports  (CRON_SECRET, vercel.json 매시 :26)
 *
 * 봇 기사 댓글에서 오류 제보("기사 잘못됐어요")를 감지해 news_error_reports 에
 * 적재하고 디스코드로 알린다 (2026-08-07 운영자 요청). 자동 수정은 하지 않는다 —
 * 제보가 틀릴 수 있으므로 확정은 검수자. 검수 화면 "발행된 것 고치기"에 제보
 * 배지가 붙고, 제보를 수정 사유로 채워 고치면 표기/사실 학습으로 이어진다.
 *
 * 창은 25시간(매시 실행과 1시간 겹침) — 놓친 회차가 있어도 다음 회차가 줍는다.
 * comment_id UNIQUE + 사전 조회로 같은 댓글을 두 번 판정하지 않는다.
 */
const LOOKBACK_HOURS = 25
/** LLM 판정 상한 (run 당) — 봇 기사 댓글은 소량이라 실제로는 닿지 않는다 */
const MAX_CLASSIFY_PER_RUN = 20

async function handler(req: NextRequest) {
  const authError = verifyCronSecret(req)
  if (authError) return authError

  const supabase = createServiceRoleClient()
  const since = new Date(Date.now() - LOOKBACK_HOURS * 3600_000).toISOString()

  // 봇 기사에 달린 최근 댓글 (삭제 안 된 것만)
  const { data: comments, error } = await supabase
    .from("comments")
    .select("id, post_id, user_id, content, created_at, posts!inner(id, user_id, deleted_at)")
    .eq("posts.user_id", NEWS_BOT_USER_ID)
    .is("posts.deleted_at", null)
    .is("deleted_at", null)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(500)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const candidates = filterErrorReportCandidates(
    ((comments ?? []) as unknown as {
      id: string
      post_id: string
      user_id: string | null
      content: string | null
    }[]) ?? []
  )
  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, scanned: comments?.length ?? 0, matchedRule: 0 })
  }

  // 이미 판정한 댓글 제외 (재판정 = LLM 낭비 + 무시한 제보의 부활)
  const { data: known } = await supabase
    .from("news_error_reports")
    .select("comment_id")
    .in(
      "comment_id",
      candidates.map((c) => c.id)
    )
  const knownIds = new Set((known ?? []).map((k) => k.comment_id as string))
  const fresh = candidates.filter((c) => !knownIds.has(c.id)).slice(0, MAX_CLASSIFY_PER_RUN)
  if (fresh.length === 0) {
    return NextResponse.json({
      ok: true,
      scanned: comments?.length ?? 0,
      matchedRule: candidates.length,
      fresh: 0,
    })
  }

  // 기사 제목·본문 발췌 (판정 문맥)
  const postIds = [...new Set(fresh.map((c) => c.postId))]
  const { data: posts } = await supabase
    .from("posts")
    .select("id, title, content")
    .in("id", postIds)
  const postById = new Map(
    ((posts ?? []) as { id: string; title: string; content: unknown }[]).map((p) => [p.id, p])
  )
  const excerpt = (content: unknown): string => {
    const out: string[] = []
    const walk = (n: unknown) => {
      const node = n as { type?: string; text?: string; content?: unknown[] } | null
      if (!node) return
      if (node.type === "paragraph") {
        const t = (node.content ?? []).map((c) => (c as { text?: string }).text ?? "").join("")
        if (t.trim()) out.push(t.trim())
      }
      for (const c of node.content ?? []) walk(c)
    }
    walk(content)
    return out.join(" ")
  }

  const verdicts = await classifyErrorReports(
    fresh.map((c) => {
      const post = postById.get(c.postId)
      return {
        articleTitle: post?.title ?? "",
        articleExcerpt: excerpt(post?.content),
        comment: c.content,
      }
    })
  )
  // 인프라 실패는 판정이 아니다 — 아무것도 기록하지 않고 다음 회차 재시도
  if (verdicts === null) {
    return NextResponse.json({
      ok: true,
      scanned: comments?.length ?? 0,
      matchedRule: candidates.length,
      fresh: fresh.length,
      classify: "unavailable",
    })
  }

  const confirmed = verdicts.filter((v) => v.isReport && v.claim)
  const rows = confirmed.map((v) => {
    const c = fresh[v.idx]
    return {
      post_id: c.postId,
      comment_id: c.id,
      comment_user_id: c.userId,
      comment_text: c.content.slice(0, 2000),
      claim: v.claim,
    }
  })
  // 제보 아님으로 판정된 댓글도 dismissed 로 기록 — 다음 회차 재판정 방지
  const nonReports = verdicts
    .filter((v) => !v.isReport)
    .map((v) => {
      const c = fresh[v.idx]
      return {
        post_id: c.postId,
        comment_id: c.id,
        comment_user_id: c.userId,
        comment_text: c.content.slice(0, 2000),
        claim: "(제보 아님 — 자동 판정)",
        status: "dismissed" as const,
      }
    })

  let inserted = 0
  if (rows.length > 0 || nonReports.length > 0) {
    const { error: insertError } = await supabase
      .from("news_error_reports")
      .upsert([...rows, ...nonReports], { onConflict: "comment_id", ignoreDuplicates: true })
    if (insertError) {
      return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 })
    }
    inserted = rows.length
  }

  if (inserted > 0) {
    const first = rows[0]
    const firstPost = postById.get(first.post_id)
    notifyDiscordOps({
      title: `독자 오류 제보 ${inserted}건`,
      description:
        `봇 기사에 오류 지적 댓글이 감지됐습니다. 검수 후 반영하세요.\n` +
        `예: "${first.claim}" — ${firstPost?.title?.slice(0, 80) ?? first.post_id}`,
      level: "warn",
      url: "/admin/news-review",
    }).catch(() => {})
  }

  return NextResponse.json({
    ok: true,
    scanned: comments?.length ?? 0,
    matchedRule: candidates.length,
    fresh: fresh.length,
    confirmed: inserted,
    dismissedAuto: nonReports.length,
  })
}

export const GET = withCronLog("news-comment-reports", handler)
export const POST = handler
