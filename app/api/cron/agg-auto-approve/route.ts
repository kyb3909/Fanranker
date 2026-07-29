import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import {
  todayCounts,
  nextSlot,
  personaNickname,
  hasPublishableMedia,
  type AggMediaItem,
} from "@/lib/agg/publish"
import aggConfig from "@/data/agents/config/aggregator.json"

export const dynamic = "force-dynamic"

/**
 * 커뮤글 자동승인 cron (30분 주기) — drafted 를 발행 큐(approved)에 넣는다.
 * 실제 게시는 기존 F17 분산 큐(agg-publish-queue, 10분 주기)가 20~60분 간격으로
 * 자연스럽게 처리하므로 여기서는 승인만 한다 — 발행 로직 중복 없음.
 *
 * 게이트 (운영자 승인 2026-07-29):
 *   1. 미디어(rehost 이미지 또는 X/유튜브 임베드) 있는 글만 — 텍스트만인 글은 사람 검수로
 *   2. 24시간 이내 초안만 — 떡밥은 시의성이 생명
 *   3. 기존 cap 그대로 — 일일/페르소나별 상한은 수동 승인과 같은 규칙(aggregator.json limits)
 *
 * 끄기: Vercel env AGG_AUTO_APPROVE=off (배포 없이 즉시).
 * audit 에 stage=auto-approve 로 남아 수동 승인과 구분된다.
 * 트레이드오프(운영자 감수): 자동승인분은 검수 교정이 없어 학습 신호(agg_training_entries)가
 * 줄어든다 — 무수정 발행율이 떨어지면 이 cron 을 끄고 검수 체제로 복귀.
 */

const PER_RUN_CAP = 3
const MAX_AGE_HOURS = 24

interface DraftRow {
  id: string
  rewritten: { title?: string; paragraphs?: string[]; persona_user_id?: string } | null
  media: AggMediaItem[] | null
  audit: unknown[] | null
  created_at: string
}

async function run(request: NextRequest) {
  const authError = verifyCronSecret(request)
  if (authError) return authError

  if (process.env.AGG_AUTO_APPROVE === "off") {
    return NextResponse.json({ ok: true, skipped: "AGG_AUTO_APPROVE=off" })
  }

  const supabase = createServiceRoleClient()
  const { dailyPublishCap, publishPerPersonaPerDay } = aggConfig.limits

  const counts = await todayCounts(supabase)
  if (counts.total >= dailyPublishCap) {
    return NextResponse.json({
      ok: true,
      approved: 0,
      skipped: `일일 cap ${dailyPublishCap} 도달 (예약분 포함)`,
    })
  }

  const freshCutoff = new Date(Date.now() - MAX_AGE_HOURS * 3600 * 1000).toISOString()
  const { data: drafts, error } = await supabase
    .from("agg_reservoir")
    .select("id, rewritten, media, audit, created_at")
    .eq("status", "drafted")
    .gte("created_at", freshCutoff)
    .order("created_at", { ascending: true }) // 오래된 것부터 — 큐 순서가 수집 순서를 따르게
    .limit(30)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // cap 은 승인할 때마다 소진되므로 로컬 사본으로 추적
  let total = counts.total
  const byPersona = { ...counts.byPersona }
  let approved = 0
  const approvedIds: string[] = []

  for (const row of (drafts ?? []) as DraftRow[]) {
    if (approved >= PER_RUN_CAP || total >= dailyPublishCap) break

    const rw = row.rewritten
    const persona = rw?.persona_user_id
    if (!rw?.title || !persona || !Array.isArray(rw.paragraphs) || rw.paragraphs.length === 0) {
      continue
    }
    if (!hasPublishableMedia(row.media)) continue // 텍스트만인 글은 사람 검수로만
    if ((byPersona[persona] ?? 0) >= publishPerPersonaPerDay) continue

    const scheduledAt = await nextSlot(supabase)
    const now = new Date().toISOString()
    const { error: updErr } = await supabase
      .from("agg_reservoir")
      .update({
        status: "approved",
        scheduled_at: scheduledAt,
        audit: [
          ...(row.audit ?? []),
          { at: now, stage: "auto-approve", scheduled_at: scheduledAt },
        ],
      })
      .eq("id", row.id)
      .eq("status", "drafted") // 동시 수동 검수와의 경합 방지 — 이미 처리됐으면 no-op
    if (updErr) continue

    approved++
    total++
    byPersona[persona] = (byPersona[persona] ?? 0) + 1
    approvedIds.push(row.id)
  }

  return NextResponse.json({
    ok: true,
    approved,
    ids: approvedIds,
    todayTotal: total,
    personas: Object.fromEntries(
      Object.entries(byPersona).map(([id, n]) => [personaNickname(id), n])
    ),
  })
}

export async function GET(request: NextRequest) {
  return run(request)
}
export async function POST(request: NextRequest) {
  return run(request)
}
