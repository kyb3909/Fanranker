import type { Position } from "./players"

/**
 * AI 감독 성격 (2026-08-25 운영자 요청).
 *
 * ## 왜 필요한가
 * 사람 대 사람 대결은 지금 성립하지 않는다 — 30일 신규 가입이 4명이라 방이 안 찬다.
 * 그래서 실질 주력은 **솔로 vs AI 3인**이고, AI 셋이 전부 같은 로직으로 뽑으면
 * 매 판이 똑같아 두세 판이면 질린다.
 *
 * 성격을 주면 상대가 셋 다 다르게 굴고, "수비형이 센터백을 쓸어 가기 전에 내가
 * 먼저 잡아야 하나" 같은 판단이 생긴다. 드래프트의 재미는 남이 뭘 노리는지 읽는 데서
 * 나오는데, 지금은 읽을 것이 없었다.
 *
 * ## 손잡이 두 개뿐이다
 * 복잡한 AI를 만들지 않는다. 포지션 선호(posWeight)와 스타 선호(starBias) 둘이면
 * 성격이 충분히 갈리고, 결과도 사람이 읽을 수 있다.
 *  · posWeight — 후보 점수에 곱한다. 1보다 크면 그 포지션을 먼저 채간다.
 *  · starBias  — 1보다 크면 비싼 선수에 예산을 몰고, 작으면 고르게 나눠 쓴다.
 */
export type AiPersona = "balanced" | "defensive" | "attacking"

export interface PersonaSpec {
  id: AiPersona
  /** 화면에 보이는 이름 */
  label: string
  /** 한 줄 설명 — 상대가 뭘 노리는지 알아야 견제가 성립한다 */
  blurb: string
  posWeight: Record<Position, number>
  starBias: number
  /** 이 성격이 고르는 포메이션 후보 — 성격과 진형이 따로 놀면 안 읽힌다 */
  formations: string[]
}

export const PERSONAS: Record<AiPersona, PersonaSpec> = {
  balanced: {
    id: "balanced",
    label: "밸런스형",
    blurb: "약점 없는 팀. 포지션을 고루 채우고 예산도 고르게 쓴다.",
    posWeight: { GK: 1, DF: 1, MF: 1.05, FW: 1 },
    starBias: 1.0,
    formations: ["4-4-2", "4-3-3"],
  },
  defensive: {
    id: "defensive",
    label: "수비형",
    blurb: "뒤부터 잠근다. 좋은 수비수와 골키퍼를 먼저 쓸어 간다.",
    posWeight: { GK: 1.35, DF: 1.4, MF: 1.0, FW: 0.7 },
    starBias: 0.85,
    formations: ["5-3-2", "5-4-1"],
  },
  attacking: {
    id: "attacking",
    label: "공격형",
    blurb: "화력에 몰빵. 비싼 공격수를 잡고 뒤는 싸게 메운다.",
    posWeight: { GK: 0.7, DF: 0.75, MF: 1.15, FW: 1.5 },
    starBias: 1.35,
    formations: ["3-4-3", "4-3-3"],
  },
}

/**
 * 좌석 순서대로 성격을 배정한다 — 사람(0번)을 빼고 1번부터 돌린다.
 * 셋이면 밸런스·수비·공격이 정확히 하나씩 들어간다.
 */
const ROTATION: AiPersona[] = ["balanced", "defensive", "attacking"]

export function personaForSeat(seatIndex: number, mySeat: number): PersonaSpec {
  // 내 좌석보다 뒤면 한 칸 당겨 셋이 겹치지 않게 한다
  const aiOrder = seatIndex > mySeat ? seatIndex - 1 : seatIndex
  return PERSONAS[ROTATION[aiOrder % ROTATION.length]]
}
