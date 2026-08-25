import { describe, it, expect, vi, afterEach } from "vitest"
import { localizeInjuryStatus } from "@/lib/lfa/injury-terms"

/**
 * 부상 사유 한글화 (2026-08-25 외부 감사).
 *
 * 매치센터 "결장·부상" 칸에 **"Leg 부상"·"허벅지 근육 stress"·"종아리 stress"** 가
 * 프로덕션에 그대로 떠 있었다. 한국어 화면에 영어 의학 용어가 남는 건 사전 구멍이지
 * 구조 문제가 아니다 — 그래서 표를 채우고, **구멍이 보이게** 경고를 남긴다.
 */

afterEach(() => vi.restoreAllMocks())

describe("localizeInjuryStatus", () => {
  it("⭐실사고 3건이 전부 한글이 된다", () => {
    expect(localizeInjuryStatus("Leg Injury")).toBe("다리 부상")
    expect(localizeInjuryStatus("Thigh Muscle Stress")).toBe("허벅지 근육 피로")
    expect(localizeInjuryStatus("Calf Stress")).toBe("종아리 피로")
  })

  it("⚠️복합어가 단일어보다 먼저 걸린다 — stress fracture 가 쪼개지지 않는다", () => {
    // 배열 순서대로 치환되므로 stress 단독 규칙이 먼저 걸리면 "피로 골절" 로 쪼개진다
    expect(localizeInjuryStatus("Stress Fracture")).toBe("피로골절")
  })

  it("기존 항목은 그대로 동작한다", () => {
    expect(localizeInjuryStatus("Knee Injury")).toBe("무릎 부상")
    expect(localizeInjuryStatus("Hamstring")).toBe("햄스트링")
    expect(localizeInjuryStatus("Suspended")).toBe("출전정지")
  })

  it("슬래시는 가운뎃점으로 — 한국어 조판", () => {
    expect(localizeInjuryStatus("Thigh / Hip Injury")).toBe("허벅지·고관절 부상")
  })

  it("빈 값은 그대로", () => {
    expect(localizeInjuryStatus("")).toBe("")
    expect(localizeInjuryStatus("   ")).toBe("")
  })

  it("⭐못 옮긴 단어는 경고로 드러낸다 — 조용히 흘려보내지 않는다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const out = localizeInjuryStatus("Zygomatic Injury")
    // 틀린 한글로 바꾸려 하지 않는다 — 영어 원문을 남기고 로그만 찍는다
    expect(out).toContain("Zygomatic")
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toContain("미번역")
  })

  it("전부 옮겨졌으면 경고하지 않는다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    localizeInjuryStatus("Ankle Injury")
    expect(warn).not.toHaveBeenCalled()
  })
})

/**
 * 2026-08-25 2차 — 저장분 재번역을 돌리다 **누락 경고가 잡아낸** 구멍들.
 * 경고를 심어두지 않았으면 이것들도 조용히 영문으로 나갔을 것이다.
 */
describe("localizeInjuryStatus — 2차 보강", () => {
  it("⚠️`the` 는 선택이다 — 피드 실제 문구에 the 가 없었다", () => {
    // 종전 규칙이 `in the (match )?squad` 라 the 가 없는 실제 문구를 놓쳤다
    expect(localizeInjuryStatus("Not Included in Match Squad")).toBe("명단 제외")
    expect(localizeInjuryStatus("Not Included in the Squad")).toBe("명단 제외")
  })

  it("출전 자격·질환", () => {
    expect(localizeInjuryStatus("Ineligible")).toBe("출전 자격 없음")
    expect(localizeInjuryStatus("Heart disease")).toBe("심장 질환")
  })

  it("⭐이미 한글화된 값에 다시 돌려도 안전하다 (저장분 재번역이 이걸 전제한다)", () => {
    // 실사고 형태: 일부만 번역돼 "허벅지 근육 stress" 로 굳은 것
    const once = localizeInjuryStatus("Thigh Muscle Stress")
    expect(localizeInjuryStatus(once)).toBe(once)
    expect(localizeInjuryStatus("허벅지 근육 stress")).toBe("허벅지 근육 피로")
  })
})
