import { describe, it, expect } from "vitest"
import { classifyTier } from "@/lib/transfer/feed"

/**
 * 이적시장 상황판 신뢰 등급 (2026-07-31 보수화 — 워룸: 오피셜 라벨 오염).
 * 케이스는 전부 news_ticker_items 실데이터에서 가져온 오분류 사례다.
 */

function tier(over: {
  category?: string | null
  original_title?: string | null
  headline_kr?: string | null
  link_url?: string | null
  source_id?: string | null
}) {
  return classifyTier({
    category: over.category ?? "rumor",
    original_title: over.original_title ?? null,
    headline_kr: over.headline_kr ?? null,
    link_url: over.link_url ?? null,
    source_id: over.source_id ?? "reddit-soccer",
  })
}

describe("classifyTier — 오피셜은 공식 발표만 (2026-08-04 운영자 확정)", () => {
  it("공식 발표 마커만 오피셜: [오피셜] / 이적 확정 / 공식 발표", () => {
    expect(tier({ original_title: "[오피셜]韓 축구 유럽파 공격수 탄생" })).toBe("official")
    expect(tier({ headline_kr: "이한범, 벨기에 명문 클뤼프 브뤼허 이적 확정" })).toBe("official")
  })

  it("기자발 확정 보도(here we go·completed transfer)는 아무리 확실해도 유력", () => {
    // 정책 변경 (2026-08-04): "가능성 높은 건 다 유력, 오피셜은 공식 발표만"
    expect(tier({ original_title: "[Romano] Danny Welbeck to Chelsea, here we go!" })).toBe("tier1")
    expect(
      tier({ original_title: "Maxence Lacroix has completed a permanent transfer to Chelsea" })
    ).toBe("tier1")
  })

  it("구단 공식 도메인은 오피셜", () => {
    expect(tier({ link_url: "https://www.chelseafc.com/en/news/article/x" })).toBe("official")
  })

  it("진행형(임박·협상·working on·finalising)은 아무리 유력해도 오피셜 금지", () => {
    expect(
      tier({ category: "transfer", headline_kr: "몸값 7배 뛴 이한범, 브루헤 이적 임박했다" })
    ).toBe("rumor")
    expect(
      tier({
        category: "transfer",
        original_title: "[Gary Jacob] Tottenham working on £60m deal to sign Savinho",
      })
    ).toBe("rumor")
    expect(
      tier({ category: "transfer", original_title: "Chelsea finalising Danny Welbeck signing" })
    ).toBe("rumor")
  })

  it("completed 부분 매칭 오탐 제거 — 인터뷰 인용은 tier1/rumor 로", () => {
    // "We have completed 60% of our project in the transfer market" (실제 오분류 사례)
    expect(
      tier({
        original_title:
          "[The Athletic] De Zerbi: We have completed 60% of our project in the transfer market",
      })
    ).toBe("tier1")
    expect(tier({ original_title: "Unofficial: striker move rumour" })).toBe("rumor")
  })

  it("오피셜 마커를 부정하는 제목은 오피셜 금지 (무의미·미정)", () => {
    expect(
      tier({
        category: "rumor",
        original_title: "'오피셜' 공식발표 완전 무의미...\"이강인 아틀레티코 합류 날짜\" 미정",
      })
    ).toBe("rumor")
  })

  it("관측 표현 '간주'는 확정 마커가 있어도 오피셜 금지 (2026-08-06 비니시우스 AS 실사고)", () => {
    // "영입 확정으로 간주"가 `영입 확정` 마커에 걸려 official 로 오분류 → 루머 사가가
    // noindex 해제까지 이어졌던 실측 사례. 기자 관측은 오피셜이 아니다.
    expect(
      tier({
        headline_kr: "[AS] 아스날 내부, 비니시우스 영입 확정으로 간주…레알은 재정 요구 못 맞춰",
      })
    ).toBe("rumor")
  })

  it("naver transfer 카테고리는 헤지 없을 때만 오피셜 폴백 (reddit 플레어는 제외)", () => {
    expect(
      tier({
        category: "transfer",
        source_id: "naver-kleague",
        original_title: "포항 이호재, 독일 2부 다름슈타트 이적",
      })
    ).toBe("official")
    // 같은 문장이라도 reddit transfer 플레어는 폴백 승격 없음
    expect(
      tier({
        category: "transfer",
        source_id: "reddit-soccer",
        original_title: "[COPE] Real Madrid and Fulham have reached an agreement for Gonzalo",
      })
    ).toBe("rumor")
  })

  it("Tier1 기자/매체는 tier1", () => {
    expect(
      tier({ original_title: "[Ornstein] Newcastle poised to appoint Matthias Jaissle" })
    ).toBe("tier1")
    expect(tier({ original_title: "[Fabrizio Romano] Real Madrid approach City for Rodri" })).toBe(
      "tier1"
    )
  })
})
