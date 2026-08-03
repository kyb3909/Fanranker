import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { sanitizeTipTapJSON } from "@/lib/tiptap/sanitize"
import { publishNewsDraft, type NewsReservoirItem } from "@/lib/news/publish"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * 수동 배치 발행 도구 (vercel.json 미등록 — 스케줄 없음, CRON_SECRET 필수).
 *
 * 용도: 운영자가 지정한 초안 id 들을 정식 발행 경로(publishNewsDraft)로 발행한다.
 * 자동발행 cron 과 달리 게이트(이미지 필수·일일 상한) 없이 지정분만 나간다 —
 * 지정 자체가 운영자 결정이기 때문. 사가 연동 훅도 정식 경로라 함께 발화한다.
 *
 * 호출: GET /api/cron/saga-test-publish?ids=id1,id2,...   (Authorization: Bearer CRON_SECRET)
 */
export async function GET(request: NextRequest) {
  const denied = verifyCronSecret(request)
  if (denied) return denied

  const ids = (request.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20)
  if (ids.length === 0) return NextResponse.json({ error: "ids 필요" }, { status: 400 })

  const supabase = createServiceRoleClient()
  const { data: drafts } = await supabase
    .from("news_reservoir")
    .select("id, status, urls, draft, entities, tags")
    .in("id", ids)
    .eq("status", "drafted")

  const results: { id: string; postId?: string; error?: string }[] = []
  for (const row of (drafts ?? []) as NewsReservoirItem[]) {
    const title = row.draft?.title?.trim()
    const content = sanitizeTipTapJSON(row.draft?.content)
    if (!title || !content) {
      results.push({ id: row.id, error: "제목/본문 없음" })
      continue
    }
    const r = await publishNewsDraft(supabase, row, { title, content })
    results.push({ id: row.id, postId: r.postId, error: r.error })
  }

  return NextResponse.json({ requested: ids.length, found: drafts?.length ?? 0, results })
}
