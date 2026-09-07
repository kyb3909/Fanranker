/**
 * 관제 센터 판정 규칙 — **순수 모듈** (2026-09-08).
 *
 * 화면·API·테스트가 같은 규칙을 쓴다. 여기 있는 판정을 화면에서 다시 계산하면
 * "화면은 빨간불인데 API 는 정상"이 생긴다.
 *
 * ## 왜 이 모듈이 필요한가
 * 종전 두 관리자 홈은 모든 집계를 `count ?? 0` 으로 읽었다(`app/admin/_dashboard/data.ts`,
 * `app/api/admin2/dashboard/route.ts`). 조회가 실패해도 화면에는 **0건**이 찍힌다 —
 * "문제가 없어서 0"과 "못 물어봐서 0"이 같은 초록색이 된다. 실제로 신고 큐는 `res.ok`
 * 를 검사하지 않아 권한 오류가 "신고가 없습니다"로 보였다.
 *
 * 그래서 이 모듈의 첫 번째 계약은 **0 과 모름을 타입으로 갈라놓는 것**이다.
 * 숫자는 `ok` 로 관측됐을 때만 존재한다.
 */

/** 소스 하나를 관측한 결과 */
export type ObservationState =
  /** 조회 성공 — 이때만 건수를 신뢰한다 */
  | "ok"
  /** 조회 실패(권한·네트워크·서버 오류) — 0건이 아니다 */
  | "failed"
  /** 접수·조회 경로가 아직 없다 — 0건으로 세지 않는다 */
  | "unwired"
  /** 마지막 성공은 있으나 신선도 예산을 넘겼다 */
  | "stale"

export interface Observation {
  key: string
  label: string
  state: ObservationState
  /** 이번 조회가 성공한 시각 (실패면 null) */
  observedAt: string | null
  /** 마지막으로 성공한 시각 — 실패해도 보존해서 "언제까지는 정상이었다"를 남긴다 */
  lastOkAt: string | null
  /** 왜 실패/미연결인지 사람이 읽는 한 줄 */
  note?: string
}

/** 업무가 지금 어디에 있는가 */
export type WorkState =
  /** 사람이 지금 처리해야 한다 */
  | "actionable"
  /** 자동 재시도 중 — 시스템이 맡고 있다 */
  | "waiting_auto"
  /** 실행은 했고 결과를 확인 중 */
  | "waiting_verify"
  /** 사용자 답변을 기다린다 */
  | "waiting_user"
  /** 다른 담당에게 넘겼고 인수를 기다린다 */
  | "waiting_handoff"
  /** 사람의 결정이 없으면 자동화가 더 못 간다 */
  | "blocked"

export const WORK_STATE_LABEL: Record<WorkState, string> = {
  actionable: "처리 필요",
  waiting_auto: "자동 재시도 중",
  waiting_verify: "결과 확인 중",
  waiting_user: "사용자 답변 대기",
  waiting_handoff: "인계 인수 대기",
  blocked: "사람 결정 대기",
}

export function isWaiting(state: WorkState): boolean {
  return state.startsWith("waiting_")
}

export type Severity = "critical" | "high" | "normal" | "low"

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "즉시",
  high: "긴급",
  normal: "보통",
  low: "여유",
}

export interface WorkItem {
  key: string
  /** 업무 영역 — 업무별 현황의 묶음 단위 */
  domain: string
  /** 무슨 문제인가 */
  label: string
  /** 누구에게 어떤 영향이 있는가 */
  impact: string
  /** 미해결 건수. 관측이 ok 일 때만 의미가 있다 */
  count: number
  /** 가장 오래된 미해결의 발생 시각 */
  oldestAt: string | null
  /** 이때까지 처리해야 한다 */
  dueAt: string | null
  /** 현재 담당 (없으면 미배정) */
  owner: string | null
  state: WorkState
  /** 다음에 할 행동 */
  nextAction: string
  href: string | null
  severity: Severity
  /** 이 업무를 관측할 수 있었는가 */
  observation: ObservationState
  /**
   * 이 앱 안에 실제 처리 경로가 있는가.
   *
   * 관측(읽기)과 처리(쓰기)는 다른 문제다. 판매자 미지급은 표를 읽을 수는 있지만
   * 지급·기록 화면이 없다 — 숫자를 보여주되 "처리할 수 있다"고 말하면 거짓말이 된다.
   */
  actionWired: boolean
  /** 대기 중이면 다음 확인 시각 */
  nextCheckAt?: string | null
  note?: string
}

/* ────────────────────────────── 우선순위 ────────────────────────────── */

/**
 * 티어 간격이 건수 가산점보다 훨씬 크다 — **의도적이다.**
 * "긴급 신고 1건이 일반 검수 100건에 묻히지 않는다"가 검증 기준이라,
 * 건수는 같은 티어 안에서만 순서를 바꿀 수 있어야 한다.
 */
const TIER = {
  overdue: 100_000,
  critical: 50_000,
  high: 20_000,
  normal: 5_000,
  low: 1_000,
} as const

/** 건수 가산점 상한 — 티어 간격(최소 4,000)보다 작아야 순서를 못 뒤집는다 */
const COUNT_BONUS_CAP = 900
/** 나이 가산점 상한 — 같은 티어 안에서 오래된 것을 먼저 */
const AGE_BONUS_CAP = 3_000

/**
 * 기한 초과가 최상위 묶음이지만, **그 안에서도 긴급도가 순서를 정한다.**
 *
 * 기한 초과를 평평하게 두면 24시간 넘긴 일반 신고가 미지급 환불보다 위로 온다 —
 * 실데이터에서 실제로 그렇게 나왔다. 초과분끼리는 피해 크기로 다시 줄을 세운다.
 */
function tierOf(item: WorkItem, now: number): number {
  const bySeverity = TIER[item.severity]
  const overdue = !!item.dueAt && new Date(item.dueAt).getTime() < now
  return overdue ? TIER.overdue + bySeverity : bySeverity
}

/** 건수 → 가산점. 로그라 100건이 1건을 못 이긴다(티어가 다르면) */
function countBonus(count: number): number {
  if (count <= 0) return 0
  return Math.min(COUNT_BONUS_CAP, Math.round(Math.log2(count + 1) * 90))
}

/** 최장 대기 → 가산점. 7일이면 상한 */
function ageBonus(oldestAt: string | null, now: number): number {
  if (!oldestAt) return 0
  const ms = now - new Date(oldestAt).getTime()
  if (!Number.isFinite(ms) || ms <= 0) return 0
  const days = ms / 86_400_000
  return Math.min(AGE_BONUS_CAP, Math.round((days / 7) * AGE_BONUS_CAP))
}

/**
 * 우선순위 점수. 큰 값이 먼저.
 *
 * 순서: 기한 초과 → 긴급도 → 최장 대기 → 건수.
 * **건수가 첫 기준이 아니다** — 종전 작업대는 `severity` 다음에 바로 `count` 로 정렬해
 * 소량의 오래된 의무가 대량 큐 뒤로 밀렸다(`app/admin2/workbench.tsx`).
 */
function priorityScore(item: WorkItem, now: number = Date.now()): number {
  return tierOf(item, now) + ageBonus(item.oldestAt, now) + countBonus(item.count)
}

/** 우선순위 정렬 (원본 배열을 바꾸지 않는다) */
export function sortByPriority<T extends WorkItem>(items: T[], now: number = Date.now()): T[] {
  return [...items].sort((a, b) => priorityScore(b, now) - priorityScore(a, now))
}

/**
 * 기한이 지난 대기 업무를 다시 처리 대상으로 올린다.
 *
 * 시스템 대기를 완료로 취급하지 않는 것이 이 함수의 존재 이유다. 기한을 넘긴 대기는
 * "시스템이 맡고 있다"가 더 이상 사실이 아니므로 사람에게 돌려준다.
 */
export function promoteOverdue<T extends WorkItem>(items: T[], now: number = Date.now()): T[] {
  return items.map((item) => {
    if (!isWaiting(item.state)) return item
    if (!item.dueAt || new Date(item.dueAt).getTime() >= now) return item
    return {
      ...item,
      state: "actionable" as WorkState,
      nextAction: `기한 초과 — ${item.nextAction}`,
      note: item.note
        ? `${item.note} · 대기 기한을 넘겨 처리 대상으로 되돌림`
        : "대기 기한을 넘겨 처리 대상으로 되돌림",
    }
  })
}

/** 지금 사람이 해야 하는 것만. 관측 실패는 건수를 못 믿으므로 여기 넣지 않는다 */
export function actionableItems<T extends WorkItem>(items: T[], now: number = Date.now()): T[] {
  const promoted = promoteOverdue(items, now)
  return sortByPriority(
    promoted.filter((i) => i.state === "actionable" && i.observation === "ok" && i.count > 0),
    now
  )
}

/** 기다리는 일 — 기한 초과분은 위로 올라갔으므로 여기서 빠진다 */
export function waitingItems<T extends WorkItem>(items: T[], now: number = Date.now()): T[] {
  return sortByPriority(
    promoteOverdue(items, now).filter((i) => isWaiting(i.state) && i.count > 0),
    now
  )
}

/* ──────────────────────────── 업무별 현황 ──────────────────────────── */

export interface DomainSummary {
  domain: string
  /** 관측 성공한 항목들의 미해결 합계 */
  open: number
  /** 가장 오래된 미해결 */
  oldestAt: string | null
  /** 이 영역에 확인 불가·미연결이 하나라도 있는가 */
  degraded: boolean
  /** 영역 안에서 가장 높은 긴급도 (미해결이 있을 때만) */
  topSeverity: Severity | null
  items: WorkItem[]
  /** 정상 0건이라 접어도 되는가 — 확인 불가가 있으면 접지 않는다 */
  collapsible: boolean
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 3, high: 2, normal: 1, low: 0 }

export function summarizeDomains(items: WorkItem[], now: number = Date.now()): DomainSummary[] {
  const promoted = promoteOverdue(items, now)
  const byDomain = new Map<string, WorkItem[]>()
  for (const item of promoted) {
    const list = byDomain.get(item.domain)
    if (list) list.push(item)
    else byDomain.set(item.domain, [item])
  }

  const summaries: DomainSummary[] = []
  for (const [domain, list] of byDomain) {
    const observed = list.filter((i) => i.observation === "ok")
    const degraded = list.some((i) => i.observation !== "ok")
    const open = observed.reduce((sum, i) => sum + i.count, 0)
    const oldest = observed
      .map((i) => i.oldestAt)
      .filter((v): v is string => !!v)
      .sort()[0]
    const withWork = observed.filter((i) => i.count > 0)
    const topSeverity =
      withWork.length === 0
        ? null
        : withWork.reduce<Severity>(
            (worst, i) => (SEVERITY_RANK[i.severity] > SEVERITY_RANK[worst] ? i.severity : worst),
            "low"
          )
    summaries.push({
      domain,
      open,
      oldestAt: oldest ?? null,
      degraded,
      topSeverity,
      items: sortByPriority(list, now),
      // 정상 0건만 접는다. 확인 불가가 섞여 있으면 접으면 안 된다 — 그게 "0건처럼 보이는" 원인이다
      collapsible: open === 0 && !degraded,
    })
  }

  // 문제 있는 영역부터
  return summaries.sort((a, b) => {
    if (a.degraded !== b.degraded) return a.degraded ? -1 : 1
    const ra = a.topSeverity ? SEVERITY_RANK[a.topSeverity] : -1
    const rb = b.topSeverity ? SEVERITY_RANK[b.topSeverity] : -1
    if (ra !== rb) return rb - ra
    return b.open - a.open
  })
}

/* ──────────────────────────── 관측 요약 ──────────────────────────── */

export type OverallState = "ok" | "partial" | "down" | "unknown"

export interface ObservationSummary {
  total: number
  ok: number
  failed: number
  unwired: number
  stale: number
  /** 관측에 성공한 소스 중 가장 오래된 성공 시각 — "이 시각 이후로는 다 확인했다" */
  oldestOkAt: string | null
  /** 가장 최근 성공 시각 */
  lastOkAt: string | null
  state: OverallState
  /** 확인하지 못한 소스 이름 — 화면에 그대로 쓴다 */
  unobservedLabels: string[]
}

/**
 * 소스별 관측 결과 → 전체 상태.
 *
 * **전 항목 성공일 때만 `ok`**. 하나라도 실패·미연결·오래됨이면 `partial` 이하로 떨어진다.
 * HTTP 200 이 났다고 전체 정상이라고 말하지 않기 위한 규칙이다.
 */
export function summarizeObservations(obs: Observation[]): ObservationSummary {
  const ok = obs.filter((o) => o.state === "ok")
  const failed = obs.filter((o) => o.state === "failed")
  const unwired = obs.filter((o) => o.state === "unwired")
  const stale = obs.filter((o) => o.state === "stale")

  const okTimes = ok.map((o) => o.observedAt).filter((v): v is string => !!v)
  okTimes.sort()

  let state: OverallState
  if (obs.length === 0) state = "unknown"
  else if (failed.length === 0 && unwired.length === 0 && stale.length === 0) state = "ok"
  // 절반 넘게 못 봤으면 부분 실패가 아니라 관측이 죽은 것이다
  else if (failed.length > 0 && failed.length >= Math.ceil(obs.length / 2)) state = "down"
  else state = "partial"

  return {
    total: obs.length,
    ok: ok.length,
    failed: failed.length,
    unwired: unwired.length,
    stale: stale.length,
    oldestOkAt: okTimes[0] ?? null,
    lastOkAt: okTimes[okTimes.length - 1] ?? null,
    state,
    unobservedLabels: [...failed, ...unwired, ...stale].map((o) => o.label),
  }
}

/* ──────────────────────────── 종료 판단 ──────────────────────────── */

export interface StandDown {
  /** 화면을 닫아도 된다고 말할 수 있는가 */
  canClose: boolean
  /** 운영자에게 보여줄 한 줄 */
  headline: string
  /** 닫지 못하는 이유들 (닫아도 되면 빈 배열) */
  blockers: string[]
}

/**
 * "지금 닫아도 되는가" 판정.
 *
 * 관리자 검토 문서의 조건을 그대로 옮겼다: 숫자 0 이 아니라 **관측 범위 + 미해결 + 대기 책임**
 * 의 교집합이다. 미연결이 하나라도 있으면 전체 정상을 보증하지 않고 범위를 낮춰 말한다.
 */
export function standDown(
  obs: Observation[],
  items: WorkItem[],
  now: number = Date.now()
): StandDown {
  const summary = summarizeObservations(obs)
  const actionable = actionableItems(items, now)
  const waiting = waitingItems(items, now)
  const blockers: string[] = []

  if (actionable.length > 0) {
    blockers.push(`처리할 일 ${actionable.length}건`)
  }
  if (summary.failed > 0) {
    blockers.push(`확인 불가 ${summary.failed}곳`)
  }
  if (summary.unwired > 0) {
    blockers.push(`미연결 ${summary.unwired}곳`)
  }
  if (summary.stale > 0) {
    blockers.push(`오래된 정보 ${summary.stale}곳`)
  }
  // 다음 확인 시각이 없는 대기는 "시스템이 맡았다"고 말할 수 없다
  const unscheduled = waiting.filter((w) => !w.nextCheckAt && !w.dueAt)
  if (unscheduled.length > 0) {
    blockers.push(`다음 확인 시각이 없는 대기 ${unscheduled.length}건`)
  }

  const canClose = blockers.length === 0
  const scope = `${summary.ok}/${summary.total}곳 확인`

  let headline: string
  if (canClose) {
    headline =
      waiting.length > 0
        ? `직접 처리할 일 없음 · 시스템 확인 중 ${waiting.length}건 · ${scope}`
        : `직접 처리할 일 없음 · ${scope}`
  } else if (actionable.length > 0) {
    headline = `처리할 일 ${actionable.length}건 · ${scope}`
  } else {
    // 할 일은 없지만 관측이 불완전 — 전체 정상이라고 말하면 안 된다
    headline = `확인한 범위에서 직접 처리할 일 없음 · ${summary.unobservedLabels
      .slice(0, 3)
      .join(", ")}${summary.unobservedLabels.length > 3 ? " 외" : ""} 확인 불가`
  }

  return { canClose, headline, blockers }
}

/* ──────────────────────────── 최근 처리 결과 ──────────────────────────── */

/**
 * 요청을 보냈다는 사실과 효과가 적용됐다는 사실을 나눈다.
 * `requested` 는 서버 응답을 못 받았거나 결과 증거가 없는 상태다 — 성공이 아니다.
 */
export type OutcomeState = "applied" | "partial" | "failed" | "verifying" | "requested"

export const OUTCOME_LABEL: Record<OutcomeState, string> = {
  applied: "적용 완료",
  partial: "부분 성공",
  failed: "실패",
  verifying: "결과 확인 중",
  requested: "요청함 · 결과 미확인",
}

export interface OutcomeItem {
  key: string
  at: string
  /** 누가 */
  actor: string | null
  /** 무엇을 */
  action: string
  /** 어디에 */
  target: string
  state: OutcomeState
  /** 서버에서 확인한 증거 한 줄 */
  evidence: string
}

/** 최근 결과 — 최신순, 실패·부분 성공을 위로 */
export function sortOutcomes(items: OutcomeItem[]): OutcomeItem[] {
  const rank: Record<OutcomeState, number> = {
    failed: 0,
    partial: 1,
    requested: 2,
    verifying: 3,
    applied: 4,
  }
  return [...items].sort((a, b) => rank[a.state] - rank[b.state] || b.at.localeCompare(a.at))
}

/* ──────────────────────────── 조회 결과 포장 ──────────────────────────── */

/**
 * Supabase count 조회를 관측 결과로 바꾼다.
 *
 * `count ?? 0` 을 쓰지 않기 위한 유일한 입구다. `error` 가 있으면 숫자를 만들지 않고
 * `failed` 로 돌려준다 — 호출부가 실수로 0 을 쓸 수 없게 count 를 null 로 둔다.
 */
export interface CountProbe {
  count: number | null
  state: ObservationState
  note?: string
}

export function probeCount(
  result: { count?: number | null; error?: unknown } | null | undefined,
  opts: { unwired?: boolean; unwiredNote?: string } = {}
): CountProbe {
  if (opts.unwired) {
    return { count: null, state: "unwired", note: opts.unwiredNote }
  }
  if (!result || result.error) {
    const message =
      result?.error && typeof result.error === "object" && "message" in result.error
        ? String((result.error as { message: unknown }).message)
        : undefined
    return { count: null, state: "failed", note: message?.slice(0, 160) }
  }
  return { count: result.count ?? 0, state: "ok" }
}

/** 여러 조회 중 하나라도 실패하면 실패 — 부분 결과로 숫자를 만들지 않는다 */
export function combineProbes(probes: CountProbe[]): CountProbe {
  const failed = probes.find((p) => p.state === "failed")
  if (failed) return failed
  const unwired = probes.find((p) => p.state === "unwired")
  if (unwired) return unwired
  return { count: probes.reduce((sum, p) => sum + (p.count ?? 0), 0), state: "ok" }
}
