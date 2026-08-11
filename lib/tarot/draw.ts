/**
 * 카드 추출 — **서버가 확정한다**.
 *
 * 타로 서비스(D:/Projects/tarot)의 불변식을 그대로 가져온다. 클라이언트 셔플은 연출일 뿐,
 * 뽑힌 카드·정역은 서버가 정하고 클라이언트가 보낸 값은 신뢰하지 않는다. 이걸 지키지
 * 않으면 유저가 카드를 골라 원하는 결과를 만들 수 있고, 그 순간 "점"이 아니라 장난감이 된다.
 *
 * 불변식:
 *  - 한 리딩 안에서 같은 카드 중복 없음 (비복원 추출)
 *  - 정/역방향은 카드당 독립 확률로 서버 결정
 */
import { getSpread, type SpreadId } from "./spreads"

/** 메이저 아르카나 수 (0..21). v1 은 메이저만 — 마이너 56장은 이미지·의미가 없다. */
export const MAJOR_ARCANA_COUNT = 22

/** 역방향 확률 (카드당 독립) */
export const REVERSAL_PROBABILITY = 0.5

export interface DrawnCard {
  /** 스프레드 포지션 인덱스 (0부터) */
  position: number
  /** 0..21 */
  arcanaNumber: number
  reversed: boolean
}

export type Rng = () => number

/** Fisher-Yates 부분 셔플로 0..(deckSize-1)에서 count 장 비복원 추출 */
function drawIndices(count: number, deckSize: number, rng: Rng): number[] {
  if (count > deckSize) {
    throw new Error(`덱(${deckSize}장)보다 많은 ${count}장을 뽑을 수 없습니다.`)
  }
  const deck = Array.from({ length: deckSize }, (_, i) => i)
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (deckSize - i))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck.slice(0, count)
}

/** 스프레드에 맞춰 카드를 뽑는다. rng 주입은 테스트용. */
export function drawCards(
  spreadId: SpreadId,
  reversalsEnabled = true,
  rng: Rng = Math.random,
  deckSize: number = MAJOR_ARCANA_COUNT
): DrawnCard[] {
  const spread = getSpread(spreadId)
  const indices = drawIndices(spread.count, deckSize, rng)
  return indices.map((arcanaNumber, position) => ({
    position,
    arcanaNumber,
    reversed: reversalsEnabled ? rng() < REVERSAL_PROBABILITY : false,
  }))
}
