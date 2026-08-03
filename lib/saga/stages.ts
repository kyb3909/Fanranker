/**
 * 사가 stage/outcome 의 단일 소스 (docs/saga/P0_AUDIT.md §4).
 *
 * DB 에 CHECK 를 걸지 않는 이유: 타입별 유효 세트가 달라서다 — transfer 와 match 의
 * stage 가 다른데 CHECK 로 합집합을 걸면 "transfer 사가에 match stage" 같은 교차 오염을
 * 못 막고, 타입 추가 때마다 마이그레이션이 필요해진다(PRD 원칙 4 위반). 대신 여기의
 * 전이 테이블이 검증을 소유하고, vitest 가 이 테이블을 고정한다.
 */

export type SagaType = "transfer" | "match" | "season"

/** 타입별 stage 진행 순서 — 진행도 바 렌더 순서이기도 하다 */
export const STAGE_FLOW: Record<SagaType, readonly string[]> = {
  transfer: ["interest", "contact", "bid", "negotiation", "medical", "done"],
  match: ["scheduled", "preview_open", "live", "finished", "reviewed", "archived"],
  season: ["active", "archived"],
} as const

/** 종결 outcome — transfer 전용 (PRD §4.2). done 만 is_confirmed=true (D7 noindex 해제) */
export const TRANSFER_OUTCOMES = ["done", "collapsed", "stayed"] as const

export const STAGE_LABEL: Record<string, string> = {
  interest: "관심",
  contact: "접촉",
  bid: "제안",
  negotiation: "협상",
  medical: "메디컬",
  done: "오피셜",
  collapsed: "결렬",
  stayed: "잔류",
}

export function isValidStage(type: SagaType, stage: string): boolean {
  return STAGE_FLOW[type].includes(stage)
}

/** 진행도 바용 인덱스 (0-based). 미지 stage 는 0 — 렌더가 죽으면 안 된다 */
export function stageIndex(type: SagaType, stage: string): number {
  const i = STAGE_FLOW[type].indexOf(stage)
  return i < 0 ? 0 : i
}

/**
 * 단계 갱신 규칙: 전진은 자유, 후퇴도 이벤트다(PRD §4.2 — negotiation→collapsed 임박).
 * 단 유효 세트 밖의 값은 거부. 종결 outcome 은 stage 가 아니라 sagas.outcome 에 든다.
 */
export function nextStage(type: SagaType, current: string, incoming: string | null): string {
  if (!incoming || !isValidStage(type, incoming)) return current
  return incoming
}
