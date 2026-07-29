import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { sanitizeTipTapJSON } from "@/lib/tiptap/sanitize"
import {
  publishNewsDraft,
  hasVisualContent,
  NEWS_BOT_USER_ID,
  type NewsReservoirItem,
} from "@/lib/news/publish"

export const dynamic = "force-dynamic"

/**
 * 뉴스 자동발행 cron (30분 주기) — 검수 없이 나가는 유일한 경로라 조건이 문이다.
 *
 * 게이트 (운영자 승인 2026-07-29):
 *   1. 시각 자료(이미지/임베드) 있는 초안만 — "사진 없음(떡밥 제외)" 기준과 동일
 *   2. 24시간 이내 초안만 — 뉴스는 시의성이 생명 (오래된 건 48h 자동반려가 처리)
 *   3. 하루 총량 상한 — 자동+수동 합산. 상한 도달 시 자동은 멈추고 수동만 가능
 *   4. 회당 상한 — 몰아서 발행하지 않고 하루에 걸쳐 분산
 *
 * 끄기: Vercel env NEWS_AUTO_PUBLISH=off (배포 없이 즉시).
 * 자동발행분은 reservoir publish.auto=true 로 표시 — 사후 구분·회수용.
 * 검수 편집이 없으므로 교정 학습은 안 태운다 — 발행 후 운영자가 글을 고치면
 * 배치 학습기(hermes learn-news-edits, 매일 21시)가 diff 로 줍는다.
 */

/** 하루 발행 총량 상한 (자동+수동 합산, KST 자정 기준). 물량 목표 = 하루 뉴스 20 */
const DAILY_CAP = 20
/** 회당 발행 상한 — 30분 주기 × 2건 = 최대 96건/일 이론치를 DAILY_CAP 이 자른다 */
const PER_RUN_CAP = 2
/** 초안 신선도 (시간) */
const MAX_AGE_HOURS = 24

function kstMidnightUtcIso(): string {
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000)
  return new Date(
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()) - 9 * 3600 * 1000
  ).toISOString()
}

async function run(request: NextRequest) {
  const authError = verifyCronSecret(request)
  if (authError) return authError

  if (process.env.NEWS_AUTO_PUBLISH === "off") {
    return NextResponse.json({ ok: true, skipped: "NEWS_AUTO_PUBLISH=off" })
  }

  const supabase = createServiceRoleClient()

  // 오늘 봇 발행 총량 (자동+수동) — posts 가 원장이라 reservoir 표기 방식과 무관하게 정확
  const { count: publishedToday } = await supabase
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", NEWS_BOT_USER_ID)
    .gte("created_at", kstMidnightUtcIso())
  if ((publishedToday ?? 0) >= DAILY_CAP) {
    return NextResponse.json({ ok: true, published: 0, skipped: `일일 상한 ${DAILY_CAP} 도달` })
  }

  const freshCutoff = new Date(Date.now() - MAX_AGE_HOURS * 3600 * 1000).toISOString()
  const { data: drafts, error } = await supabase
    .from("news_reservoir")
    .select("id, status, urls, draft, entities, tags, created_at")
    .eq("status", "drafted")
    .gte("created_at", freshCutoff)
    .order("created_at", { ascending: false }) // 최신 우선 — 뉴스는 신선한 것부터
    .limit(30)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const budget = Math.min(PER_RUN_CAP, DAILY_CAP - (publishedToday ?? 0))
  let published = 0
  const publishedIds: string[] = []
  const errors: string[] = []

  for (const row of (drafts ?? []) as (NewsReservoirItem & { status: string })[]) {
    if (published >= budget) break

    const title = row.draft?.title?.trim()
    const content = sanitizeTipTapJSON(row.draft?.content)
    if (!title || !content) continue
    if (!hasVisualContent(content)) continue // 사진/임베드 없는 기사는 사람 검수로만

    const result = await publishNewsDraft(supabase, row, { title, content, auto: true })
    if (result.error) {
      // 실패 항목은 drafted 로 남는다 — 다음 run 재시도 또는 수동 검수로 처리 가능
      errors.push(`${row.id}: ${result.error}`)
      continue
    }
    published++
    publishedIds.push(result.postId!)
  }

  return NextResponse.json({
    ok: errors.length === 0,
    published,
    postIds: publishedIds,
    todayTotal: (publishedToday ?? 0) + published,
    ...(errors.length > 0 ? { errors } : {}),
  })
}

export async function GET(request: NextRequest) {
  return run(request)
}
export async function POST(request: NextRequest) {
  return run(request)
}
