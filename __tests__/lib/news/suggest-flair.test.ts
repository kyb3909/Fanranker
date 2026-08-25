import { describe, it, expect } from "vitest"
import { suggestFlairs } from "@/lib/news/suggest-flair"

const FLAIRS = [
  { id: "f-transfer", name: "이적", team_id: null },
  { id: "f-news", name: "뉴스", team_id: null },
  { id: "f-chelsea", name: "첼시", team_id: "chelsea" },
]

describe("suggestFlairs — 성격 말머리", () => {
  it("이적 키워드 → 이적", () => {
    expect(suggestFlairs("첼시, 조던 헨더슨 영입 완료", FLAIRS).kindFlairId).toBe("f-transfer")
  })

  it("FIFA/UEFA 는 이적이 아니다 — 'FA' 부분 매칭 실사고 (2026-08-04)", () => {
    expect(
      suggestFlairs("UEFA, FIFA 인판티노 회장에 법적 조치 검토 및 문서 보존 요구", FLAIRS)
        .kindFlairId
    ).toBe("f-news")
    expect(suggestFlairs("FIFA 회장 인판티노, 반대 세력 언급", FLAIRS).kindFlairId).toBe("f-news")
  })

  it("일반 뉴스 → 뉴스", () => {
    expect(suggestFlairs("프리미어리그 개막전 일정 발표", FLAIRS).kindFlairId).toBe("f-news")
  })
})

/**
 * 2026-08-25 외부 감사 P1-12 실사고:
 *   홈 MATCHDAY 카드가 라벨은 **"첼시"**인데 엠블럼은 아스널, 리드는 마르티넬리였다.
 *   한 기사에 두 구단이 나올 때 말머리가 **목록 순서**로 걸린 쪽을 쓰고 있었기 때문이다.
 *
 * 한국어 스포츠 헤드라인은 주어가 맨 앞이다 — 제목에서의 등장 위치가 주인공 순서다.
 */
const MULTI = [
  { id: "f-transfer", name: "이적", team_id: null },
  { id: "f-news", name: "뉴스", team_id: null },
  { id: "f-chelsea", name: "첼시", team_id: "chelsea" },
  { id: "f-arsenal", name: "아스널", team_id: "arsenal" },
  { id: "f-epl", name: "EPL", team_id: null },
]

describe("suggestFlairs — 두 구단이 나올 때", () => {
  it("⭐제목에서 먼저 나온 팀이 이긴다 (주어)", () => {
    expect(suggestFlairs("아스널, 첼시 수비수 영입 추진", MULTI).teamFlairId).toBe("f-arsenal")
    expect(suggestFlairs("첼시, 아스널에 제안 거절", MULTI).teamFlairId).toBe("f-chelsea")
  })

  it("⚠️목록 순서에 흔들리지 않는다 — 실사고의 원인", () => {
    // 첼시가 목록에서 앞이지만 제목 주어는 아스널이다
    const rev = [...MULTI].reverse()
    expect(suggestFlairs("아스널, 첼시에서 선수 영입", rev).teamFlairId).toBe("f-arsenal")
  })

  it("한 팀만 나오면 그 팀", () => {
    expect(suggestFlairs("아스널, 커뮤니티 실드 우승", MULTI).teamFlairId).toBe("f-arsenal")
  })

  it("팀이 없으면 성격 말머리가 대표가 된다", () => {
    const r = suggestFlairs("FIFA 회장 인판티노, 반대 세력 언급", MULTI)
    expect(r.teamFlairId).toBeNull()
    expect(r.primaryFlairId).toBe("f-news")
  })

  it("같은 자리에서 갈리면 더 구체적인 쪽 — 리그보다 구단", () => {
    // "EPL 아스널" 처럼 리그가 앞서면 리그가 주어다. 반대로 겹치면 구단이 이긴다.
    expect(suggestFlairs("EPL 개막전 일정 발표", MULTI).teamFlairId).toBe("f-epl")
  })
})
