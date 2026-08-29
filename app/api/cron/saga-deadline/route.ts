import { NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { SAGA_DEADLINE_KST, SAGA_WINDOW_KEY } from "@/lib/saga/config"

export const dynamic = "force-dynamic"

/**
 * 사가 윈도우 마감 (W4 축소판 — 2026-08-04 운영자: "정산·소환 필요 없어, 로그만
 * 존재하면 돼"). 포인트·알림·소환 전부 없음. 하는 일 하나:
 *
 * 마감 시각(9/1 09:00 KST)이 지나면 아직 열려 있는 이번 윈도우 transfer 사가를
 * outcome '잔류(stayed)'로 일괄 종결한다 — 문서가 영원히 "진행 중 이적설"로 남아
 * 로그로서 부정확해지는 것만 막는다. 연표·투표 원장·스탠스 스냅샷은 그대로 영구 보존.
 *
 * 매일 돌지만 마감 전엔 no-op, 마감 후 다 닫히면 다시 no-op — 멱등.
 */
async function cronGet(request: Request) {
  const denied = verifyCronSecret(request)
  if (denied) return denied

  if (new Date() < new Date(SAGA_DEADLINE_KST)) {
    return NextResponse.json({ ok: true, skipped: "마감 전" })
  }

  const supabase = createServiceRoleClient()
  const now = new Date().toISOString()

  // outcome 은 stage 로 갈린다 (PRD §4.2: done=성사 / stayed=마감 미성사).
  // 2026-08-06 점검 실측: stage 필터 없이 전건 stayed 로 찍으면 이미 성사된 사가
  // 15건(살라·이한범 등)의 영구 기록이 "잔류"로 뒤집힐 예정이었다 — 성사분 먼저 분리.
  const { data: closedDone, error: doneError } = await supabase
    .from("sagas")
    .update({ status: "closed", outcome: "done", closed_at: now, updated_at: now })
    .eq("saga_type", "transfer")
    .eq("window_key", SAGA_WINDOW_KEY)
    .eq("status", "active")
    .eq("stage", "done")
    .select("slug")
  if (doneError) return NextResponse.json({ error: doneError.message }, { status: 500 })

  const { data: closedStayed, error } = await supabase
    .from("sagas")
    .update({ status: "closed", outcome: "stayed", closed_at: now, updated_at: now })
    .eq("saga_type", "transfer")
    .eq("window_key", SAGA_WINDOW_KEY)
    .eq("status", "active")
    .neq("stage", "done")
    .select("slug")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── 기계 보류 큐 시효 (2026-08-30 운영자: "시효 = 이적시장 마감까지") ──
  // 미등재·저신뢰 등으로 잠긴 이적설은 시장이 닫히면 뉴스 가치가 없다 — 폐기로 접어
  // 재평가 루프(문서상 status='queued'만 봄)에서 빠진다. 나중에 선수가 등재돼도
  // 부활하지 않는다(운영자 확정). 사람 검수 큐(에러 없는 queued)는 건드리지 않는다.
  // 기계 보류 에러는 전부 auto_hold:/auto_publish_failed: 접두사 — 'auto'로 함께 잡는다.
  // error 필드는 남긴다: status=discarded + error=auto_hold:... 조합이 "시효 폐기"의 기록이다.
  const { data: expired, error: expireError } = await supabase
    .from("saga_reservoir")
    .update({ status: "discarded", updated_at: now })
    .eq("status", "queued")
    .like("error", "auto%")
    .select("id")
  if (expireError) return NextResponse.json({ error: expireError.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    closedDone: (closedDone ?? []).map((s) => s.slug),
    closedStayed: (closedStayed ?? []).map((s) => s.slug),
    expiredHolds: (expired ?? []).length,
  })
}

export const GET = withCronLog("saga-deadline", cronGet)
