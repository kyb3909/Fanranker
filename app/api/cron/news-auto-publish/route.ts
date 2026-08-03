import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { sanitizeTipTapJSON } from "@/lib/tiptap/sanitize"
import { extractFirstImageSrcFromTipTapJSON } from "@/lib/utils/tiptap-embeds"
import {
  publishNewsDraft,
  isContentFreeDraft,
  NEWS_BOT_USER_ID,
  type NewsReservoirItem,
} from "@/lib/news/publish"
import { inspectDraft, unknownPlayerNames } from "@/lib/news/quality-gate"
import { classifyTier } from "@/lib/saga/tier"
import { titleSimilarity } from "@/lib/saga/cluster"

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
/** 자동발행만의 일일 상한 — 5로 시작했으나 중복 차단 게이트가 붙으며 실공급이
 *  얇아져 10으로 (2026-08-04). 오류율 문제 시 다시 축소 */
const AUTO_DAILY_CAP = 10
/** 회당 발행 상한 — 30분 주기 × 2건 = 최대 96건/일 이론치를 DAILY_CAP 이 자른다 */
const PER_RUN_CAP = 2
/** 초안 신선도 (시간) */
const MAX_AGE_HOURS = 24

/** 이적 맥락 신호 — 이것이 있으면서 티어가 루머면 자동발행 금지 (오보 리스크는 사람만) */
const TRANSFER_CONTEXT_RE =
  /이적|영입|임대|방출|결별|재계약|입단|오퍼|제안|bid|transfer|sign|loan|deal|move/i

function kstMidnightUtcIso(): string {
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000)
  return new Date(
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()) - 9 * 3600 * 1000
  ).toISOString()
}

async function run(request: NextRequest) {
  const authError = verifyCronSecret(request)
  if (authError) return authError

  // ⚠️ 2026-07-30 운영자 정지 — 기본값을 꺼짐으로 뒤집음 (opt-in).
  // 사유: 무검수 발행분에서 오타·영어 미번역·이미지 없는 글이 그대로 나감.
  // 검수(빠른검수 화면)가 품질 게이트였는데 자동발행이 그걸 우회한 것.
  // 재개 조건: 발행 전 품질 게이트(LLM 한국어/오타 검사 + 실제 이미지 필수)를
  // 붙인 뒤 Vercel env NEWS_AUTO_PUBLISH=on 으로만 재개.
  if (process.env.NEWS_AUTO_PUBLISH !== "on") {
    return NextResponse.json({
      ok: true,
      skipped: "자동발행 정지 (opt-in — env NEWS_AUTO_PUBLISH=on 필요)",
    })
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

  // 오늘 자동발행분 — 소량 재개 상한은 자동분만 따로 센다
  const { count: autoToday } = await supabase
    .from("news_reservoir")
    .select("id", { count: "exact", head: true })
    .eq("status", "published")
    .contains("publish", { auto: true })
    .gte("updated_at", kstMidnightUtcIso())
  if ((autoToday ?? 0) >= AUTO_DAILY_CAP) {
    return NextResponse.json({
      ok: true,
      published: 0,
      skipped: `자동 상한 ${AUTO_DAILY_CAP} 도달`,
    })
  }

  const freshCutoff = new Date(Date.now() - MAX_AGE_HOURS * 3600 * 1000).toISOString()
  const { data: drafts, error } = await supabase
    .from("news_reservoir")
    .select("id, status, urls, draft, entities, tags, decision, created_at")
    .eq("status", "drafted")
    .gte("created_at", freshCutoff)
    .order("created_at", { ascending: false }) // 최신 우선 — 뉴스는 신선한 것부터
    .limit(30)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 표기 사전 (선수) — 미등재 선수명 기사는 자동발행 제외 (환각 음차 차단)
  const { data: dict } = await supabase
    .from("news_alias_dictionary")
    .select("preferred_ko, hangul_alts")
    .eq("category", "player")

  // 중복 차단 재료 — 최근 48시간 발행 제목 (실사고 2026-08-04: 레딧에 같은 소식이
  // 여러 개 올라와 '헨더슨 첼시 합류'가 3번 발행됨)
  const { data: recentPosts } = await supabase
    .from("posts")
    .select("title")
    .eq("user_id", NEWS_BOT_USER_ID)
    .is("deleted_at", null)
    .gte("created_at", new Date(Date.now() - 48 * 3600 * 1000).toISOString())
  const recentTitles = (recentPosts ?? []).map((p) => p.title as string)

  const budget = Math.min(
    PER_RUN_CAP,
    DAILY_CAP - (publishedToday ?? 0),
    AUTO_DAILY_CAP - (autoToday ?? 0)
  )
  let published = 0
  const publishedIds: string[] = []
  const gated: string[] = []
  const errors: string[] = []

  for (const row of (drafts ?? []) as (NewsReservoirItem & {
    status: string
    decision: Record<string, unknown> | null
  })[]) {
    if (published >= budget) break

    const title = row.draft?.title?.trim()
    const content = sanitizeTipTapJSON(row.draft?.content)
    if (!title || !content) continue
    // 실제 이미지 필수 (2026-07-30 강화) — 기존 hasVisualContent 는 X/유튜브 임베드도
    // 통과시켜 "이미지 파일 없는 글"이 자동으로 나갔다. 임베드-온리 글은 사람 검수로만.
    if (!extractFirstImageSrcFromTipTapJSON(content)) continue
    // 무내용 초안 차단 (2026-07-30) — 원문 0자로 생성돼 "세부 사항은 기사에서 확인"류
    // 필러만 있는 글 (hermes-reddit-1vank7k 사례). 80자 미만·자기지시 문구 = 자동발행 금지.
    if (isContentFreeDraft(content)) continue

    // 검사관 불통과 이력 → 재검사 안 함 (사람 검수 대기 중 — 비용·루프 방지)
    const priorGate = (row.decision?.auto_gate ?? null) as { pass?: boolean } | null
    if (priorGate?.pass === false) continue

    // 중복 차단 — 최근 발행 기사와 제목이 비슷하면 같은 소식의 재탕
    const dup = recentTitles.find((t) => titleSimilarity(t, title) >= 0.5)
    if (dup) {
      await supabase
        .from("news_reservoir")
        .update({
          decision: {
            ...(row.decision ?? {}),
            auto_gate: {
              pass: false,
              reasons: [`중복 기사 (기발행: ${dup.slice(0, 40)})`],
              at: new Date().toISOString(),
            },
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
      gated.push(`${row.id}: 중복`)
      continue
    }

    // 신뢰 계층화 — 이적 맥락 + 루머 티어는 자동발행 금지 (오보가 최악의 사고)
    const tier = classifyTier({
      category: null,
      original_title: title,
      headline_kr: title,
      link_url: row.urls?.source ?? null,
      source_id: null,
    })
    if (tier === "rumor" && TRANSFER_CONTEXT_RE.test(title)) continue

    // 품질 검사관 (작성과 별도 LLM) — fail-closed, 불통과는 사유와 함께 강등
    const verdict = await inspectDraft(title, content)
    let failReasons = verdict.pass ? [] : verdict.reasons
    if (verdict.pass && verdict.playerNamesKr.length > 0) {
      const unknown = unknownPlayerNames(verdict.playerNamesKr, dict ?? [])
      if (unknown.length > 0) failReasons = [`사전 미등재 선수명: ${unknown.join(", ")}`]
    }
    if (failReasons.length > 0) {
      await supabase
        .from("news_reservoir")
        .update({
          decision: {
            ...(row.decision ?? {}),
            auto_gate: { pass: false, reasons: failReasons, at: new Date().toISOString() },
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
      gated.push(`${row.id}: ${failReasons.join(" / ")}`)
      continue
    }

    const result = await publishNewsDraft(supabase, row, { title, content, auto: true })
    if (result.error) {
      // 실패 항목은 drafted 로 남는다 — 다음 run 재시도 또는 수동 검수로 처리 가능
      errors.push(`${row.id}: ${result.error}`)
      continue
    }
    published++
    publishedIds.push(result.postId!)
    // 같은 run 안의 다음 후보도 방금 발행분과 중복 검사되도록
    recentTitles.push(title)
  }

  return NextResponse.json({
    ok: errors.length === 0,
    published,
    postIds: publishedIds,
    todayTotal: (publishedToday ?? 0) + published,
    autoToday: (autoToday ?? 0) + published,
    ...(gated.length > 0 ? { gated } : {}),
    ...(errors.length > 0 ? { errors } : {}),
  })
}

export async function GET(request: NextRequest) {
  return run(request)
}
export async function POST(request: NextRequest) {
  return run(request)
}
