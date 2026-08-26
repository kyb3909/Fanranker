import { describe, expect, it } from "vitest"
import { mapLfaStats, normalizeStatValue, statKey } from "@/lib/lfa/stat-labels"

/**
 * 라벨 표본은 **실제 LFA 응답**이다 (2026-08-26, `live_match_details`,
 * match_id 72e6g9h1pn6n02wyh6hi1e49g — 발렌시아:베티스 HT, 스탯 30개).
 * 추측으로 고정하면 안 되는 계약이라 원문 그대로 남긴다.
 */
const LFA_NOW = [
  { label: "Possession", home: "39", away: "61" },
  { label: "Expected Goals (xG)", home: "0.24", away: "0.19" },
  { label: "xG from Set Pieces", home: "0.05", away: "0.01" },
  { label: "Touches in Opposition Box", home: "5", away: "9" },
  { label: "Total Shots", home: "5", away: "8" },
  { label: "Shots on Target", home: "2", away: "0" },
  { label: "Shots off Target", home: "2", away: "4" },
  { label: "Corners", home: "2", away: "2" },
  { label: "Fouls", home: "5", away: "7" },
  { label: "Blocked Shots", home: "1", away: "4" },
  { label: "Hit Woodwork", home: "0", away: "0" },
  { label: "Big Chances Missed", home: "0", away: "0" },
  { label: "Throw-ins", home: "13", away: "13" },
  { label: "Total Passes", home: "197", away: "308" },
  { label: "Successful Passes", home: "158", away: "269" },
  { label: "Crosses", home: "6", away: "7" },
  { label: "Successful Tackles", home: "6", away: "4" },
  { label: "Duels Won", home: "21", away: "18" },
  { label: "Aerial Duels Won", home: "5", away: "2" },
  { label: "Successful Dribbles", home: "4", away: "4" },
  { label: "Clearances", home: "9", away: "12" },
  { label: "Interceptions", home: "5", away: "3" },
  { label: "Offsides", home: "0", away: "0" },
  { label: "Successful Crosses", home: "1", away: "1" },
  { label: "Yellow Cards", home: "1", away: "1" },
  { label: "Second Yellow Card", home: "0", away: "0" },
  { label: "Direct Red Card", home: "0", away: "0" },
  { label: "Goal Kicks", home: "3", away: "4" },
  { label: "Red Cards", home: "0", away: "0" },
  { label: "Passing Accuracy", home: "80", away: "87" },
]

/**
 * 2026-08-25 이전의 기계번역 라벨 (터키어 원문 → 어색한 영어, 퍼센트 접두, 소수점 쉼표).
 *
 * ⚠️ **라벨은 실제**다 — `0b33fa1e`(2026-08-17) 에 실측해 박아둔 그 문자열 그대로다.
 *    **값은 예시**다 (그때 응답을 따로 보관해 두지 않았다). 이 표본이 지키는 것은
 *    "옛 이름도 계속 받는가"이지 그날의 숫자가 아니다.
 */
const LFA_OLD = [
  { label: "Goal Expectation (xG)", home: "0,24", away: "0,19" },
  { label: "PLAYING THE BALL", home: "%39", away: "%61" },
  { label: "Total Shots", home: "5", away: "8" },
  { label: "Accurate Shot", home: "2", away: "0" },
  { label: "corner", home: "2", away: "2" },
  { label: "Receiving the Ball in the Opponent's Penalty Area", home: "5", away: "9" },
  { label: "Pass Accuracy%", home: "%80", away: "%87" },
  { label: "Foul", home: "5", away: "7" },
  { label: "Offside", home: "0", away: "0" },
  { label: "Winning a Duo Challenge", home: "21", away: "18" },
]

/** 처음부터 있던 9개 — 표의 윗부분이고 순서가 고정이다 */
const KO_CORE = [
  "기대득점 (xG)",
  "점유율",
  "슈팅",
  "유효 슈팅",
  "코너킥",
  "상대 박스 터치",
  "패스 성공률",
  "파울",
  "오프사이드",
]

/** 2026-08-26 운영자 승인으로 30개 전부 노출 — 이것이 표시 순서다 */
const KO_ALL = [
  ...KO_CORE,
  "세트피스 기대득점",
  "빗나간 슈팅",
  "막힌 슈팅",
  "골대",
  "빅찬스 미스",
  "총 패스",
  "성공한 패스",
  "크로스",
  "성공한 크로스",
  "드리블 성공",
  "듀얼 승리",
  "공중 듀얼 승리",
  "태클 성공",
  "가로채기",
  "클리어링",
  "스로인",
  "골킥",
  "경고",
  "퇴장",
  "경고 누적 퇴장",
  "다이렉트 퇴장",
]

describe("LFA 스탯 라벨 대조", () => {
  it("실제 응답 30개를 하나도 안 버린다 — 이게 깨지면 지면이 빈다", () => {
    const { rows, unknown } = mapLfaStats(LFA_NOW)
    expect(rows.map((r) => r.label)).toEqual(KO_ALL)
    expect(unknown).toEqual([])
  })

  it("옛 기계번역 라벨도 계속 받는다 (별칭 — 되돌아오거나 섞여 와도 살아야 한다)", () => {
    const { rows } = mapLfaStats(LFA_OLD)
    expect(rows.map((r) => r.label)).toEqual([...KO_CORE, "듀얼 승리"])
  })

  it("표시 순서는 표가 정한다 — 피드가 주는 순서가 아니다", () => {
    const { rows } = mapLfaStats([...LFA_NOW].reverse())
    expect(rows.map((r) => r.label)).toEqual(KO_ALL)
  })

  it("처음 9개는 순서가 고정이다 — 운영자가 보던 표의 윗부분", () => {
    const { rows } = mapLfaStats(LFA_NOW)
    expect(rows.slice(0, 9).map((r) => r.label)).toEqual(KO_CORE)
  })

  it("모르는 지표는 버리고, 버린 것을 알려준다 (조용히 죽지 않게)", () => {
    const { rows, unknown } = mapLfaStats([
      { label: "Total Shots", home: "5", away: "8" },
      { label: "Şut İsabeti Oranı", home: "40", away: "0" },
      { label: "Some New Metric", home: "1", away: "2" },
    ])
    expect(rows.map((r) => r.label)).toEqual(["슈팅"])
    expect(unknown).toEqual(["Şut İsabeti Oranı", "Some New Metric"])
  })

  it("이름이 흔들려도 같은 지표로 본다 (대소문자·공백·구두점)", () => {
    const { rows } = mapLfaStats([
      { label: "  possession  ", home: "50", away: "50" },
      { label: "TOTAL-SHOTS", home: "1", away: "2" },
      { label: "expected goals (xg)", home: "0.1", away: "0.2" },
    ])
    expect(rows.map((r) => r.label)).toEqual(["기대득점 (xG)", "점유율", "슈팅"])
  })

  it("2026-08-25 사고 재현 — 정확일치였다면 슈팅만 남는다", () => {
    // 옛 표(정확일치)를 흉내낸다: 현행 응답에서 옛 이름과 글자까지 같은 것만 통과
    const oldTable = [
      "Goal Expectation (xG)",
      "PLAYING THE BALL",
      "Total Shots",
      "Accurate Shot",
      "corner",
      "Receiving the Ball in the Opponent's Penalty Area",
      "Pass Accuracy%",
      "Foul",
      "Offside",
    ]
    const survived = oldTable.filter((en) => LFA_NOW.some((s) => s.label === en))
    expect(survived).toEqual(["Total Shots"])

    // 지금 규칙에서는 30개 전부 산다
    expect(mapLfaStats(LFA_NOW).rows).toHaveLength(30)
  })
})

describe("스탯 값 정규화", () => {
  it("비율 지표에는 % 를 붙인다 — 피드가 접두를 떼도", () => {
    expect(normalizeStatValue("39", true)).toEqual({ text: "39%", num: 39 })
    expect(normalizeStatValue("%39", true)).toEqual({ text: "39%", num: 39 })
    expect(normalizeStatValue("39%", true)).toEqual({ text: "39%", num: 39 })
  })

  it("비율이 아닌 지표에는 안 붙인다", () => {
    expect(normalizeStatValue("5")).toEqual({ text: "5", num: 5 })
  })

  it("터키식 소수점 쉼표를 마침표로 바꾼다", () => {
    expect(normalizeStatValue("2,19")).toEqual({ text: "2.19", num: 2.19 })
  })

  it("숫자가 아니면 원문을 그대로 두고 수치는 비운다 (바 시각화만 생략)", () => {
    expect(normalizeStatValue("-")).toEqual({ text: "-", num: null })
  })

  it("점유율은 실제 응답에서 39%/61% 로 나온다", () => {
    const { rows } = mapLfaStats(LFA_NOW)
    const poss = rows.find((r) => r.label === "점유율")
    expect(poss).toMatchObject({ home: "39%", away: "61%", homeNum: 39, awayNum: 61 })
  })
})

describe("statKey", () => {
  it("영숫자만 남긴다", () => {
    expect(statKey("Expected Goals (xG)")).toBe("expectedgoalsxg")
    expect(statKey("Throw-ins")).toBe("throwins")
  })

  it("단수·복수는 다른 키다 — 그래서 별칭을 표에 적어둔다", () => {
    expect(statKey("Offside")).not.toBe(statKey("Offsides"))
  })
})
