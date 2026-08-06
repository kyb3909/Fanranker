/**
 * 정산 후 결과 덮어쓰기 가드 (2026-08-06, gauntlet R1 / 단계 0-1)
 *
 * 배경: 결과 update 경로 2곳(어드민 수동 입력 `app/api/admin/matches/result`,
 * VPS 결과 수신 `app/api/betman/results`)이 경기 상태와 무관하게 result 를
 * 덮어쓸 수 있었다. 정산(settlePredictions)은 재실행되지 않으므로, 정산이 이미
 * 끝난 경기의 결과가 바뀌면 "지급된 돈 ↔ 기록된 결과"가 영구히 어긋난다.
 *
 * 정책: 정정 정책(D-5)이 확정되기 전까지 **정산된 픽이 있는 경기의 결과 변경은
 * 전면 차단**한다. 재정산·역연산은 이 가드의 범위 밖(백로그).
 *
 * 판정은 순수 함수로 분리 — 두 라우트가 같은 규칙을 공유하고, 테스트는 여기에 건다.
 */

/** 정산 관점에서 되돌릴 수 없는 상태 */
const TERMINAL_STATUSES = new Set(["completed", "cancelled"])

/** DB 의 result 는 null/"" 혼용 — 비교 전 통일 */
function normalizeResult(result: string | null | undefined): string | null {
  return result == null || result === "" ? null : result
}

export interface ResultChangeCheck {
  /** 이 경기에 status='settled' 픽이 하나라도 있는가 (돈이 이미 움직였는가) */
  hasSettledPicks: boolean
  currentResult: string | null | undefined
  currentStatus: string | null | undefined
  /** 이번 업데이트가 기록하려는 result. null = 이번 요청은 result 를 건드리지 않음(스코어만) */
  incomingResult: string | null | undefined
  /** 이번 업데이트가 기록하려는 status. null = 상태 변경 없음 */
  incomingStatus: string | null | undefined
}

export type ResultBlockReason = "result_change" | "cancel_transition" | "status_regression"

export interface ResultGuardVerdict {
  blocked: boolean
  reason: ResultBlockReason | null
}

/**
 * 정산된 픽이 있는 경기에 대해 이번 업데이트를 차단해야 하는지 판정.
 *
 * 허용되는 것: 정산 픽이 없는 경기의 자유 수정, 동일 값 재기록(멱등 re-post),
 * result 를 건드리지 않는 스코어 표기 수정.
 * 차단되는 것: result 값 변경, 취소↔확정 전환, terminal → 비terminal 상태 후퇴.
 */
export function shouldBlockResultChange(input: ResultChangeCheck): ResultGuardVerdict {
  if (!input.hasSettledPicks) {
    return { blocked: false, reason: null }
  }

  const currentResult = normalizeResult(input.currentResult)
  const incomingResult = normalizeResult(input.incomingResult)

  // result 를 실제로 제공했고 기존 값과 다르면 변경 시도
  if (incomingResult !== null && incomingResult !== currentResult) {
    return { blocked: true, reason: "result_change" }
  }

  const currentStatus = input.currentStatus ?? null
  const incomingStatus = input.incomingStatus ?? null

  if (incomingStatus !== null && currentStatus !== null) {
    const currentCancelled = currentStatus === "cancelled"
    const incomingCancelled = incomingStatus === "cancelled"
    // 취소↔확정 전환: 정산(지급) 후 취소 처리하거나, 취소(환불) 후 확정 부활 — 둘 다 돈 기록과 어긋남
    if (currentCancelled !== incomingCancelled) {
      return { blocked: true, reason: "cancel_transition" }
    }
    // completed 였던 경기를 in_progress 등으로 되돌리면 이후 파이프라인이 재확정을 시도할 수 있음
    if (TERMINAL_STATUSES.has(currentStatus) && !TERMINAL_STATUSES.has(incomingStatus)) {
      return { blocked: true, reason: "status_regression" }
    }
  }

  return { blocked: false, reason: null }
}

/** 차단 사유를 운영자/로그용 한국어 문구로 */
export function describeBlockReason(reason: ResultBlockReason): string {
  switch (reason) {
    case "result_change":
      return "정산된 픽이 있는 경기의 결과 변경"
    case "cancel_transition":
      return "정산된 픽이 있는 경기의 취소↔확정 전환"
    case "status_regression":
      return "정산된 픽이 있는 경기의 상태 되돌리기"
  }
}
