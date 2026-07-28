/**
 * 파이프라인 신선도 판정 — 운영 작업대(/admin2)가 "돌고 있나"를 판단하는 규칙.
 *
 * 라우트에서 분리한 이유: 임계값이 틀리면 **오탐(멀쩡한데 빨간불)** 또는
 * **미탐(죽었는데 초록불)** 이 난다. 둘 다 운영자 신뢰를 깨뜨리므로 계약으로 고정한다.
 */

const H = 3600_000

export type PipelineStatus = "ok" | "warn" | "down"

/** 각 파이프라인의 실제 실행 주기에서 도출한 임계값 (시간 단위) */
export const PIPELINE_THRESHOLDS = {
  /** Vultr /opt/betman/sync.sh 2시간 주기 + Vercel 30분 보조 */
  betman: { warn: 3, down: 6 },
  /** Vultr /opt/news-scanner 15분 주기. 새벽엔 레딧 소스가 조용해 유입이 끊길 수 있어 넉넉히 */
  newsScanner: { warn: 4, down: 10 },
  /** 발행은 사람 검수에 달렸다 — 파이프라인 장애가 아니라 검수 정체 신호 */
  botPublish: { warn: 24, down: 72 },
  /** Vultr /opt/crawlers/runner.js 10분 주기 */
  ticker: { warn: 2, down: 6 },
} as const

/** 마지막 활동 시각으로부터 경과 시간(시간 단위). 기록이 없으면 null */
export function ageHours(iso: string | null | undefined, now: number = Date.now()): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return (now - t) / H
}

/**
 * 신선도 → 상태. 기록이 아예 없으면 `down` 으로 본다 —
 * "한 번도 안 돌았다"를 정상으로 취급하면 첫 장애를 놓친다.
 */
export function freshness(
  iso: string | null | undefined,
  warnH: number,
  downH: number,
  now: number = Date.now()
): PipelineStatus {
  const age = ageHours(iso, now)
  if (age === null) return "down"
  if (age >= downH) return "down"
  if (age >= warnH) return "warn"
  return "ok"
}

/** 사람이 읽는 경과 시간 표기 */
export function fmtAge(iso: string | null | undefined, now: number = Date.now()): string {
  const age = ageHours(iso, now)
  if (age === null) return "기록 없음"
  if (age < 1) return `${Math.round(age * 60)}분 전`
  if (age < 24) return `${age.toFixed(1)}시간 전`
  return `${Math.floor(age / 24)}일 전`
}

/** 여러 파이프라인 중 가장 나쁜 상태 (전체 요약 배너용) */
export function worstStatus(statuses: PipelineStatus[]): PipelineStatus {
  if (statuses.includes("down")) return "down"
  if (statuses.includes("warn")) return "warn"
  return "ok"
}
