import { describe, expect, it } from "vitest"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { DEFAULT_TEAM_CARD, isTeamCard, resolveTeamCard, TEAM_CARD_DIR } from "@/lib/news/team-card"

/**
 * 구단 카드 매핑 — 이미지 없는 기사에 어느 그림이 붙는가.
 *
 * 가장 위험한 실패는 "카드가 안 붙는 것"이 아니라 **틀린 팀 카드가 붙는 것**이다.
 * 맨유 기사에 맨시티 카드가 달리면 오보처럼 읽힌다. 겹치는 이름(맨체스터 두 팀,
 * 밀라노 두 팀, 마드리드 두 팀)을 우선순위로 가르므로 그 순서를 여기서 못박는다.
 */
describe("resolveTeamCard — 겹치는 구단명을 정확히 가른다", () => {
  it("맨체스터 두 팀을 구분한다", () => {
    expect(resolveTeamCard("맨체스터 유나이티드, 미드필더 영입")).toContain("epl_manutd")
    expect(resolveTeamCard("맨유, 미드필더 영입")).toContain("epl_manutd")
    expect(resolveTeamCard("맨체스터 시티, 로드리 잔류 확정")).toContain("epl_mancity")
    expect(resolveTeamCard("맨시티, 로드리 잔류 확정")).toContain("epl_mancity")
  })

  it("밀라노 두 팀을 구분한다", () => {
    expect(resolveTeamCard("인터 밀란, 수비수 영입")).toContain("seriea_inter")
    expect(resolveTeamCard("인테르, 수비수 영입")).toContain("seriea_inter")
    expect(resolveTeamCard("AC밀란 레앙 이적설")).toContain("seriea_milan")
    // '밀란' 단독은 통칭이라 AC밀란으로 떨어진다
    expect(resolveTeamCard("밀란, 공격수 물색")).toContain("seriea_milan")
  })

  it("마드리드 두 팀을 구분한다", () => {
    expect(resolveTeamCard("레알 마드리드, 음바페 결승골")).toContain("laliga_realmadrid")
    expect(resolveTeamCard("아틀레티코 마드리드, 개인 합의")).toContain("laliga_atletico")
  })

  it("표기 흔들림(아스날/아스널, 브라이턴/브라이튼)을 흡수한다", () => {
    expect(resolveTeamCard("아스날, 기마랑이스 영입")).toBe(
      resolveTeamCard("아스널, 기마랑이스 영입")
    )
    expect(resolveTeamCard("브라이턴 승격")).toBe(resolveTeamCard("브라이튼 승격"))
  })

  it("제목이 본문보다 우선한다 — 이적 기사는 본문에 팀이 여럿 나온다", () => {
    // 제목의 주인공은 첼시, 본문엔 리버풀도 등장
    const card = resolveTeamCard(
      "첼시, 새 공격수 물색",
      "리버풀과 경쟁 중이라고 첼시 관계자가 말했다"
    )
    expect(card).toContain("epl_chelsea")
  })

  it("제목에 팀이 없으면 본문에서 찾는다", () => {
    expect(resolveTeamCard("이적시장 마감 임박", "토트넘이 막판 영입을 노린다")).toContain(
      "epl_tottenham"
    )
  })

  it("구단을 못 찾으면 중립 카드로 떨어진다", () => {
    expect(resolveTeamCard("FIFA, 2030 월드컵 개최지 발표")).toBe(DEFAULT_TEAM_CARD)
    expect(resolveTeamCard("")).toBe(DEFAULT_TEAM_CARD)
  })

  it("카드가 없는 구단도 중립으로 떨어진다 (에버턴·풀럼 등)", () => {
    expect(resolveTeamCard("에버턴, 수비수 임대 영입")).toBe(DEFAULT_TEAM_CARD)
  })

  it("isTeamCard 로 우리가 붙인 플레이스홀더를 알아본다", () => {
    expect(isTeamCard(resolveTeamCard("아스날 소식"))).toBe(true)
    expect(isTeamCard("https://cdn.example.com/photo.jpg")).toBe(false)
    expect(isTeamCard(null)).toBe(false)
  })
})

/**
 * 매핑이 가리키는 그림이 실제로 있어야 한다 — 없으면 기사에 깨진 이미지가 나간다.
 * 카드를 지우거나 id 를 바꾸면 여기서 걸린다.
 */
describe("모든 매핑 대상 카드 파일이 실제로 존재한다", () => {
  const SAMPLES = [
    "아스날",
    "리버풀",
    "첼시",
    "맨체스터 시티",
    "맨체스터 유나이티드",
    "토트넘",
    "뉴캐슬",
    "아스톤 빌라",
    "브라이턴",
    "웨스트햄",
    "레알 마드리드",
    "바르셀로나",
    "아틀레티코",
    "바이에른",
    "도르트문트",
    "유벤투스",
    "인터 밀란",
    "AC밀란",
    "나폴리",
    "파리 생제르맹",
  ]

  it.each([...SAMPLES, "(중립)"])("%s 카드 파일이 있다", (name) => {
    const src = name === "(중립)" ? DEFAULT_TEAM_CARD : resolveTeamCard(`${name} 소식`)
    expect(src.startsWith(TEAM_CARD_DIR)).toBe(true)
    expect(existsSync(join(process.cwd(), "public", src))).toBe(true)
  })
})
