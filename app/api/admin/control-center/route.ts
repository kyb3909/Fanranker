import { NextResponse } from "next/server"
import { requireStaffApi } from "@/lib/admin/roles"
import { apiError } from "@/lib/api-error"
import { loadControlCenter, type Db } from "@/lib/admin/control-center-sources"
import {
  freshness,
  fmtAge,
  PIPELINE_THRESHOLDS,
  type PipelineStatus,
} from "@/lib/admin/pipeline-status"
import type { Observation, WorkItem } from "@/lib/admin/control-center"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/control-center — 관제 센터의 단일 데이터 소스 (2026-09-08).
 *
 * 종전에는 관리자 홈이 둘이었고 각자 다른 집계를 했다(`/admin` 의 서버 로더,
 * `/api/admin2/dashboard`). 두 화면을 번갈아 봐야 전체를 알 수 있었고, 두 곳 모두
 * 조회 실패를 `count ?? 0` 으로 삼켜 0건과 구별되지 않았다. 여기서 하나로 합친다.
 *
 * ## 계약
 * - 소스마다 **관측 상태**를 따로 내려보낸다. 숫자는 `ok` 일 때만 의미가 있다.
 * - `editor` 는 돈·신고 업무를 내려받지 못한다. 메뉴를 숨기는 것과 별개로 서버가 자른다.
 * - 캐시는 `next.config.mjs` 의 `/api/admin` 규칙(no-store)을 따른다.
 */

/** editor 에게 내려보내지 않는 업무 — 돈과 제재는 admin 전권이다 */
const ADMIN_ONLY_DOMAINS = new Set(["재화·정산", "신고·문의"])

interface PipelineRow {
  key: string
  label: string
  status: PipelineStatus
  detail: string
  hint: string
}

export async function GET() {
  try {
    const gate = await requireStaffApi()
    if (gate instanceof NextResponse) return gate
    const { supabase, role } = gate

    const [data, pipelines] = await Promise.all([
      loadControlCenter(supabase),
      loadPipelines(supabase),
    ])

    const isAdmin = role === "admin"
    const items: WorkItem[] = isAdmin
      ? data.items
      : data.items.filter((i) => !ADMIN_ONLY_DOMAINS.has(i.domain))
    // 관측 범위도 같이 좁힌다 — 못 보는 영역을 "확인함"으로 세면 종료 판단이 거짓이 된다
    const hiddenKeys = new Set(
      data.items.filter((i) => ADMIN_ONLY_DOMAINS.has(i.domain)).map((i) => i.key)
    )
    const observations: Observation[] = isAdmin
      ? data.observations
      : data.observations.filter((o) => !hiddenKeys.has(o.key))

    return NextResponse.json({
      generatedAt: data.generatedAt,
      role,
      observations,
      items,
      outcomes: isAdmin ? data.outcomes : [],
      pipelines,
    })
  } catch (error) {
    return apiError("관제 센터 데이터를 불러오지 못했습니다.", 500, error)
  }
}

/**
 * 자동 파이프라인 신선도 — `/admin2` 작업대가 쓰던 판정을 그대로 가져온다.
 * 임계값 계약은 `lib/admin/pipeline-status` 가 소유하고 테스트도 거기 있다.
 */
async function loadPipelines(supabase: Db): Promise<PipelineRow[]> {
  const [betmanSync, latestDraft, ticker, latestBotPost] = await Promise.all([
    supabase
      .from("betman_sync_state")
      .select("last_checked_at, last_error")
      .order("last_checked_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("news_reservoir")
      .select("created_at")
      .eq("status", "drafted")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("news_ticker_items")
      .select("updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("posts")
      .select("created_at")
      .eq("user_id", "user_bot_soccer_kr")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const syncRow = betmanSync.data as {
    last_checked_at: string | null
    last_error: string | null
  } | null
  const draftRow = latestDraft.data as { created_at: string } | null
  const tickerRow = ticker.data as { updated_at: string } | null
  const botRow = latestBotPost.data as { created_at: string } | null

  return [
    {
      key: "betman",
      label: "승부예측 경기 크롤링",
      // 조회 자체가 실패하면 신선도를 알 수 없다 — 정상으로 두면 첫 장애를 놓친다
      status: betmanSync.error
        ? "down"
        : syncRow?.last_error
          ? "down"
          : freshness(
              syncRow?.last_checked_at ?? null,
              PIPELINE_THRESHOLDS.betman.warn,
              PIPELINE_THRESHOLDS.betman.down
            ),
      detail: betmanSync.error
        ? "상태를 조회하지 못했습니다"
        : syncRow?.last_error
          ? `마지막 동기화 오류: ${String(syncRow.last_error).slice(0, 120)}`
          : `마지막 확인 ${fmtAge(syncRow?.last_checked_at ?? null)}`,
      hint: "서울 VPS 의 동기화 스크립트가 2시간마다 돕니다",
    },
    {
      key: "news-scanner",
      label: "AI 뉴스 수집",
      status: latestDraft.error
        ? "down"
        : freshness(
            draftRow?.created_at ?? null,
            PIPELINE_THRESHOLDS.newsScanner.warn,
            PIPELINE_THRESHOLDS.newsScanner.down
          ),
      detail: latestDraft.error
        ? "상태를 조회하지 못했습니다"
        : `마지막 초안 유입 ${fmtAge(draftRow?.created_at ?? null)}`,
      hint: "멈추면 검수 큐가 마릅니다. 새벽에는 원래 유입이 늦습니다",
    },
    {
      key: "bot-publish",
      label: "AI 기사 발행",
      status: latestBotPost.error
        ? "down"
        : freshness(
            botRow?.created_at ?? null,
            PIPELINE_THRESHOLDS.botPublish.warn,
            PIPELINE_THRESHOLDS.botPublish.down
          ),
      detail: latestBotPost.error
        ? "상태를 조회하지 못했습니다"
        : `마지막 발행 ${fmtAge(botRow?.created_at ?? null)}`,
      hint: "발행은 사람 검수에 달렸습니다 — 오래 비었으면 검수가 멈춘 것입니다",
    },
    {
      key: "ticker",
      label: "뉴스 티커 크롤러",
      status: ticker.error
        ? "down"
        : freshness(
            tickerRow?.updated_at ?? null,
            PIPELINE_THRESHOLDS.ticker.warn,
            PIPELINE_THRESHOLDS.ticker.down
          ),
      detail: ticker.error
        ? "상태를 조회하지 못했습니다"
        : `마지막 갱신 ${fmtAge(tickerRow?.updated_at ?? null)}`,
      hint: "담벼락 티커의 유일한 공급로입니다",
    },
  ]
}
