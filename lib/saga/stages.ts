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
  // season 플로우 (팀 시즌 위키 문서)
  active: "시즌 진행 중",
  archived: "아카이브",
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
 * 단계 갱신 규칙: **전진만 허용, 후퇴는 무시** (2026-08-12 오너 확정 — 단조 규칙).
 *
 * 실사고: 페란 토레스 사가가 협상(8/8)까지 갔는데, "PSG 초기 제안 거절" 보도 2건(8/10)이
 * 제안 단계 신호로 추출되며 사가를 제안으로 끌어내렸다. 뉴스는 시간순으로 오지 않고
 * 낮은 단계의 후속·회고 보도가 늦게 도착한다 — 전수 조사에서 활성 사가 15건이 같은
 * 패턴으로 후퇴해 있었다(오피셜 찍고 관심으로 돌아간 이한범·기마랑이스 포함).
 *
 * 기존 주석의 "후퇴도 이벤트다(PRD §4.2)"는 결렬·잔류를 가리킨 것인데, 그것은 stage 가
 * 아니라 sagas.outcome 이 담당한다 — stage 를 되돌릴 정당한 자동 경로는 없다.
 * 엔트리의 stage_after 에는 원 신호가 그대로 남으므로(appendEntry) 기록은 잃지 않는다.
 * 진짜 후퇴(무산 후 재협상 등)가 필요하면 사람이 outcome/검수 경로로 처리한다.
 * 유효 세트 밖의 값은 종전대로 거부.
 */
export function nextStage(type: SagaType, current: string, incoming: string | null): string {
  if (!incoming || !isValidStage(type, incoming)) return current
  if (stageIndex(type, incoming) < stageIndex(type, current)) return current
  return incoming
}

/**
 * done(오피셜) 단계 게이트 — **오피셜 단계 진입은 official 티어 보도에서만**
 * (2026-08-06 오너: "오피셜은 말 그대로 완전 확정이라는 이야기가 나와야만 가능해").
 *
 * 실사고: AS 의 "아스날 내부, 영입 확정으로 간주" 기사에서 LLM 이 done 신호를 뽑았고,
 * stage 전이가 티어를 보지 않아 비니시우스 사가가 "오피셜" 단계로 올라갔다. 루머·유력
 * 보도의 완료 주장은 엔트리(stage_after 원값)에는 그대로 기록되지만, **사가 단계를
 * 움직이지는 못한다** — 신호를 null 로 강등해 현 단계에 머문다. 진짜 오피셜이 나오면
 * 그때 done 으로 전진한다.
 */
export function gatedStageSignal(stageAfter: string | null, tier: string): string | null {
  if (stageAfter === "done" && tier !== "official") return null
  return stageAfter
}

/**
 * D7 노출 전이(is_confirmed) — noindex 해제·루머 배너 제거를 여는 유일한 규칙.
 *
 * 2026-08-06 점검 실측: done 신호만으로 열던 기존 규칙 아래 루머 보도뿐인 사가 8건이
 * 검색 개방됐고, done 찍고 협상으로 후퇴한 3건(기마랑이스 포함)이 배너 없이 남았다.
 * D7 의 취지는 명예훼손 가드다 — **열림은 어렵게(오피셜 완료에서만), 닫힘은 쉽게
 * (비-done 신호가 오면 즉시 재잠금)**. done+비오피셜은 현 상태 유지 — 이미 오피셜로
 * 열린 문서를 뒤늦은 루머 에코가 재잠금하지 않도록.
 */
export function confirmationPatch(
  stageAfter: string | null,
  tier: string
): { is_confirmed?: boolean } {
  if (stageAfter === "done") {
    return tier === "official" ? { is_confirmed: true } : {}
  }
  if (stageAfter) return { is_confirmed: false }
  return {}
}
