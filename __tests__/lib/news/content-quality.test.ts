import { describe, expect, it } from "vitest"
import { isContentFreeText, MIN_BODY_LENGTH } from "@/lib/news/content-quality"

const pad = (s: string) => s.padEnd(MIN_BODY_LENGTH + 20, "가")

describe("isContentFreeText", () => {
  it("너무 짧으면 무내용", () => {
    expect(isContentFreeText("한 줄 요약입니다.")).toBe(true)
  })

  it("자기지시 필러가 있으면 무내용 (원문 추출 실패 시 나오는 전형)", () => {
    expect(isContentFreeText(pad("자세한 내용은 기사에서 확인할 수 있습니다. "))).toBe(true)
  })

  it("원문 소개형 껍데기를 잡는다 (2026-08-09 ESPN 전술분석 실사고)", () => {
    const shell =
      "ESPN 기사에 따르면 브루노 기마랑이스가 아스널 미드필드에서 어떤 방식으로 기여할 수 " +
      "있을지에 대한 분석이 포함되어 있습니다. 그의 장점에 대한 여러 관점이 제시되었습니다."
    expect(isContentFreeText(shell)).toBe(true)
  })

  it("사실이 담긴 기사는 통과 — 출처 귀속 문구가 있어도 무내용이 아니다", () => {
    const real =
      "oe24 보도에 따르면, 올리버 글래스너가 노팅엄 포레스트와 연간 1,520만 유로 규모의 " +
      "계약을 체결해 구단 역사상 최고 연봉 감독이 되었다. 51세의 오스트리아 출신 글래스너는 " +
      "이전에 크리스탈 팰리스를 이끌었다."
    expect(isContentFreeText(real)).toBe(false)
  })

  it("실제 협상 보도의 '논의가 이루어졌다'는 오탐하지 않는다 (필터에서 의도적으로 제외한 표현)", () => {
    const real =
      "BBC 보도에 따르면 아스널과 뉴캐슬 사이에 이적료 7,500만 파운드를 두고 논의가 " +
      "이루어졌으며, 양측은 4+1년 계약 조건에 근접했다. 메디컬은 다음 주 예정이다."
    expect(isContentFreeText(real)).toBe(false)
  })
})
