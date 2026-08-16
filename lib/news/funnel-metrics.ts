interface CandidateSnapshot {
  candidate_id: string
  state: string
  first_seen_at: string
}

interface CandidateEventSnapshot {
  candidate_id: string
  to_state: string
  actor: string
  reason_code: string | null
  created_at: string
}

function increment(target: Record<string, number>, key: string) {
  target[key] = (target[key] ?? 0) + 1
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle]
}

/** 최근 후보와 전이 원장에서 운영 funnel을 계산하는 순수 함수. */
export function summarizeNewsroomFunnel(
  candidates: CandidateSnapshot[],
  events: CandidateEventSnapshot[]
) {
  const states: Record<string, number> = {}
  const transitions: Record<string, number> = {}
  const actors: Record<string, number> = {}
  const reasons: Record<string, number> = {}

  for (const candidate of candidates) increment(states, candidate.state)
  for (const event of events) {
    increment(transitions, event.to_state)
    increment(actors, event.actor)
    if (event.reason_code) increment(reasons, event.reason_code)
  }

  const firstSeen = new Map(
    candidates.map((candidate) => [candidate.candidate_id, Date.parse(candidate.first_seen_at)])
  )
  const firstPublished = new Map<string, number>()
  for (const event of events) {
    if (event.to_state !== "published") continue
    const timestamp = Date.parse(event.created_at)
    const previous = firstPublished.get(event.candidate_id)
    if (Number.isFinite(timestamp) && (previous === undefined || timestamp < previous)) {
      firstPublished.set(event.candidate_id, timestamp)
    }
  }
  const publishLeadMinutes: number[] = []
  for (const [candidateId, publishedAt] of firstPublished) {
    const seenAt = firstSeen.get(candidateId)
    if (seenAt !== undefined && Number.isFinite(seenAt) && publishedAt >= seenAt) {
      publishLeadMinutes.push(Math.round((publishedAt - seenAt) / 60_000))
    }
  }

  const terminal =
    (states.published ?? 0) +
    (states.rejected ?? 0) +
    (states.expired ?? 0) +
    (states.duplicate ?? 0) +
    (states.dead_letter ?? 0)

  return {
    candidates: candidates.length,
    terminal,
    unresolved: Math.max(0, candidates.length - terminal),
    states,
    transitions,
    actors,
    reasons,
    published: states.published ?? 0,
    needsHuman: states.needs_human ?? 0,
    retryWait: states.retry_wait ?? 0,
    partiallyPublished: states.partially_published ?? 0,
    publishRate:
      candidates.length === 0
        ? 0
        : Number((((states.published ?? 0) / candidates.length) * 100).toFixed(1)),
    medianPublishLeadMinutes: median(publishLeadMinutes),
  }
}
