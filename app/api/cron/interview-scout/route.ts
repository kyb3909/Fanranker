import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { CLUB_SUBREDDITS, isInterviewCandidate, MIN_MATERIAL_LENGTH } from "@/lib/interviews/scout"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * GET /api/cron/interview-scout — 채방관 (인터뷰 발췌 조직 1단계, LLM 0회)
 *
 * news_reservoir 최근 48시간에서 구단 서브레딧(시즌 사가 보유 팀)의 인터뷰 후보를
 * 골라 interview_cards(pending) 에 적재한다. 판정은 전부 결정론(lib/interviews/scout).
 * 멱등: reservoir_id UNIQUE — 같은 보도는 카드 1장.
 *
 * 저수지 status 는 가리지 않는다(중복 제외): 관심도 필터에 반려된 인터뷰도
 * 연대기 사료로는 가치가 있다 — 기사 발행 여부와 카드 여부는 독립.
 */
async function handler(req: NextRequest) {
  const denied = verifyCronSecret(req)
  if (denied) return denied

  const supabase = createServiceRoleClient()
  // ?hours= 로 소급 폭 조절 (기본 48, 상한 30일) — 리허설·개막 후 백필용
  const hoursParam = Number(req.nextUrl.searchParams.get("hours"))
  const hours = Number.isFinite(hoursParam) && hoursParam > 0 ? Math.min(hoursParam, 720) : 48
  const since = new Date(Date.now() - hours * 3600_000).toISOString()
  const subs = Object.keys(CLUB_SUBREDDITS)

  const { data: rows, error } = await supabase
    .from("news_reservoir")
    .select("id, source, urls, raw, created_at")
    .gte("created_at", since)
    .neq("status", "duplicate")
    // 서브레딧 필터는 쿼리에서 — 앱 필터 + limit 조합은 대상 행이 잘려나간다 (리허설 실측)
    .in("source->>subreddit", subs)
    .order("created_at", { ascending: false })
    .limit(400)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  let scanned = 0
  let inserted = 0
  for (const row of rows ?? []) {
    const sub = (row.source as { subreddit?: string } | null)?.subreddit ?? ""
    if (!subs.includes(sub)) continue
    scanned++

    const raw = (row.raw ?? {}) as { title?: string; articleText?: string }
    const title = raw.title ?? ""
    const material = raw.articleText ?? ""
    if (!title || !isInterviewCandidate(title, material.length)) continue

    const urls = (row.urls ?? {}) as { article?: string; reddit?: string }
    const { error: insErr } = await supabase.from("interview_cards").insert({
      reservoir_id: row.id,
      team_id: CLUB_SUBREDDITS[sub],
      subreddit: sub,
      source_url: urls.article ?? urls.reddit ?? null,
      source_title: title.slice(0, 500),
      material: material.slice(0, 8000),
      occurred_at: row.created_at,
    })
    // UNIQUE 충돌(이미 카드 있음)은 정상 — 그 외만 기록
    if (!insErr) inserted++
    else if (!/duplicate key/i.test(insErr.message)) {
      console.error("[interview-scout] insert 실패", row.id, insErr.message)
    }
  }

  return NextResponse.json({
    ok: true,
    scanned,
    inserted,
    min_material: MIN_MATERIAL_LENGTH,
  })
}

export const GET = withCronLog("interview-scout", handler)
