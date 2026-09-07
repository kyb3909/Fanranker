/**
 * 신고 처리의 **실제 효과** 판정 — 순수 모듈 (2026-09-08).
 *
 * ## 왜 필요한가
 * 신고 큐의 체크 아이콘은 이름이 `처리` 였지만, 누르는 순간 서버가 카드를 발급하고
 * 옐로 누적이 임계치를 넘으면 **종료일 없는 정지**까지 넣는다. 실행 전에는 그 사실이
 * 화면 어디에도 없었고, 결과는 실행 후 토스트로만 알려줬다.
 *
 * 여기서 하는 일은 정책을 바꾸는 게 아니라 **지금 코드가 실제로 하는 일을 말로 옮기는 것**이다.
 * 임계값·만료·레드 규칙은 서버 구현 그대로다.
 *
 * ⚠️ 새 제재 규칙을 만들지 않는다. 누적 기준·기간·철회 책임은 운영 책임자 몫이다.
 */

export type CardType = "red" | "yellow"

/** 서버 구현과 같은 분류 — 신고자가 고른 사유가 카드 종류를 정한다(관리자 재판정 단계 없음) */
const RED_REASONS: readonly string[] = ["discrimination", "advertising"]

export function cardTypeFor(reason: string): CardType {
  return RED_REASONS.includes(reason) ? "red" : "yellow"
}

export const REASON_LABEL: Record<string, string> = {
  discrimination: "차별·혐오",
  advertising: "광고·스팸",
  profanity: "욕설",
  abuse: "괴롭힘",
  political: "정치",
}

/** 자동 정지 임계치 — 유효한 옐로카드 수 */
export const YELLOW_SUSPENSION_THRESHOLD = 2

/**
 * 이 신고 대상에서 작성자를 찾으려면 어느 표를 봐야 하는가.
 *
 * ⚠️ 신고 대상은 post·comment 말고 **ticker** 도 있다. 종전 코드는 `post 가 아니면 comments`
 * 라 티커 신고가 댓글 표를 뒤졌다 — 없는 행을 조회해 조용히 실패했다.
 * 작성자를 특정할 수 없는 대상은 카드 발급 자체를 하지 않는다.
 */
export function authorTableFor(targetType: string): "posts" | "comments" | null {
  if (targetType === "post") return "posts"
  if (targetType === "comment") return "comments"
  return null
}

export interface EffectInput {
  /** 신고 사유 */
  reason: string
  /** 제재 대상이 될 작성자를 찾았는가 */
  targetResolved: boolean
  /** 현재 유효한(만료 전) 옐로카드 수 */
  activeYellow: number
  /** 이미 활성 정지가 걸려 있는가 */
  hasActiveSuspension: boolean
  /** 같은 콘텐츠에 남아 있는 다른 미처리 신고 수 */
  siblingOpenReports: number
}

export interface Effect {
  cardType: CardType
  /** 카드 만료 — 레드는 만료 없음 */
  cardExpiry: "1년 후" | "만료 없음"
  /** 이 실행으로 유효 옐로가 몇 장이 되는가 */
  yellowAfter: number
  /** 이 실행이 계정 정지를 발효시키는가 */
  willSuspend: boolean
  /** 정지 기간 — 현재 구현은 종료일을 넣지 않는다 */
  suspensionTerm: "종료일 없음" | null
  /** 실행 전에 반드시 읽어야 하는 문장들 */
  lines: string[]
  /** 추가 확인이 필요한가 (누적 정지·영구 처분) */
  needsExtraConfirm: boolean
}

/**
 * `처리(인정)` 버튼이 실제로 무엇을 하는지 계산한다.
 *
 * 레드카드는 만료가 없어 `expires_at > now` 조회에서 빠지므로 **누적 정지를 유발하지 않는다** —
 * 직관과 반대라서 문장으로 적어준다.
 */
export function describeResolveEffect(input: EffectInput): Effect {
  const cardType = cardTypeFor(input.reason)
  const isYellow = cardType === "yellow"
  const yellowAfter = isYellow ? input.activeYellow + 1 : input.activeYellow
  const willSuspend =
    input.targetResolved &&
    isYellow &&
    yellowAfter >= YELLOW_SUSPENSION_THRESHOLD &&
    !input.hasActiveSuspension

  const lines: string[] = []

  if (!input.targetResolved) {
    lines.push("작성자를 찾지 못해 카드가 발급되지 않습니다. 신고 상태만 인정으로 바뀝니다.")
  } else {
    lines.push(
      cardType === "red"
        ? "레드카드를 발급합니다. 만료가 없습니다."
        : "옐로카드를 발급합니다. 1년 뒤 만료됩니다."
    )
    if (isYellow) {
      lines.push(`이 작성자의 유효 옐로카드가 ${input.activeYellow}장 → ${yellowAfter}장이 됩니다.`)
    } else {
      lines.push("레드카드는 누적 정지 계산에 들어가지 않습니다.")
    }
    if (willSuspend) {
      lines.push(
        `옐로 ${YELLOW_SUSPENSION_THRESHOLD}장 누적으로 계정이 정지됩니다. 종료일이 없는 정지입니다.`
      )
    } else if (isYellow && input.hasActiveSuspension) {
      lines.push("이미 활성 정지가 있어 정지를 새로 추가하지 않습니다.")
    }
  }

  lines.push("게시물은 숨기거나 삭제하지 않습니다. 사용자 통지도 하지 않습니다.")

  if (input.siblingOpenReports > 0) {
    lines.push(
      `같은 콘텐츠에 미처리 신고가 ${input.siblingOpenReports}건 더 있습니다. ` +
        "각각 인정하면 카드가 그 수만큼 더 발급됩니다."
    )
  }

  return {
    cardType,
    cardExpiry: isYellow ? "1년 후" : "만료 없음",
    yellowAfter,
    willSuspend,
    suspensionTerm: willSuspend ? "종료일 없음" : null,
    lines,
    // 누적 정지는 영구 처분이다 — 여기만 추가 확인을 요구한다(평범한 단건은 그대로 1회 실행)
    needsExtraConfirm: willSuspend,
  }
}

/** 기각·인수는 제재가 없다 — 같은 "완료"로 읽히지 않게 문장을 따로 준다 */
export function describeNonSanctionEffect(action: "dismiss" | "reviewing"): string[] {
  return action === "dismiss"
    ? ["신고를 기각으로 기록합니다.", "카드·정지·삭제 어느 것도 실행하지 않습니다."]
    : ["내가 검토 중이라고 표시합니다.", "아직 아무 처분도 실행되지 않습니다."]
}

/* ───────────────────────── 실행 결과 표현 ───────────────────────── */

export interface ResolveOutcome {
  statusChanged: boolean
  cardIssued: boolean
  cardError: boolean
  suspended: boolean
  suspensionError: boolean
  /** 대상 작성자를 못 찾아 제재가 적용되지 않음 */
  targetMissing: boolean
}

export type ResolveVerdict = "applied" | "partial" | "failed"

/**
 * 실행 결과 → 한 줄.
 *
 * 종전에는 카드 발급이 실패해도 HTTP 200 이고 화면에는 아무 말도 없었으며,
 * 정지 insert 오류는 검사조차 안 하고 "자동 정지 발효" 토스트를 띄웠다.
 * 여기서는 **부분 성공을 부분 성공이라고 말한다.**
 */
export function summarizeResolveOutcome(o: ResolveOutcome): {
  verdict: ResolveVerdict
  message: string
} {
  if (!o.statusChanged) {
    return {
      verdict: "failed",
      message: "신고 상태를 바꾸지 못했습니다. 아무것도 적용되지 않았습니다.",
    }
  }
  if (o.targetMissing) {
    return {
      verdict: "partial",
      message: "신고는 인정으로 기록했지만 작성자를 찾지 못해 카드는 발급되지 않았습니다.",
    }
  }
  if (o.cardError) {
    return {
      verdict: "partial",
      message: "신고는 인정으로 기록됐지만 카드 발급에 실패했습니다. 제재는 적용되지 않았습니다.",
    }
  }
  if (o.suspensionError) {
    return {
      verdict: "partial",
      message: "카드는 발급됐지만 계정 정지 기록에 실패했습니다. 정지가 걸리지 않았습니다.",
    }
  }
  if (o.suspended) {
    return { verdict: "applied", message: "카드 발급과 계정 정지가 적용됐습니다." }
  }
  if (o.cardIssued) {
    return { verdict: "applied", message: "카드가 발급됐습니다." }
  }
  return { verdict: "applied", message: "신고를 인정으로 기록했습니다." }
}
