import { describe, expect, it } from "vitest"
import { findNotationViolations, type NotationEntry } from "@/lib/news/notation"

/**
 * 위반 탐지의 계약: **진짜 오표기만** 올린다.
 *
 * hangul_alts 에는 성질이 다른 두 가지가 섞여 산다 —
 * 진짜 오표기('하비 알론소')와 더 긴 정식 표기('FC 바르셀로나').
 * 둘을 안 가르면 매시 :44 감시가 첫날부터 오탐을 쏟고, 시끄러운 감시는
 * 곧 무시당해서 없느니만 못하다 (2026-08-09 배포 직전 실측으로 발견).
 */

const entry = (o: Partial<NotationEntry> & { preferred_ko: string }): NotationEntry => ({
  id: o.id ?? `e_${o.preferred_ko}`,
  category: o.category ?? "player",
  romanized: o.romanized ?? null,
  surfaces: o.surfaces ?? null,
  hangul_alts: o.hangul_alts ?? null,
  preferred_ko: o.preferred_ko,
})

const DICT: NotationEntry[] = [
  entry({
    preferred_ko: "사비 알론소",
    hangul_alts: ["하비 알론소", "샤비 알론소", "자비 알론소"],
  }),
  entry({ preferred_ko: "캐릭", hangul_alts: ["카릭"] }),
  entry({ preferred_ko: "위르겐 클롭", hangul_alts: ["유르겐 클롭"] }),
  // ↓ 오표기가 아니라 "더 긴 정식 표기" — 축약형을 대표로 쓰려고 등재한 것
  entry({ preferred_ko: "바르셀로나", category: "team", hangul_alts: ["FC 바르셀로나"] }),
  entry({ preferred_ko: "모레토", category: "media", hangul_alts: ["마테오 모레토"] }),
  entry({ preferred_ko: "온스테인", category: "media", hangul_alts: ["데이비드 온스테인"] }),
]

describe("findNotationViolations", () => {
  it("진짜 오표기를 잡는다", () => {
    const v = findNotationViolations("하비 알론소 감독이 말했다", DICT)
    expect(v).toEqual([{ entryId: "e_사비 알론소", alt: "하비 알론소", preferred: "사비 알론소" }])
  })

  it("성씨 2자 오표기도 잡는다 — 3자 하한에 걸려 빠져나갔던 사례", () => {
    expect(findNotationViolations("카릭, 래시포드 복귀 확인", DICT).map((v) => v.alt)).toEqual([
      "카릭",
    ])
  })

  it("같은 인물의 여러 오표기를 모두 잡는다", () => {
    const alts = findNotationViolations("샤비 알론소와 자비 알론소는 같은 사람이다", DICT).map(
      (v) => v.alt
    )
    expect(alts).toEqual(expect.arrayContaining(["샤비 알론소", "자비 알론소"]))
  })

  it("⚠️ 더 긴 정식 표기는 위반이 아니다 — 본문의 'FC 바르셀로나'는 틀린 게 아니다", () => {
    expect(findNotationViolations("FC 바르셀로나가 공식 발표했다", DICT)).toEqual([])
    expect(findNotationViolations("마테오 모레토에 따르면", DICT)).toEqual([])
    expect(findNotationViolations("데이비드 온스테인 단독 보도", DICT)).toEqual([])
  })

  it("대표 표기만 쓴 정상 본문은 조용하다", () => {
    expect(findNotationViolations("사비 알론소와 위르겐 클롭이 바르셀로나에서", DICT)).toEqual([])
  })
})

describe("findNotationViolations — 성씨 별칭·접두 오탐 (2026-09-03 열린 경보 8건 중 6건)", () => {
  const DICT2: NotationEntry[] = [
    {
      id: "p_guela",
      category: "player",
      romanized: "",
      surfaces: [],
      preferred_ko: "겔라 두에",
      hangul_alts: ["두에"],
    },
    {
      id: "p_desire",
      category: "player",
      romanized: "",
      surfaces: [],
      preferred_ko: "데지레 두에",
      hangul_alts: ["두에"],
    },
    {
      id: "p_zirkzee",
      category: "player",
      romanized: "",
      surfaces: [],
      preferred_ko: "조슈아 지르크제이",
      hangul_alts: ["조슈아 지르크제"],
    },
  ]
  it("대표 표기의 한 토큰(성씨)인 alt 는 위반이 아니다 — 다른 항목과 성씨가 겹쳐도", () => {
    expect(findNotationViolations("레버쿠젠, 겔라 두에 영입", DICT2)).toEqual([])
  })
  it("대표 표기의 앞부분인 alt 는 대표 표기 자리에서 걸리지 않는다", () => {
    expect(findNotationViolations("조슈아 지르크제이, 맨유 잔류", DICT2)).toEqual([])
  })
  it("그래도 홀로 쓰인 접두 오표기는 잡는다", () => {
    expect(findNotationViolations("조슈아 지르크제 영입 제안", DICT2).map((v) => v.alt)).toEqual([
      "조슈아 지르크제",
    ])
  })
})
