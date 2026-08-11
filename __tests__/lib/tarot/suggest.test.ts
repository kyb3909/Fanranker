import { describe, expect, it } from "vitest"
import { suggestTarot, tarotHref } from "@/lib/tarot/suggest"

/**
 * 기사 → 타로 질문. 피드에 노출되는 문구라 품질이 곧 신뢰다.
 *
 * 두 가지 실패가 위험하다:
 *   ① 어설픈 질문("[가디언] 이적, 어떻게 흘러갈까요?") — 출처 프리픽스가 주어로 새면 이렇게 된다
 *   ② 관련 없는 기사에 붙는 것 — 안 붙이는 게 낫다(null 반환 → 진입점 숨김)
 * 그리고 문구가 **예언처럼 읽히면 안 된다** — "성사될까"가 아니라 "어떻게 흘러갈까".
 */
describe("suggestTarot — 이적·거취·경기 기사에만 붙는다", () => {
  it("이적 기사에서 주어를 뽑아 질문을 만든다", () => {
    const s = suggestTarot("[스카이 스포츠] 브루노 기마랑이스, 아스날 이적 협상 진전")
    expect(s).not.toBeNull()
    expect(s!.question).toContain("브루노 기마랑이스")
    expect(s!.question).toContain("이적")
  })

  it("출처 프리픽스를 주어로 착각하지 않는다", () => {
    const s = suggestTarot("[가디언] 첼시, 무드릭 임대 추진")
    expect(s!.question.startsWith("첼시")).toBe(true)
    expect(s!.question).not.toContain("가디언")
  })

  it("조사를 떼어 호칭만 남긴다", () => {
    const s = suggestTarot("손흥민이, 재계약 협상 시작")
    expect(s!.question.startsWith("손흥민 ")).toBe(true)
  })

  it("감독 거취 기사는 거취 질문으로", () => {
    const s = suggestTarot("[BBC] 아르테타, 감독 경질설 부인")
    expect(s!.question).toContain("거취")
  })

  it("경기 기사는 흐름 질문으로", () => {
    const s = suggestTarot("아스날 vs 리버풀, 오늘 밤 맞대결")
    expect(s!.question).toContain("흐름")
  })

  it("관련 없는 기사엔 안 붙는다 (null → 진입점 숨김)", () => {
    expect(suggestTarot("[AS] FIFA, 2030 월드컵 개최지 발표")).toBeNull()
    expect(suggestTarot("아스날, 에미레이트 항공과 스폰서십 연장")).toBeNull()
    expect(suggestTarot("")).toBeNull()
  })

  it("주어를 못 뽑으면 안 붙는다 — 어설픈 질문보다 없는 게 낫다", () => {
    // 출처만 있고 본문이 없는 비정상 제목
    expect(suggestTarot("[온스테인]")).toBeNull()
  })

  it("예언 어투를 쓰지 않는다 — 승부·성사를 단정하는 문구 금지", () => {
    const samples = [
      "[BBC] 기마랑이스, 아스날 이적 임박",
      "[BBC] 아르테타, 감독 거취 논의",
      "아스날 vs 첼시, 주말 경기",
    ]
    for (const t of samples) {
      const s = suggestTarot(t)!
      expect(s.question).not.toMatch(/성사될까|이길까요\?$|맞[힐혀]/)
    }
  })
})

describe("tarotHref", () => {
  it("질문과 유입 출처가 그대로 왕복한다", () => {
    const question = "기마랑이스 이적, 어떻게 흘러갈까요?"
    const href = tarotHref(question, "cardnews")
    expect(href.startsWith("/tarot?")).toBe(true)
    // ⚠️ 문자열 포함으로 검사하면 안 된다 — URLSearchParams 는 공백을 '+' 로 쓴다.
    //    화면(useSearchParams)이 읽는 방식과 같게 파싱해서 값이 살아 돌아오는지 본다.
    const parsed = new URLSearchParams(href.split("?")[1])
    expect(parsed.get("q")).toBe(question)
    expect(parsed.get("utm_source")).toBe("cardnews")
  })
})
