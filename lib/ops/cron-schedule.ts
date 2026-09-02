/**
 * vercel.json cron 스케줄 → 기대 심박 간격 계산 (invariant-audit 크론 심박 감시용).
 *
 * "cron 이 돈다 ≠ 파이프라인이 산다"의 역방향 감시: 등록된 크론이 기대 주기 안에
 * cron_run_log 에 기록을 안 남기면 죽은 것이다 (실사고 2026-08-07: news-learn-edits
 * 일일 회차가 실패 기록조차 없이 통째로 빠짐 — 호출 자체가 안 되면 그 크론은 자기
 * 실패를 기록할 수 없다).
 *
 * 파서는 vercel.json 에 실제로 쓰는 문법만 지원한다: 분/시 필드의 `*`, `*⁄N`, `a,b`,
 * 단일 숫자 + 요일 필드. dom/month 에 `*` 이외 값이 오면 판정 불가로 null 을 반환해
 * 감시를 조용히 건너뛴다 (오탐 알림이 진짜 알림을 죽인다).
 */

const WEEK_MINUTES = 7 * 24 * 60

function parseField(field: string, max: number): Set<number> | null {
  const values = new Set<number>()
  for (const part of field.split(",")) {
    if (part === "*") {
      for (let i = 0; i < max; i++) values.add(i)
    } else if (/^\*\/\d+$/.test(part)) {
      const step = Number(part.slice(2))
      if (step <= 0) return null
      for (let i = 0; i < max; i += step) values.add(i)
    } else if (/^\d+$/.test(part)) {
      const n = Number(part)
      if (n >= max) return null
      values.add(n)
    } else {
      return null
    }
  }
  return values.size > 0 ? values : null
}

/** 스케줄의 최대 발화 간격(분). 지원 밖 문법이면 null — 감시 제외. */
export function cronMaxGapMinutes(schedule: string): number | null {
  const fields = schedule.trim().split(/\s+/)
  if (fields.length !== 5) return null
  const [minF, hourF, domF, monthF, dowF] = fields
  // dom/month 제약은 미지원 — 현재 vercel.json 전체가 `*` 라 필요해지면 그때 확장
  if (domF !== "*" || monthF !== "*") return null

  const minutes = parseField(minF, 60)
  const hours = parseField(hourF, 24)
  const dows = parseField(dowF, 7)
  if (!minutes || !hours || !dows) return null

  const firings: number[] = []
  for (let dow = 0; dow < 7; dow++) {
    if (!dows.has(dow)) continue
    for (let hour = 0; hour < 24; hour++) {
      if (!hours.has(hour)) continue
      for (const min of minutes) {
        firings.push(dow * 1440 + hour * 60 + min)
      }
    }
  }
  if (firings.length === 0) return null
  firings.sort((a, b) => a - b)
  let maxGap = firings[0] + WEEK_MINUTES - firings[firings.length - 1] // 주 경계 랩어라운드
  for (let i = 1; i < firings.length; i++) {
    maxGap = Math.max(maxGap, firings[i] - firings[i - 1])
  }
  return maxGap
}

/** cron path → cron_run_log job_name (`/api/cron/x` → `x`, `/api/foo/bar` → `foo-bar`) */
export function cronJobNameFromPath(path: string): string {
  return path
    .replace(/^\/api\/cron\//, "")
    .replace(/^\/api\//, "")
    .replace(/\//g, "-")
}

/** 심박 경보 임계(분): 한 주기를 통째로 놓친 뒤 슬랙까지 지나면 죽은 것으로 본다 */
export function heartbeatThresholdMinutes(maxGapMinutes: number): number {
  return maxGapMinutes + Math.max(30, Math.round(maxGapMinutes * 0.5))
}
