import { NextResponse } from "next/server"
import { requireStaffApi } from "@/lib/admin/roles"
import {
  freshness,
  fmtAge,
  worstStatus,
  PIPELINE_THRESHOLDS,
  type PipelineStatus,
} from "@/lib/admin/pipeline-status"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin2/dashboard — 새 작업대(/admin2)의 단일 데이터 소스.
 *
 * 기존 /api/admin/operations/dashboard 는 "숫자 나열"이라 무엇이 문제인지 읽어야
 * 알 수 있었다. 여기서는 운영자가 실제로 묻는 3가지에만 답한다:
 *   1. 파이프라인이 돌고 있나 (승부예측 크롤링 · AI 뉴스 · 티커)
 *   2. 내가 처리할 게 있나 (신고 · 검수 · 환불 · 정산)
 *   3. 돈이 새고 있나 (고아 슬립 · 배당 미기록 · 환불 실패)
 *
 * 각 항목은 status(ok|warn|down)를 스스로 판정해서 내려준다 — 화면은 색만 칠하면 된다.
 */

const H = 3600_000

/** 신선도 판정·표기는 lib/admin/pipeline-status 로 분리 (임계값 계약은 거기서 테스트한다) */
type Status = PipelineStatus

interface Pipeline {
  key: string
  label: string
  status: Status
  /** 마지막 활동 시각 (ISO) */
  lastAt: string | null
  /** 사람이 읽는 상태 설명 */
  detail: string
  /** 문제일 때 어디를 봐야 하는지 */
  hint?: string
}

interface QueueItem {
  key: string
  label: string
  count: number
  href: string
  /** 이 큐가 밀리면 위험한 정도 */
  severity: "high" | "normal"
  note?: string
  /** admin 만 처리 가능 — editor 에게는 내려보내지 않는다 (못 누르는 걸 보여주면 노이즈) */
  adminOnly?: boolean
}

export async function GET() {
  const gate = await requireStaffApi()
  if (gate instanceof NextResponse) return gate
  const { supabase, role } = gate

  const now = Date.now()
  const dayAgo = new Date(now - 24 * H).toISOString()

  // ── 병렬 조회 ────────────────────────────────────────────────────────
  const [
    betmanSync,
    latestGame,
    latestDraft,
    ticker,
    latestBotPost,
    pendingReports,
    pendingMetaReports,
    pendingStickers,
    newsQueue,
    aggQueue,
    sagaQueue,
    pendingRefunds,
    unsettledSlips,
    publishedToday,
    draftedToday,
  ] = await Promise.all([
    supabase
      .from("betman_sync_state")
      .select("last_checked_at, last_error")
      .order("last_checked_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ last_checked_at: string | null; last_error: string | null }>(),
    supabase
      .from("betman_games")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ created_at: string }>(),
    supabase
      .from("news_reservoir")
      .select("created_at")
      .eq("status", "drafted")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ created_at: string }>(),
    supabase
      .from("news_ticker_items")
      .select("updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ updated_at: string }>(),
    supabase
      .from("posts")
      .select("created_at")
      .eq("user_id", "user_bot_soccer_kr")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ created_at: string }>(),
    supabase
      .from("content_reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("metaverse_user_reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
    supabase.from("stickers").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase
      .from("news_reservoir")
      .select("id", { count: "exact", head: true })
      .eq("status", "drafted"),
    // 커뮤글 애그리게이터는 별도 테이블(agg_reservoir)이다 — news_reservoir 아님
    supabase
      .from("agg_reservoir")
      .select("id", { count: "exact", head: true })
      .eq("status", "drafted"),
    supabase
      .from("saga_reservoir")
      .select("id", { count: "exact", head: true })
      .eq("status", "queued"),
    supabase
      .from("pending_refunds")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("prediction_slips")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", "user_bot_soccer_kr")
      .is("deleted_at", null)
      .gte("created_at", dayAgo),
    supabase
      .from("news_reservoir")
      .select("id", { count: "exact", head: true })
      .eq("status", "drafted")
      .gte("created_at", dayAgo),
  ])

  // ── 1. 파이프라인 ────────────────────────────────────────────────────
  // 임계값 근거 (각 파이프라인의 실제 주기에서 나온다):
  //   betman  Vultr 2시간 주기(+ Vercel 30분 보조) → 3h warn / 6h down
  //   스캐너  15분 주기지만 새벽엔 소스가 조용 → 넉넉히 4h / 10h (아래 주석 참조)
  //   발행    사람 검수에 달림 → 24h / 72h
  //   티커    10분 주기 → 2h / 6h
  const betmanErr = betmanSync.data?.last_error
  const pipelines: Pipeline[] = [
    {
      key: "betman",
      label: "승부예측 경기 크롤링",
      status: betmanErr
        ? "down"
        : freshness(
            betmanSync.data?.last_checked_at ?? null,
            PIPELINE_THRESHOLDS.betman.warn,
            PIPELINE_THRESHOLDS.betman.down
          ),
      lastAt: betmanSync.data?.last_checked_at ?? null,
      detail: betmanErr
        ? `마지막 동기화에서 오류: ${String(betmanErr).slice(0, 120)}`
        : `마지막 확인 ${fmtAge(betmanSync.data?.last_checked_at ?? null)} · 최신 경기 등록 ${fmtAge(
            latestGame.data?.created_at ?? null
          )}`,
      hint: "Vultr VPS 의 /opt/betman/sync.sh 가 2시간마다 돈다. 지연이면 SSH 로 sync.log 확인",
    },
    {
      // 스캐너는 자체 heartbeat 가 없다 — 초안 유입으로만 살아있음을 안다.
      // 새벽에 레딧이 조용하면 유입이 끊길 수 있어 임계를 넉넉히(4h/10h) 잡았다.
      key: "news-scanner",
      label: "AI 뉴스 수집 (스캐너)",
      status: freshness(
        latestDraft.data?.created_at ?? null,
        PIPELINE_THRESHOLDS.newsScanner.warn,
        PIPELINE_THRESHOLDS.newsScanner.down
      ),
      lastAt: latestDraft.data?.created_at ?? null,
      detail: `마지막 초안 유입 ${fmtAge(latestDraft.data?.created_at ?? null)} · 24시간 유입 ${
        draftedToday.count ?? 0
      }건`,
      hint: "Vultr /opt/news-scanner 가 15분마다 돈다. 멈추면 검수 큐가 마른다 (새벽엔 소스가 조용해 유입이 늦을 수 있음)",
    },
    {
      key: "bot-publish",
      label: "AI 기사 발행",
      status: freshness(
        latestBotPost.data?.created_at ?? null,
        PIPELINE_THRESHOLDS.botPublish.warn,
        PIPELINE_THRESHOLDS.botPublish.down
      ),
      lastAt: latestBotPost.data?.created_at ?? null,
      detail: `마지막 발행 ${fmtAge(latestBotPost.data?.created_at ?? null)} · 24시간 발행 ${
        publishedToday.count ?? 0
      }건`,
      hint: "발행은 사람이 검수해야 일어난다 — 오래 비었으면 파이프라인이 아니라 검수가 멈춘 것",
    },
    {
      key: "ticker",
      label: "뉴스 티커 크롤러",
      status: freshness(
        ticker.data?.updated_at ?? null,
        PIPELINE_THRESHOLDS.ticker.warn,
        PIPELINE_THRESHOLDS.ticker.down
      ),
      lastAt: ticker.data?.updated_at ?? null,
      detail: `마지막 갱신 ${fmtAge(ticker.data?.updated_at ?? null)}`,
      hint: "Vultr /opt/crawlers/runner.js 10분 주기",
    },
  ]

  // ── 2. 처리 대기 큐 ──────────────────────────────────────────────────
  const queues: QueueItem[] = [
    {
      key: "reports",
      label: "신고",
      count: pendingReports.count ?? 0,
      href: "/admin2/reports",
      severity: "high",
      adminOnly: true,
      note: "처리(resolve) 누르면 카드·정지가 자동 적용된다",
    },
    {
      key: "metaverse-reports",
      label: "메타버스 신고",
      count: pendingMetaReports.count ?? 0,
      href: "/admin/content/metaverse-reports",
      severity: "high",
      adminOnly: true,
    },
    {
      key: "news-review",
      label: "AI 뉴스 검수",
      count: newsQueue.count ?? 0,
      // 새 빠른 검수 화면으로 — 전량 표시 + 만료 임박 순 + 단축키 + 일괄 반려
      href: "/admin2/news",
      severity: "normal",
      note: "48시간 지나면 자동 만료된다",
    },
    {
      key: "agg-review",
      label: "AI 커뮤글 검수",
      count: aggQueue.count ?? 0,
      href: "/admin2/agg",
      severity: "normal",
    },
    {
      key: "saga-review",
      label: "사가 검수",
      count: sagaQueue.count ?? 0,
      href: "/admin2/saga",
      severity: "normal",
      note: "발행하면 사가 문서 타임라인에 실린다 — 이 큐가 유일한 발행 경로",
    },
    {
      key: "refunds",
      label: "환불 큐",
      count: pendingRefunds.count ?? 0,
      href: "/admin/refunds",
      severity: "high",
      adminOnly: true,
      note: "골드 건은 수동 지급 후에 resolve 할 것",
    },
    {
      key: "settlements",
      label: "미정산 슬립",
      count: unsettledSlips.count ?? 0,
      href: "/admin/settlements",
      severity: "normal",
      adminOnly: true,
      note: "15분 크론이 대부분 자동 처리 — 남는 건만 확인",
    },
    {
      key: "stickers",
      label: "스티커 승인",
      count: pendingStickers.count ?? 0,
      href: "/admin/content/stickers",
      severity: "normal",
      adminOnly: true,
    },
  ]

  // ── 3. 돈 정합성 (ops-monitor 와 같은 판정) ──────────────────────────
  const money: { key: string; label: string; count: number; detail: string }[] = []
  try {
    // 결과가 확정됐는데 1시간 넘게 pending 인 예측 = 정산 누락
    const cutoff = new Date(now - H).toISOString()
    const { count } = await supabase
      .from("betman_predictions")
      .select("id, betman_games!inner(result, match_time)", { count: "exact", head: true })
      .eq("status", "pending")
      .not("betman_games.result", "is", null)
      .lt("betman_games.match_time", cutoff)
    if ((count ?? 0) > 0) {
      money.push({
        key: "orphan-settle",
        label: "정산 누락 의심",
        count: count ?? 0,
        detail: "경기 결과는 나왔는데 예측이 pending 이다. 15분 크론이 못 잡은 건",
      })
    }
  } catch {
    /* 조회 실패는 무시 — 화면이 죽는 것보다 낫다 */
  }

  try {
    const { count } = await supabase
      .from("betman_predictions")
      .select("id", { count: "exact", head: true })
      .gte("created_at", dayAgo)
      .or("locked_odds.is.null,locked_odds.eq.0")
    if ((count ?? 0) > 0) {
      money.push({
        key: "no-odds",
        label: "배당 미기록 예측",
        count: count ?? 0,
        detail: "최근 24시간. 정산 시 배당 0으로 계산될 수 있다",
      })
    }
  } catch {
    /* 무시 */
  }

  // editor 는 돈·신고에 손댈 수 없다 → 그 큐와 돈 경고를 아예 내려보내지 않는다.
  // 못 누르는 숫자를 보여주면 "누가 처리하겠지"가 아니라 그냥 노이즈가 된다.
  const isAdmin = role === "admin"
  const visibleQueues = isAdmin ? queues : queues.filter((q) => !q.adminOnly)

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      role,
      overall: worstStatus(pipelines.map((p) => p.status)),
      pipelines,
      queues: visibleQueues,
      money: isAdmin ? money : [],
      /** 어제 대비가 아니라 "오늘 내가 만든 결과" — 노동의 산출을 보여준다 */
      today: {
        publishedArticles: publishedToday.count ?? 0,
        newDrafts: draftedToday.count ?? 0,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } }
  )
}
