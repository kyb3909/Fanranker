import { describe, it, expect } from "vitest"
import {
  pickWinner,
  foldLengthVariants,
  isClubName,
  plausibleCorrection,
  extractClubName,
} from "@/lib/naming/pick"

describe("가드 — 클럽명·교정 타당성 (2026-08-04 실사고: 리버풀→헨더슨 치환)", () => {
  it("클럽명은 선수 검증 대상이 아님", () => {
    expect(isClubName("리버풀")).toBe(true)
    expect(isClubName("맨체스터 유나이티드")).toBe(true)
    expect(isClubName("조던 헨더슨")).toBe(false)
  })

  // 이 정규식은 관심도 심사의 축①(주체) 게이트로도 쓰인다 — 여기 걸리면 "아는 팀"으로
  // 간주돼 LLM 이 농도만 본다. 맨몸 토큰이 남미 동명 구단을 잡으면 그대로 새어 나간다.
  // 실측 유출(2026-08-15): "프레드, 아틀레티코 미네이루로 이적" 이 `아틀레티코` 에 걸림.
  it("남미 동명 구단은 빅클럽으로 오인하지 않는다", () => {
    expect(isClubName("아틀레티코 미네이루")).toBe(false)
    expect(isClubName("인테르나시오나우")).toBe(false)
    expect(isClubName("로사리오 센트랄")).toBe(false)
    // 원래 의도한 유럽 구단은 그대로 통과해야 한다 (과잉 차단 방지)
    expect(isClubName("아틀레티코 마드리드")).toBe(true)
    expect(isClubName("아틀레티코, 알바레스 영입")).toBe(true)
    expect(isClubName("인테르")).toBe(true)
  })

  it("음차 차이는 타당 (갓포→각포, 추아미니→추아메니)", () => {
    expect(plausibleCorrection("코디 갓포", "코디 각포")).toBe(true)
    expect(plausibleCorrection("추아미니", "추아메니")).toBe(true)
    expect(plausibleCorrection("다이젠 마에다", "마에다 다이젠")).toBe(true)
  })

  it("다른 단어로의 교체는 거부 (리버풀→헨더슨)", () => {
    expect(plausibleCorrection("리버풀", "헨더슨")).toBe(false)
  })

  it("풀네임→성 축약은 거부 (로베르토 아얄라→아얄라)", () => {
    expect(plausibleCorrection("로베르토 아얄라", "아얄라")).toBe(false)
  })
})

describe("pickWinner — 네이버 검색량 기반 표기 판정", () => {
  it("압도적 다수 표기 채택 (기마랑이스 케이스)", () => {
    const v = pickWinner([
      { candidate: "브루노 기마랑이스", total: 1200 },
      { candidate: "브루노 기마라에스", total: 80 },
    ])
    expect(v.winner).toBe("브루노 기마랑이스")
  })

  it("검색량 부족이면 보류 — 무명 선수를 지어내 등재하지 않는다", () => {
    const v = pickWinner([
      { candidate: "아유브 부아디", total: 12 },
      { candidate: "아유브 부아디디", total: 3 },
    ])
    expect(v.winner).toBeNull()
    expect(v.reason).toContain("검색량 부족")
  })

  it("표기 경합(3배 미만)이면 보류 — 언론이 갈리면 사람이 정한다", () => {
    const v = pickWinner([
      { candidate: "이삭", total: 500 },
      { candidate: "이사크", total: 400 },
    ])
    expect(v.winner).toBeNull()
    expect(v.reason).toContain("경합")
  })

  it("2위가 0건이면 1위 채택 (경합 아님)", () => {
    const v = pickWinner([
      { candidate: "정답 표기", total: 100 },
      { candidate: "환각 표기", total: 0 },
    ])
    expect(v.winner).toBe("정답 표기")
  })

  it("후보가 비면 보류", () => {
    expect(pickWinner([]).winner).toBeNull()
  })
})

/**
 * 2026-08-10 실사고 — 길이 변형을 표기 경합으로 오독해 이름이 영구히 갇혔다.
 * '로날드 아라우호'가 7일간 4번 막히고도 등재되지 않은 원인이다.
 */
describe("foldLengthVariants — 길이 변형은 경쟁 상대가 아니다", () => {
  it("풀네임과 성씨는 접힌다 — 검색량이 큰 쪽을 남긴다", () => {
    expect(
      foldLengthVariants([
        { candidate: "아라우호", total: 6790 },
        { candidate: "로날드 아라우호", total: 3957 },
      ])
    ).toEqual([{ candidate: "아라우호", total: 6790 }])
  })

  it("띄어쓰기 차이도 같은 변형으로 본다", () => {
    expect(
      foldLengthVariants([
        { candidate: "코디 각포", total: 3966 },
        { candidate: "코디각포", total: 120 },
      ])
    ).toHaveLength(1)
  })

  it("⚠️ 진짜 대안 표기는 접지 않는다 — 서로 부분 문자열이 아니다", () => {
    const alts = foldLengthVariants([
      { candidate: "샤비 알론소", total: 591 },
      { candidate: "하비 알론소", total: 21 },
      { candidate: "자비 알론소", total: 5 },
    ])
    expect(alts).toHaveLength(3)
  })
})

describe("pickWinner — 길이 변형 접기 반영", () => {
  it("갇혀 있던 이름이 이제 승자를 낸다 (아라우호 실사고)", () => {
    const v = pickWinner([
      { candidate: "아라우호", total: 6790 },
      { candidate: "로날드 아라우호", total: 3957 },
    ])
    expect(v.winner).toBe("아라우호")
    // 근거는 원본 그대로 남는다 — 나중에 판정을 재검토할 수 있어야 한다
    expect(v.counts).toHaveLength(2)
  })

  it("진짜 경합은 여전히 보류한다 (회귀)", () => {
    const v = pickWinner([
      { candidate: "비니시우스 주니오르", total: 15000 },
      { candidate: "비니시우스 주니어", total: 12000 },
    ])
    expect(v.winner).toBeNull()
    expect(v.reason).toContain("경합")
  })

  it("압도적 대안은 그대로 승자 (회귀 — 캐릭/카릭)", () => {
    const v = pickWinner([
      { candidate: "캐릭", total: 24729 },
      { candidate: "카릭", total: 152 },
    ])
    expect(v.winner).toBe("캐릭")
  })
})

/**
 * 2026-08-10 운영자 제안: "AC밀란 선수들을 검색해서 레앙에 해당하는 이름을 찾는 식으로".
 * 이름만 세면 흔한 단어가 이긴다 — 실측 '레앙' 5,209 vs '레온' 45,133.
 */
describe("extractClubName — 검증 질의를 좁힐 구단", () => {
  it("기사 제목에서 구단을 뽑는다", () => {
    expect(extractClubName("[가제타] AC 밀란, 라파엘 레앙 매각 검토")).toBe("밀란")
    expect(extractClubName("[더 타임스] 리버풀, 바르셀로나 아라우조 영입 후보")).toBe("리버풀")
  })

  it("구단이 없으면 null — 호출부는 기존대로 이름 단독 검색 (fail-open)", () => {
    expect(extractClubName("FIFA 회장 선거 절차 논란")).toBeNull()
    expect(extractClubName(null)).toBeNull()
    expect(extractClubName(undefined)).toBeNull()
  })
})
