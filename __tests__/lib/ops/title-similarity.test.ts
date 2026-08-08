import { describe, expect, it } from "vitest"
import { bigramTitleSimilarity, DUP_SUSPECT_MIN } from "@/lib/ops/title-similarity"

/**
 * 임계값 캘리브레이션 — 2026-08-07 실사고 쌍은 반드시 잡히고, 전개 중인 같은
 * 사가의 후속 기사(정상)는 웬만하면 안 잡혀야 한다. 상수를 바꾸면 이 테스트로 검증.
 */
describe("bigramTitleSimilarity", () => {
  it("실사고: 첼시 41인 축소 재탕 쌍(같은 run 2발)을 잡는다", () => {
    const sim = bigramTitleSimilarity(
      "[Nizaar Kinsella] 첼시, 41인 선수단 대폭 축소 계획…자비 알론소 감독 주도",
      "[BBC] 첼시, 41명 선수단 대폭 축소 계획…16명 이적 필요"
    )
    expect(sim).toBeGreaterThanOrEqual(DUP_SUSPECT_MIN)
  })

  it("실사고: 래시퍼드 복귀 분석 재탕 쌍(표기까지 흔들림)을 잡는다", () => {
    const sim = bigramTitleSimilarity(
      "[ESPN] 래시포드의 맨유 복귀, 많은 질문을 남기다",
      "마커스 래시퍼드의 맨체스터 유나이티드 복귀, 많은 질문을 남겨"
    )
    expect(sim).toBeGreaterThanOrEqual(DUP_SUSPECT_MIN)
  })

  it("[매체] 접두는 유사도에 영향을 주지 않는다", () => {
    const a = bigramTitleSimilarity("[BBC] 첼시, 선수단 축소", "[Goal] 첼시, 선수단 축소")
    expect(a).toBe(1)
  })

  it("무관한 기사 쌍은 잡지 않는다", () => {
    const sim = bigramTitleSimilarity(
      "[BBC] 뉴캐슬 단장, 브루노 기마랑이스 아스널 이적 원했다고 전해",
      "[가제타] 인터 밀란, 사네티와 라우타로가 로메로 설득 위해 직접 연락"
    )
    expect(sim).toBeLessThan(DUP_SUSPECT_MIN)
  })

  it("알려진 한계: 전개 중 사가의 후속 기사도 잡힌다 (실측 0.57 > 진짜 중복 0.49~0.52)", () => {
    // 로드리 협상 전개(거절 보도 → 제안 액수 보도)는 정상인데 진짜 중복보다 유사도가
    // 높다 — 텍스트 임계값만으론 못 가른다 (자모 유사도 마르티넬리 실측과 같은 교훈).
    // 그래서 이 불변식은 발행을 막지 않고 "사람이 한 번 보는 의심쌍"으로만 쓴다.
    // 이 테스트는 그 한계를 문서화한다 — 깨지면(값이 내려가면) 임계값 재검토 신호.
    const sim = bigramTitleSimilarity(
      "[BBC] 맨체스터 시티, 로드리 영입 위해 바르셀로나가 제시한 3,850만 파운드 제안 거절",
      "[Fernando Polo] 바르셀로나, 로드리 영입 위해 첫 제안 4500만 파운드 제출했으나 맨체스터 시티가 6000만 파운드 요구"
    )
    expect(sim).toBeGreaterThanOrEqual(DUP_SUSPECT_MIN)
  })
})
