/**
 * 어사인먼트 shadow 판정을 기존 파이프라인·실제 발행 결과와 대조하는 순수 함수.
 *
 * shadow 를 켜는 목적이 "새 판정이 더 낫다"를 **숫자로** 보이는 것이므로, 여기서
 * 만드는 지표는 전부 전환 판단에 직접 쓰이는 것들이다:
 *  · rejectPublishedRate — shadow 가 버리자고 한 것 중 실제로 발행된 비율.
 *    **오차단 위험 지표**. 0 에 가깝지 않으면 절대 전환하면 안 된다.
 *  · assignPublishedRate — shadow 가 배정한 것 중 실제 발행된 비율.
 *  · ruleShortCircuitRate — LLM 없이 규칙으로 끝난 비율(= 호출 절감).
 *  · vsInterestFilter — 기존 관심도 필터와의 일치/불일치.
 */

export interface AssignmentRowSnapshot {
  candidate_id: string
  outcome: string
  status: string
  desk: string | null
  risk: string | null
  format: string | null
  reason_codes: string[] | null
  model: string
  latency_ms: number | null
  estimated_cost_usd: number | string | null
  created_at: string
}

interface CandidateOutcomeSnapshot {
  candidate_id: string
  state: string
}

/** 관심도 필터가 남긴 원장 이벤트 (actor = news-interest-filter) */
interface InterestEventSnapshot {
  candidate_id: string
  reason_code: string | null
}

/** 후보의 실제 종착 — shadow 판정과 맞대볼 축 */
type ActualBucket = "published" | "dropped" | "pending" | "unknown"

const DROPPED_STATES = new Set(["rejected", "expired", "duplicate", "dead_letter"])

export function toActualBucket(state: string | undefined): ActualBucket {
  if (!state) return "unknown"
  if (state === "published" || state === "partially_published") return "published"
  if (DROPPED_STATES.has(state)) return "dropped"
  return "pending"
}

const INTEREST_KEEP = new Set(["interest_keep", "club_guard_keep"])
const INTEREST_DROP = new Set(["low_interest", "womens_football"])

/** 관심도 필터 이벤트의 사유 코드를 keep/drop 으로 접는다. 그 외(재시도 등)는 판정 없음. */
export function toInterestVerdict(reasonCode: string | null): "keep" | "drop" | null {
  if (!reasonCode) return null
  if (INTEREST_KEEP.has(reasonCode)) return "keep"
  if (INTEREST_DROP.has(reasonCode)) return "drop"
  return null
}

function increment(target: Record<string, number>, key: string) {
  target[key] = (target[key] ?? 0) + 1
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[index]
}

function rate(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null
  return Number(((numerator / denominator) * 100).toFixed(1))
}

function toNumber(value: number | string | null): number | null {
  if (value === null) return null
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function summarizeAssignmentShadow(
  rows: AssignmentRowSnapshot[],
  candidates: CandidateOutcomeSnapshot[],
  interestEvents: InterestEventSnapshot[] = []
) {
  const stateById = new Map(candidates.map((c) => [c.candidate_id, c.state]))
  const interestById = new Map<string, "keep" | "drop">()
  for (const event of interestEvents) {
    const verdict = toInterestVerdict(event.reason_code)
    if (verdict) interestById.set(event.candidate_id, verdict)
  }

  const decisions: Record<string, number> = {}
  const failures: Record<string, number> = {}
  const desks: Record<string, number> = {}
  const risks: Record<string, number> = {}
  const formats: Record<string, number> = {}
  const reasonCodes: Record<string, number> = {}
  const matrix: Record<string, Record<ActualBucket, number>> = {}
  const vsInterest: Record<string, number> = {}

  let settled = 0
  let retryWait = 0
  let deadLetter = 0
  let llmCalls = 0
  let ruleCalls = 0
  let totalCostUsd = 0
  let unpricedRows = 0
  const latencies: number[] = []
  const settledCandidates = new Set<string>()

  for (const row of rows) {
    const cost = toNumber(row.estimated_cost_usd)
    if (cost === null) unpricedRows++
    else totalCostUsd += cost
    if (row.latency_ms !== null && Number.isFinite(row.latency_ms)) latencies.push(row.latency_ms)
    if (row.model.startsWith("rule:")) ruleCalls++
    else llmCalls++

    if (row.status === "ok") {
      settled++
      settledCandidates.add(row.candidate_id)
      increment(decisions, row.outcome)
      if (row.desk) increment(desks, row.desk)
      if (row.risk) increment(risks, row.risk)
      if (row.format) increment(formats, row.format)
      for (const code of row.reason_codes ?? []) increment(reasonCodes, code)

      const bucket = toActualBucket(stateById.get(row.candidate_id))
      matrix[row.outcome] ??= { published: 0, dropped: 0, pending: 0, unknown: 0 }
      matrix[row.outcome][bucket]++

      const interest = interestById.get(row.candidate_id)
      if (interest) {
        // assign/hold 은 "살린다", duplicate/reject 는 "버린다" 로 접어 관심도 필터와 비교
        const shadowKeep = row.outcome === "assign" || row.outcome === "hold" ? "keep" : "drop"
        increment(vsInterest, `${interest}->${shadowKeep}`)
      }
      continue
    }

    // 실패는 판정 분포에 절대 섞지 않는다 — 합치는 순간 "관심 없어서 안 나갔다"와
    // "호출이 죽어서 안 나갔다"가 같은 숫자가 된다.
    increment(failures, `${row.outcome}:${row.status}`)
    if (row.status === "retry_wait") retryWait++
    if (row.status === "dead_letter") deadLetter++
  }

  const publishedOf = (outcome: string) => matrix[outcome]?.published ?? 0
  const totalOf = (outcome: string) => {
    const m = matrix[outcome]
    return m ? m.published + m.dropped + m.pending + m.unknown : 0
  }

  const interestAgree = (vsInterest["keep->keep"] ?? 0) + (vsInterest["drop->drop"] ?? 0)
  const interestCompared = Object.values(vsInterest).reduce((sum, n) => sum + n, 0)

  return {
    rows: rows.length,
    candidates: settledCandidates.size,
    settled,
    retryWait,
    deadLetter,
    decisions,
    failures,
    desks,
    risks,
    formats,
    reasonCodes,
    calls: {
      llm: llmCalls,
      rule: ruleCalls,
      /** 규칙만으로 끝나 LLM 을 안 부른 비율 — 호출 절감 목표(20%↓)의 실측치 */
      ruleShortCircuitRate: rate(ruleCalls, llmCalls + ruleCalls),
    },
    cost: {
      totalUsd: Number(totalCostUsd.toFixed(6)),
      /** 요율표에 없어 비용을 못 매긴 행 — 0 으로 세지 않고 따로 보고한다 */
      unpricedRows,
      perSettledUsd: settled === 0 ? null : Number((totalCostUsd / settled).toFixed(6)),
    },
    latency: { p50: percentile(latencies, 50), p95: percentile(latencies, 95) },
    agreement: {
      matrix,
      /** shadow 가 배정한 것 중 실제 발행 비율 */
      assignPublishedRate: rate(publishedOf("assign"), totalOf("assign")),
      /** shadow 가 반려한 것 중 실제 발행 비율 — 0 에 가까워야 전환 가능 */
      rejectPublishedRate: rate(publishedOf("reject"), totalOf("reject")),
      /** shadow 가 중복이라 한 것 중 실제 발행 비율 */
      duplicatePublishedRate: rate(publishedOf("duplicate"), totalOf("duplicate")),
      vsInterestFilter: {
        compared: interestCompared,
        agree: interestAgree,
        agreementRate: rate(interestAgree, interestCompared),
        matrix: vsInterest,
      },
    },
  }
}
