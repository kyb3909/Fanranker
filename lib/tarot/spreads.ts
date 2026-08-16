/**
 * 스프레드 정의 — 포지션 의미는 해석 프롬프트에 그대로 주입된다.
 *
 * v1 은 원카드·3카드만. 켈틱 10장은 타로 서비스에 있지만 여기선 뺐다 —
 * 10장짜리는 2단계 호출(비공개 분석 → 최종)이 필요해 원가·지연이 몇 배가 되고,
 * "재미로 한 번 보는" 이 피처의 성격과도 안 맞는다.
 *
 * 포지션 이름은 축구 맥락에 맞게 바꿨다: 원본의 과거/현재/미래는 그대로 쓰면
 * 경기 질문에 어색해서("과거의 흐름"이 뭘 말하는지 모호), 흐름/변수/결말로 옮겼다.
 */

export type SpreadId = "one" | "three"

interface SpreadPosition {
  index: number
  /** 표시용 이름 */
  name: string
  /** 프롬프트 주입용 의미 */
  meaning: string
}

interface Spread {
  id: SpreadId
  name: string
  /** 화면 설명 — 무엇을 물을 때 쓰는지 */
  hint: string
  count: number
  positions: SpreadPosition[]
}

const p = (index: number, name: string, meaning: string): SpreadPosition => ({
  index,
  name,
  meaning,
})

export const SPREADS: Record<SpreadId, Spread> = {
  one: {
    id: "one",
    name: "한 장",
    hint: "빠르게 하나만 — 오늘 경기, 지금 이 이적설",
    count: 1,
    positions: [p(0, "핵심", "지금 이 질문에 대한 핵심 메시지")],
  },
  three: {
    id: "three",
    name: "세 장",
    hint: "흐름까지 — 어쩌다 여기까지 왔고 어디로 가는지",
    count: 3,
    positions: [
      p(0, "흐름", "지금 상황을 만든 배경과 지금까지의 흐름"),
      p(1, "변수", "결과를 가를 핵심 변수 또는 걸림돌"),
      p(2, "결말", "이 흐름이 이어질 때의 전개"),
    ],
  },
}

export function getSpread(id: SpreadId): Spread {
  return SPREADS[id]
}

export const SPREAD_IDS: SpreadId[] = ["one", "three"]

export function isSpreadId(v: unknown): v is SpreadId {
  return typeof v === "string" && (SPREAD_IDS as string[]).includes(v)
}
