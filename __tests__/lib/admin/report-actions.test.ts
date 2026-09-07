import { describe, expect, it } from "vitest"
import {
  authorTableFor,
  cardTypeFor,
  describeNonSanctionEffect,
  describeResolveEffect,
  summarizeResolveOutcome,
} from "@/lib/admin/report-actions"

/**
 * 신고 `인정` 버튼이 실제로 하는 일.
 *
 * 정책을 새로 만들지 않는다 — 서버 구현이 이미 하고 있는 일을 실행 전에 말로 옮긴 것이고,
 * 그 문장이 구현과 어긋나지 않게 여기서 잠근다.
 */

const base = {
  reason: "profanity",
  targetResolved: true,
  activeYellow: 0,
  hasActiveSuspension: false,
  siblingOpenReports: 0,
}

describe("카드 종류", () => {
  it("차별·광고는 레드, 나머지는 옐로", () => {
    expect(cardTypeFor("discrimination")).toBe("red")
    expect(cardTypeFor("advertising")).toBe("red")
    expect(cardTypeFor("profanity")).toBe("yellow")
    // 모르는 사유도 옐로로 떨어진다 (서버 구현과 같다)
    expect(cardTypeFor("unknown-reason")).toBe("yellow")
  })
})

describe("실행 전 효과 설명", () => {
  it("옐로 1장이 있으면 이번 실행이 정지를 발효시킨다고 예고한다", () => {
    const e = describeResolveEffect({ ...base, activeYellow: 1 })
    expect(e.willSuspend).toBe(true)
    expect(e.yellowAfter).toBe(2)
    expect(e.suspensionTerm).toBe("종료일 없음")
    expect(e.needsExtraConfirm).toBe(true)
    expect(e.lines.join(" ")).toContain("종료일이 없는 정지")
  })

  it("레드카드는 만료가 없어 누적 정지를 유발하지 않는다", () => {
    const e = describeResolveEffect({ ...base, reason: "discrimination", activeYellow: 5 })
    expect(e.cardType).toBe("red")
    expect(e.cardExpiry).toBe("만료 없음")
    expect(e.willSuspend).toBe(false)
    expect(e.lines.join(" ")).toContain("누적 정지 계산에 들어가지 않습니다")
  })

  it("이미 정지된 사용자에게는 정지를 새로 걸지 않는다", () => {
    const e = describeResolveEffect({ ...base, activeYellow: 3, hasActiveSuspension: true })
    expect(e.willSuspend).toBe(false)
    expect(e.needsExtraConfirm).toBe(false)
  })

  it("작성자를 못 찾으면 카드가 발급되지 않는다고 말한다", () => {
    const e = describeResolveEffect({ ...base, targetResolved: false, activeYellow: 1 })
    expect(e.willSuspend).toBe(false)
    expect(e.lines[0]).toContain("카드가 발급되지 않습니다")
  })

  it("같은 콘텐츠의 다른 신고를 함께 알린다 — 중복 제재의 근거", () => {
    const e = describeResolveEffect({ ...base, siblingOpenReports: 19 })
    expect(e.lines.join(" ")).toContain("19건 더 있습니다")
  })

  it("게시물 삭제와 사용자 통지가 없다는 사실을 항상 밝힌다", () => {
    expect(describeResolveEffect(base).lines.join(" ")).toContain("숨기거나 삭제하지 않습니다")
  })

  it("기각·검토 표시는 제재가 없다고 분명히 말한다", () => {
    expect(describeNonSanctionEffect("dismiss").join(" ")).toContain("어느 것도 실행하지 않습니다")
    expect(describeNonSanctionEffect("reviewing").join(" ")).toContain("아직 아무 처분도")
  })
})

describe("신고 대상별 작성자 조회 표", () => {
  it("게시글·댓글만 작성자를 찾는다", () => {
    expect(authorTableFor("post")).toBe("posts")
    expect(authorTableFor("comment")).toBe("comments")
  })

  it("티커 신고는 댓글 표로 흘러가지 않는다", () => {
    expect(authorTableFor("ticker")).toBeNull()
  })
})

describe("실행 결과 — 부분 성공을 성공으로 부르지 않는다", () => {
  const ok = {
    statusChanged: true,
    cardIssued: true,
    cardError: false,
    suspended: false,
    suspensionError: false,
    targetMissing: false,
  }

  it("카드까지 발급되면 적용 완료", () => {
    expect(summarizeResolveOutcome(ok).verdict).toBe("applied")
  })

  it("카드 발급이 실패하면 부분 성공", () => {
    const r = summarizeResolveOutcome({ ...ok, cardIssued: false, cardError: true })
    expect(r.verdict).toBe("partial")
    expect(r.message).toContain("제재는 적용되지 않았습니다")
  })

  it("정지 기록이 실패하면 정지가 안 걸렸다고 말한다", () => {
    const r = summarizeResolveOutcome({ ...ok, suspensionError: true })
    expect(r.verdict).toBe("partial")
    expect(r.message).toContain("정지가 걸리지 않았습니다")
  })

  it("상태 변경 자체가 실패하면 실패", () => {
    expect(summarizeResolveOutcome({ ...ok, statusChanged: false }).verdict).toBe("failed")
  })

  it("작성자를 못 찾은 경우도 완료로 세지 않는다", () => {
    const r = summarizeResolveOutcome({ ...ok, cardIssued: false, targetMissing: true })
    expect(r.verdict).toBe("partial")
  })
})
