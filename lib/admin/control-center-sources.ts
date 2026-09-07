import "server-only"

import type { createServiceRoleClient } from "@/lib/supabase/server"
import {
  probeCount,
  type CountProbe,
  type Observation,
  type ObservationState,
  type OutcomeItem,
  type OutcomeState,
  type WorkItem,
} from "@/lib/admin/control-center"

/**
 * 관제 센터 데이터 수집 — 서버 전용 (2026-09-08).
 *
 * ## 규칙 하나
 * **조회 실패를 0건으로 만들지 않는다.** 모든 집계는 `probeCount` 를 거치고, 실패하면
 * 숫자가 아니라 `failed` 가 나온다. 종전 두 홈(`app/admin/_dashboard/data.ts`,
 * `app/api/admin2/dashboard/route.ts`)은 전부 `count ?? 0` 이라 권한·네트워크 오류가
 * 초록색 0건으로 보였다.
 *
 * ## 왜 라우트가 아니라 여기인가
 * 화면·테스트가 같은 함수를 부를 수 있어야 하고, 라우트 파일이 커지면 어떤 소스가
 * 빠졌는지 아무도 못 센다. 소스 목록이 곧 관측 범위 선언이다.
 */

const H = 3600_000
const DAY = 24 * H

/** 서비스 롤 클라이언트 — 권한 판정 헬퍼들이 돌려주는 것과 같은 타입이어야 한다 */
export type Db = ReturnType<typeof createServiceRoleClient>

/** count + 가장 오래된 행의 시각을 함께 잰다. 최장 대기가 우선순위의 근거이기 때문이다 */
interface QueueProbe extends CountProbe {
  oldestAt: string | null
}

/**
 * 조회 조건을 선언으로 받는다 — 빌더를 콜백으로 넘기면 count 용과 oldest 용
 * 두 벌을 만들 때 한쪽만 필터가 빠지는 사고가 난다.
 */
type Filter =
  | { op: "eq"; col: string; val: unknown }
  | { op: "neq"; col: string; val: unknown }
  | { op: "gte"; col: string; val: unknown }
  | { op: "notNull"; col: string }

interface QuerySpec {
  table: string
  filters: Filter[]
  /** 최장 대기를 재는 시각 컬럼 */
  timeCol?: string
}

/** eslint 을 위한 최소 빌더 타입 — supabase 제네릭 전체를 끌고 오지 않는다 */
type Builder = {
  eq: (c: string, v: never) => Builder
  neq: (c: string, v: never) => Builder
  gte: (c: string, v: never) => Builder
  not: (c: string, op: string, v: never) => Builder
}

function applyFilters<T>(query: T, filters: Filter[]): T {
  let q = query as unknown as Builder
  for (const f of filters) {
    if (f.op === "eq") q = q.eq(f.col, f.val as never)
    else if (f.op === "neq") q = q.neq(f.col, f.val as never)
    else if (f.op === "gte") q = q.gte(f.col, f.val as never)
    else q = q.not(f.col, "is", null as never)
  }
  return q as unknown as T
}

async function probeQueue(db: Db, spec: QuerySpec): Promise<QueueProbe> {
  const timeCol = spec.timeCol ?? "created_at"
  try {
    const [countRes, oldestRes] = await Promise.all([
      applyFilters(db.from(spec.table).select("*", { count: "exact", head: true }), spec.filters),
      applyFilters(db.from(spec.table).select(timeCol), spec.filters)
        .order(timeCol, { ascending: true })
        .limit(1)
        .maybeSingle(),
    ])
    const probe = probeCount(countRes)
    const oldestRow = oldestRes.data as Record<string, string> | null
    return {
      ...probe,
      oldestAt: probe.state === "ok" && !oldestRes.error ? (oldestRow?.[timeCol] ?? null) : null,
    }
  } catch (e) {
    return {
      count: null,
      state: "failed",
      note: e instanceof Error ? e.message.slice(0, 160) : "조회 실패",
      oldestAt: null,
    }
  }
}

const eq = (col: string, val: unknown): Filter => ({ op: "eq", col, val })
const neq = (col: string, val: unknown): Filter => ({ op: "neq", col, val })
const gte = (col: string, val: unknown): Filter => ({ op: "gte", col, val })

/** 조회 결과를 관측 기록으로 — 화면 상단의 "확인한 범위"가 이 배열이다 */
function observe(key: string, label: string, probe: CountProbe, now: string): Observation {
  return {
    key,
    label,
    state: probe.state,
    observedAt: probe.state === "ok" ? now : null,
    lastOkAt: probe.state === "ok" ? now : null,
    note: probe.note,
  }
}

/** 마감이 있는 업무의 기한 — 가장 오래된 건 기준 */
function dueFrom(oldestAt: string | null, hours: number): string | null {
  if (!oldestAt) return null
  const t = new Date(oldestAt).getTime()
  if (Number.isNaN(t)) return null
  return new Date(t + hours * H).toISOString()
}

export interface ControlCenterData {
  generatedAt: string
  observations: Observation[]
  items: WorkItem[]
  outcomes: OutcomeItem[]
}

export async function loadControlCenter(db: Db): Promise<ControlCenterData> {
  const now = Date.now()
  const nowIso = new Date(now).toISOString()
  const dayAgo = new Date(now - DAY).toISOString()
  const twoDaysAgo = new Date(now - 2 * DAY).toISOString()

  const [
    reportsPending,
    reportsReviewing,
    metaReports,
    inquiriesOpen,
    newsErrors,
    refundsPending,
    refundsFailed,
    sellerRewards,
    unsettledSlips,
    newsQueue,
    aggQueue,
    sagaQueue,
    sagaBlocked,
    squadBacklog,
    stickers,
    invariants,
    cronFails,
    crawlerFails,
  ] = await Promise.all([
    probeQueue(db, { table: "content_reports", filters: [eq("status", "pending")] }),
    probeQueue(db, { table: "content_reports", filters: [eq("status", "reviewing")] }),
    probeQueue(db, { table: "metaverse_user_reports", filters: [eq("status", "open")] }),
    probeQueue(db, { table: "inquiries", filters: [eq("status", "open")] }),
    probeQueue(db, { table: "news_error_reports", filters: [eq("status", "pending")] }),
    probeQueue(db, { table: "pending_refunds", filters: [eq("status", "pending")] }),
    probeQueue(db, { table: "pending_refunds", filters: [eq("status", "failed")] }),
    probeQueue(db, { table: "pending_seller_rewards", filters: [eq("status", "pending")] }),
    probeQueue(db, { table: "prediction_slips", filters: [eq("status", "pending")] }),
    probeQueue(db, { table: "news_reservoir", filters: [eq("status", "drafted")] }),
    probeQueue(db, { table: "agg_reservoir", filters: [eq("status", "drafted")] }),
    probeQueue(db, { table: "saga_reservoir", filters: [eq("status", "pending")] }),
    probeQueue(db, {
      table: "saga_reservoir",
      filters: [eq("status", "queued"), eq("error", "auto_hold:unknown_player")],
    }),
    probeQueue(db, {
      table: "team_squads",
      filters: [{ op: "notNull", col: "name_kr_draft" }, neq("status", "confirmed")],
      timeCol: "updated_at",
    }),
    probeQueue(db, { table: "stickers", filters: [eq("status", "pending")] }),
    probeQueue(db, {
      table: "invariant_findings",
      filters: [eq("status", "open")],
      timeCol: "first_seen_at",
    }),
    probeQueue(db, {
      table: "cron_run_log",
      filters: [neq("status", "success"), gte("started_at", dayAgo)],
      timeCol: "started_at",
    }),
    probeQueue(db, {
      table: "crawler_run_log",
      filters: [eq("status", "error"), gte("started_at", dayAgo)],
      timeCol: "started_at",
    }),
  ])

  // 경기 결과 대기 — 행이 아니라 **경기 수**로 센다 (한 경기 = 마켓별 여러 행).
  // 킥오프 +5h 부터만 — 그 전은 그냥 지금 뛰는 경기다(관제실과 같은 정의).
  const matchesProbe = await probeUnsettledMatches(db, now)
  // 정산 누락 의심 — 결과는 나왔는데 예측이 pending
  const orphanProbe = await probeOrphanSettlement(db, now)

  const observations: Observation[] = [
    observe("reports", "신고", reportsPending, nowIso),
    observe("metaverse-reports", "메타버스 신고", metaReports, nowIso),
    observe("news-errors", "뉴스 오류 제보", newsErrors, nowIso),
    observe("refunds", "환불 큐", refundsPending, nowIso),
    observe("seller-rewards", "판매자 미지급", sellerRewards, nowIso),
    observe("settlement", "정산", unsettledSlips, nowIso),
    observe("matches", "경기 결과", matchesProbe, nowIso),
    observe("news-review", "뉴스 검수", newsQueue, nowIso),
    observe("agg-review", "커뮤글 검수", aggQueue, nowIso),
    observe("saga-review", "사가 검수", sagaQueue, nowIso),
    observe("squad", "선수단 사전", squadBacklog, nowIso),
    observe("stickers", "스티커 승인", stickers, nowIso),
    observe("invariants", "불변식 감사", invariants, nowIso),
    observe("cron", "예약 작업", cronFails, nowIso),
    observe("crawler", "크롤러", crawlerFails, nowIso),
    // 접수 경로가 없는 업무는 0건이 아니라 미연결이다. 조회는 되므로 값은 참고로 남긴다.
    {
      key: "inquiries",
      label: "문의",
      state: "unwired",
      observedAt: null,
      lastOkAt: inquiriesOpen.state === "ok" ? nowIso : null,
      note: "사용자 문의 접수 경로가 아직 없습니다. 표에 쌓인 것만 셀 수 있습니다.",
    },
    {
      key: "prize-delivery",
      label: "경품 전달",
      state: "unwired",
      observedAt: null,
      lastOkAt: null,
      note: "추첨은 자동이지만 기프티콘 전달·수령 기록을 남기는 곳이 없습니다.",
    },
  ]

  const items: WorkItem[] = [
    {
      key: "reports-pending",
      domain: "신고·문의",
      label: "미처리 신고",
      impact: "신고 대상 게시물이 그대로 노출됩니다",
      count: reportsPending.count ?? 0,
      oldestAt: reportsPending.oldestAt,
      // 신고 큐 UI 의 SLA 표기(레드 1시간·옐로 24시간) 중 느슨한 쪽을 기한으로 쓴다.
      // ⚠️ 이 값은 화면 코드에서 온 관행이고 운영자가 승인한 SLA 로 확인된 것은 아니다.
      dueAt: dueFrom(reportsPending.oldestAt, 24),
      owner: null,
      state: "actionable",
      nextAction: "증거를 열고 판정",
      href: "/admin/content/reports?status=pending&sort=oldest",
      severity: "high",
      observation: reportsPending.state,
      actionWired: true,
    },
    {
      key: "reports-reviewing",
      domain: "신고·문의",
      label: "검토 중인 신고",
      impact: "인수만 되고 판정이 남았습니다",
      count: reportsReviewing.count ?? 0,
      oldestAt: reportsReviewing.oldestAt,
      dueAt: dueFrom(reportsReviewing.oldestAt, 24),
      owner: "인수됨",
      state: "actionable",
      nextAction: "판정을 확정",
      href: "/admin/content/reports?status=reviewing&sort=oldest",
      severity: "normal",
      observation: reportsReviewing.state,
      actionWired: true,
    },
    {
      key: "metaverse-reports",
      domain: "신고·문의",
      label: "메타버스 신고",
      // 실제 코드 확인: 상태만 바꾸고 ban/mute 를 부르지 않는다. 같은 "완료"로 말하면 안 된다.
      impact: "기록만 남습니다 — 이 화면의 조치는 실제 제재가 아닙니다",
      count: metaReports.count ?? 0,
      oldestAt: metaReports.oldestAt,
      dueAt: null,
      owner: null,
      state: "actionable",
      nextAction: "검토하고 상태 기록",
      href: "/admin/content/metaverse-reports",
      severity: "normal",
      observation: metaReports.state,
      actionWired: true,
      note: "제재가 필요하면 일반 신고 경로로 따로 처리해야 합니다",
    },
    {
      key: "news-errors",
      domain: "신고·문의",
      label: "뉴스 오류 제보",
      impact: "발행된 기사에 오류 지적이 달렸습니다",
      count: newsErrors.count ?? 0,
      oldestAt: newsErrors.oldestAt,
      dueAt: null,
      owner: null,
      state: "actionable",
      nextAction: "기사 확인 후 수정",
      href: "/admin/news-review",
      severity: "normal",
      observation: newsErrors.state,
      actionWired: true,
    },
    {
      key: "inquiries",
      domain: "신고·문의",
      label: "문의",
      impact: "접수 경로가 없어 사용자가 문의를 넣을 수 없습니다",
      count: inquiriesOpen.count ?? 0,
      oldestAt: inquiriesOpen.oldestAt,
      dueAt: null,
      owner: null,
      state: "blocked",
      nextAction: "접수·답변 경로를 먼저 배선",
      href: null,
      severity: "low",
      observation: "unwired",
      actionWired: false,
    },

    {
      key: "refunds-pending",
      domain: "재화·정산",
      label: "환불 대기",
      impact: "사용자가 돌려받아야 할 볼·골드입니다",
      count: refundsPending.count ?? 0,
      oldestAt: refundsPending.oldestAt,
      dueAt: dueFrom(refundsPending.oldestAt, 24),
      owner: null,
      state: "actionable",
      nextAction: "통화를 확인하고 지급",
      href: "/admin/refunds?status=pending&sort=oldest",
      severity: "critical",
      observation: refundsPending.state,
      actionWired: true,
    },
    {
      key: "refunds-failed",
      domain: "재화·정산",
      label: "환불 실패",
      impact: "자동 재시도가 소진된 미지급입니다",
      count: refundsFailed.count ?? 0,
      oldestAt: refundsFailed.oldestAt,
      dueAt: dueFrom(refundsFailed.oldestAt, 12),
      owner: null,
      state: "actionable",
      nextAction: "실패 사유를 보고 수동 지급",
      href: "/admin/refunds?status=failed&sort=oldest",
      severity: "critical",
      observation: refundsFailed.state,
      actionWired: true,
    },
    {
      key: "seller-rewards",
      domain: "재화·정산",
      label: "판매자 미지급",
      impact: "분석글 판매 수익이 판매자에게 안 갔습니다",
      count: sellerRewards.count ?? 0,
      oldestAt: sellerRewards.oldestAt,
      dueAt: dueFrom(sellerRewards.oldestAt, 24),
      owner: null,
      state: "actionable",
      nextAction: "골드를 수동 지급 — 이 앱에는 처리 화면이 없습니다",
      href: null,
      severity: "critical",
      observation: sellerRewards.state,
      // 큐에 쌓기만 하고 읽는 코드가 없었다. 여기서 처음 보이게 했지만 처리 경로는 여전히 없다.
      actionWired: false,
      note: "지급·기록 화면이 아직 없어 숫자만 보여줍니다",
    },
    {
      key: "orphan-settlement",
      domain: "재화·정산",
      label: "정산 누락 의심",
      impact: "경기 결과는 나왔는데 예측이 아직 대기입니다",
      count: orphanProbe.count ?? 0,
      oldestAt: null,
      dueAt: null,
      owner: null,
      state: "actionable",
      nextAction: "정산 화면에서 확인",
      href: "/admin/settlements",
      severity: "critical",
      observation: orphanProbe.state,
      actionWired: true,
    },
    {
      key: "matches-unsettled",
      domain: "재화·정산",
      label: "경기 결과 대기",
      impact:
        matchesProbe.waitingPredictions > 0
          ? `걸린 예측 ${matchesProbe.waitingPredictions}건이 정산을 못 받습니다`
          : "걸린 예측이 없어 사용자 피해는 없습니다",
      count: matchesProbe.count ?? 0,
      oldestAt: matchesProbe.oldestAt,
      dueAt: null,
      owner: null,
      state: "actionable",
      nextAction: "결과를 확인하고 입력",
      href: "/admin/matches",
      // 걸린 예측이 없으면 급하지 않다 — 건수가 아니라 피해가 기준이다
      severity: matchesProbe.waitingPredictions > 0 ? "high" : "normal",
      observation: matchesProbe.state,
      actionWired: true,
      note:
        matchesProbe.sample.length > 0 ? matchesProbe.sample.slice(0, 3).join(" · ") : undefined,
    },
    {
      key: "settlement-slips",
      domain: "재화·정산",
      label: "미정산 슬립",
      impact: "15분 크론이 대부분 자동 처리합니다",
      count: unsettledSlips.count ?? 0,
      oldestAt: unsettledSlips.oldestAt,
      dueAt: null,
      owner: "정산 크론",
      state: "waiting_auto",
      nextAction: "남는 건만 수동 정산",
      href: "/admin/settlements",
      severity: "normal",
      observation: unsettledSlips.state,
      actionWired: true,
      nextCheckAt: new Date(now + 15 * 60_000).toISOString(),
    },
    {
      key: "prize-delivery",
      domain: "재화·정산",
      label: "경품 전달",
      impact: "당첨자에게 기프티콘을 보냈는지 기록이 없습니다",
      count: 0,
      oldestAt: null,
      dueAt: null,
      owner: null,
      state: "blocked",
      nextAction: "전달·수령 기록 경로를 먼저 배선",
      href: null,
      severity: "low",
      observation: "unwired",
      actionWired: false,
    },

    {
      key: "news-review",
      domain: "검수",
      label: "뉴스 검수",
      impact: "24시간이 지나면 자동 만료됩니다",
      count: newsQueue.count ?? 0,
      oldestAt: newsQueue.oldestAt,
      dueAt: dueFrom(newsQueue.oldestAt, 24),
      owner: null,
      state: "actionable",
      nextAction: "원문과 초안을 비교하고 발행",
      href: "/admin/news-review",
      severity: "normal",
      observation: newsQueue.state,
      actionWired: true,
    },
    {
      key: "saga-blocked",
      domain: "검수",
      label: "이름 때문에 막힌 소식",
      impact: "표기를 등재해야 사가로 넘어갑니다",
      count: sagaBlocked.count ?? 0,
      oldestAt: sagaBlocked.oldestAt,
      dueAt: null,
      owner: null,
      state: "blocked",
      nextAction: "한글 표기를 확인하고 등재",
      href: "/admin/news-review",
      severity: "normal",
      observation: sagaBlocked.state,
      actionWired: true,
    },
    {
      key: "saga-review",
      domain: "검수",
      label: "사가 검수",
      impact: "사가 타임라인에 실릴 항목입니다",
      count: sagaQueue.count ?? 0,
      oldestAt: sagaQueue.oldestAt,
      dueAt: null,
      owner: null,
      state: "actionable",
      nextAction: "검수 후 발행",
      href: "/admin/saga-review",
      severity: "normal",
      observation: sagaQueue.state,
      actionWired: true,
    },
    {
      key: "agg-review",
      domain: "검수",
      label: "커뮤글 검수",
      impact: "애그리게이터 소스가 현재 휴면입니다",
      count: aggQueue.count ?? 0,
      oldestAt: aggQueue.oldestAt,
      dueAt: null,
      owner: null,
      state: "actionable",
      nextAction: "검수 후 발행",
      href: "/admin/agg-review",
      severity: "low",
      observation: aggQueue.state,
      actionWired: true,
    },
    {
      key: "squad-backlog",
      domain: "검수",
      label: "선수단 사전 백로그",
      impact: "마감 없음 — 틈날 때 한 줄씩",
      count: squadBacklog.count ?? 0,
      oldestAt: squadBacklog.oldestAt,
      dueAt: null,
      owner: null,
      state: "actionable",
      nextAction: "표기를 확인하고 승인",
      href: "/admin/team-squads",
      severity: "low",
      observation: squadBacklog.state,
      actionWired: true,
    },
    {
      key: "stickers",
      domain: "검수",
      label: "스티커 승인",
      impact: "제출자가 승인을 기다립니다",
      count: stickers.count ?? 0,
      oldestAt: stickers.oldestAt,
      dueAt: null,
      owner: null,
      state: "actionable",
      nextAction: "검토 후 승인",
      href: "/admin/content/stickers",
      severity: "low",
      observation: stickers.state,
      actionWired: true,
    },

    {
      key: "invariants",
      domain: "자동화·감시",
      label: "불변식 경보",
      impact: "데이터 정합성 감사가 잡은 미해결입니다",
      count: invariants.count ?? 0,
      oldestAt: invariants.oldestAt,
      dueAt: null,
      owner: null,
      state: "actionable",
      nextAction: "발견 내용을 확인",
      href: "/admin/operations",
      severity: "high",
      observation: invariants.state,
      actionWired: true,
    },
    {
      key: "cron-fails",
      domain: "자동화·감시",
      label: "예약 작업 실패 (24시간)",
      impact: "실패한 작업의 산출물이 비어 있을 수 있습니다",
      count: cronFails.count ?? 0,
      oldestAt: cronFails.oldestAt,
      dueAt: null,
      owner: "예약 실행",
      state: "waiting_auto",
      nextAction: "반복되면 로그 확인",
      href: "/admin/operations",
      severity: "normal",
      observation: cronFails.state,
      actionWired: true,
      nextCheckAt: new Date(now + H).toISOString(),
    },
    {
      key: "crawler-fails",
      domain: "자동화·감시",
      label: "크롤러 실패 (24시간)",
      impact: "수집이 비면 티커·뉴스가 마릅니다",
      count: crawlerFails.count ?? 0,
      oldestAt: crawlerFails.oldestAt,
      dueAt: null,
      owner: "크롤러",
      state: "waiting_auto",
      nextAction: "반복되면 VPS 로그 확인",
      href: "/admin/operations",
      severity: "normal",
      observation: crawlerFails.state,
      actionWired: true,
      nextCheckAt: new Date(now + H).toISOString(),
    },
  ]

  const outcomes = await loadRecentOutcomes(db, twoDaysAgo)

  return { generatedAt: nowIso, observations, items, outcomes }
}

interface MatchProbe extends CountProbe {
  oldestAt: string | null
  waitingPredictions: number
  sample: string[]
}

/**
 * 경기 결과 대기 — 관제실과 **같은 정의**를 쓴다.
 * 킥오프 +5시간 경과 & result null, 행이 아니라 (홈·원정·시각) 경기 단위.
 */
async function probeUnsettledMatches(db: Db, now: number): Promise<MatchProbe> {
  const res = await db
    .from("betman_games")
    .select("id, home_team_name, away_team_name, match_time")
    .lt("match_time", new Date(now - 5 * H).toISOString())
    .is("result", null)
    .limit(500)

  if (res.error) {
    return {
      count: null,
      state: "failed",
      note: String(res.error.message ?? "").slice(0, 160),
      oldestAt: null,
      waitingPredictions: 0,
      sample: [],
    }
  }

  const rows = (res.data ?? []) as {
    id: string
    home_team_name: string
    away_team_name: string
    match_time: string
  }[]
  const byMatch = new Map<string, { label: string; at: string }>()
  for (const g of rows) {
    const key = `${g.home_team_name}|${g.away_team_name}|${g.match_time}`
    if (!byMatch.has(key)) {
      byMatch.set(key, { label: `${g.home_team_name} vs ${g.away_team_name}`, at: g.match_time })
    }
  }
  const entries = [...byMatch.values()].sort((a, b) => a.at.localeCompare(b.at))

  let waiting = 0
  if (rows.length > 0) {
    // 실제 피해 규모 — 아직 정산을 못 받은 예측만 센다
    const pred = await db
      .from("betman_predictions")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .in(
        "game_id",
        rows.map((g) => g.id)
      )
    waiting = pred.error ? 0 : (pred.count ?? 0)
  }

  return {
    count: byMatch.size,
    state: "ok",
    oldestAt: entries[0]?.at ?? null,
    waitingPredictions: waiting,
    sample: entries.map((e) => e.label),
  }
}

/** 정산 누락 의심 — 결과가 확정됐는데 1시간 넘게 pending 인 예측 */
async function probeOrphanSettlement(db: Db, now: number): Promise<CountProbe> {
  try {
    const res = await db
      .from("betman_predictions")
      .select("id, betman_games!inner(result, match_time)", { count: "exact", head: true })
      .eq("status", "pending")
      .not("betman_games.result", "is", null)
      .lt("betman_games.match_time", new Date(now - H).toISOString())
    return probeCount(res)
  } catch (e) {
    return { count: null, state: "failed", note: e instanceof Error ? e.message : "조회 실패" }
  }
}

/* ───────────────────────── 최근 처리 결과 ───────────────────────── */

interface AuditRow {
  id: string
  admin_user_id: string | null
  action: string
  target_type: string | null
  target_id: string | null
  details: Record<string, unknown> | null
  created_at: string
}

const ACTION_LABEL: Record<string, string> = {
  resolve_report: "신고 인정",
  dismiss_report: "신고 기각",
  review_report: "신고 인수",
  metaverse_report_actioned: "메타버스 신고 상태 기록",
  metaverse_report_reviewed: "메타버스 신고 검토",
  metaverse_report_dismissed: "메타버스 신고 기각",
  refund_retry: "환불 자동 재시도",
  refund_resolve: "환불 큐 종료",
}

/**
 * 최근 조치와 **서버에서 확인 가능한 실제 효과**.
 *
 * 감사 로그는 "요청했다"만 말한다. 그래서 대상 행을 다시 읽어 효과를 대조한다 —
 * 신고는 상태와 카드 발급 여부를, 환불은 큐 상태를 본다. 대조 못 하면
 * `requested`(결과 미확인)로 남기고 성공이라고 부르지 않는다.
 */
async function loadRecentOutcomes(db: Db, since: string): Promise<OutcomeItem[]> {
  const res = await db
    .from("admin_audit_logs")
    .select("id, admin_user_id, action, target_type, target_id, details, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20)
  if (res.error) return []

  const rows = (res.data ?? []) as AuditRow[]
  if (rows.length === 0) return []

  const reportIds = rows
    .filter((r) => r.action.endsWith("_report") && r.target_id)
    .map((r) => String(r.target_id))
  const refundIds = rows
    .filter((r) => r.action.startsWith("refund_") && r.target_id)
    .map((r) => String(r.target_id))

  const [reportRows, cardRows, refundRows] = await Promise.all([
    reportIds.length
      ? db.from("content_reports").select("id, status, resolved_at").in("id", reportIds)
      : Promise.resolve({ data: [], error: null }),
    reportIds.length
      ? db.from("user_cards").select("report_id, card_type").in("report_id", reportIds)
      : Promise.resolve({ data: [], error: null }),
    refundIds.length
      ? db.from("pending_refunds").select("id, status, currency, amount").in("id", refundIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  const reportById = new Map(
    ((reportRows.data ?? []) as { id: string; status: string }[]).map((r) => [r.id, r])
  )
  const cardsByReport = new Map<string, string[]>()
  for (const c of (cardRows.data ?? []) as { report_id: string; card_type: string }[]) {
    const list = cardsByReport.get(c.report_id)
    if (list) list.push(c.card_type)
    else cardsByReport.set(c.report_id, [c.card_type])
  }
  const refundById = new Map(
    (
      (refundRows.data ?? []) as {
        id: string
        status: string
        currency: string | null
        amount: number
      }[]
    ).map((r) => [r.id, r])
  )

  return rows.map((row) => {
    const target = String(row.target_id ?? "")
    let state: OutcomeState = "requested"
    let evidence = "대상을 다시 읽지 못해 효과를 확인하지 못했습니다"

    if (row.action === "resolve_report") {
      const report = reportById.get(target)
      const cards = cardsByReport.get(target) ?? []
      if (!report) {
        state = "requested"
        evidence = "신고 행을 찾지 못했습니다"
      } else if (report.status !== "resolved") {
        state = "failed"
        evidence = `신고 상태가 ${report.status} 입니다 — 인정이 반영되지 않았습니다`
      } else if (cards.length === 0) {
        // 카드 발급 실패는 200 으로 감춰졌었다. 여기서는 부분 성공으로 드러낸다.
        state = "partial"
        evidence = "신고는 인정됐지만 카드 발급 기록이 없습니다"
      } else {
        state = "applied"
        evidence = `신고 인정 · ${cards.join(", ")} 카드 발급됨`
      }
    } else if (row.action === "dismiss_report" || row.action === "review_report") {
      const report = reportById.get(target)
      const expected = row.action === "dismiss_report" ? "dismissed" : "reviewing"
      if (!report) {
        evidence = "신고 행을 찾지 못했습니다"
      } else if (report.status === expected) {
        state = "applied"
        evidence = `상태가 ${expected} 로 기록됨 · 제재 없음`
      } else {
        state = "failed"
        evidence = `상태가 ${report.status} 입니다`
      }
    } else if (row.action.startsWith("metaverse_report_")) {
      // 실제 코드가 상태만 바꾼다 — 제재로 읽히지 않게 증거 문구를 못박는다
      state = "applied"
      evidence = "상태만 기록됨 · 계정 제재는 실행되지 않습니다"
    } else if (row.action === "refund_retry" || row.action === "refund_resolve") {
      const refund = refundById.get(target)
      const currency = String(refund?.currency ?? row.details?.currency ?? "") || "볼"
      if (!refund) {
        evidence = "환불 행을 찾지 못했습니다"
      } else if (refund.status !== "resolved") {
        state = "failed"
        evidence = `환불 상태가 ${refund.status} 입니다`
      } else if (row.action === "refund_retry") {
        state = "applied"
        evidence = `${refund.amount} ${currency} 자동 환불 완료`
      } else {
        // resolve 는 돈을 옮기지 않는다. "적용 완료"로 쓰면 지급했다고 읽힌다.
        state = "partial"
        evidence = `큐에서만 종료됨 · ${refund.amount} ${currency} 지급 여부는 이 기록으로 확인되지 않습니다`
      }
    }

    return {
      key: row.id,
      at: row.created_at,
      actor: row.admin_user_id,
      action: ACTION_LABEL[row.action] ?? row.action,
      target: target ? `${row.target_type ?? ""} ${target.slice(0, 8)}` : (row.target_type ?? ""),
      state,
      evidence,
    }
  })
}
