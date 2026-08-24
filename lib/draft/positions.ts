import type { Position } from "./players"

/**
 * 포지션 자격 — "이 선수가 저 자리에 설 수 있는가" (2026-08-25 운영자 요청).
 *
 * ## 왜 필요한가
 * 종전엔 선수의 `position` 과 슬롯의 포지션이 **정확히 같아야** 했다. 그래서
 * "미드도 되고 수비도 되는 선수"를 표현할 방법이 없었고, 포메이션의 MF 칸을
 * 반드시 MF 로 등록된 선수로만 채워야 했다.
 *
 * 그런데 선수 데이터에는 포지션이 **하나뿐이다** (아스널 199명 / FPL 820명 모두
 * `position: Position` 단일 필드). 부포지션을 선수마다 넣으려면 새 데이터가 필요하다.
 *
 * ## 데이터 없이 푸는 법
 * 실제 축구의 멀티 포지션은 대부분 **인접 포지션**이다 — 풀백↔윙백, 수비형 미드↔센터백,
 * 윙어↔공격형 미드. 그래서 규칙으로 처리한다. 골키퍼만 고정이다.
 *
 * 나중에 선수별 부포지션 데이터가 생기면 `canPlay` 에 `player.altPositions` 를
 * 한 줄 더 보태면 된다 — 호출부는 전부 이 함수를 통하므로 바꿀 곳이 한 곳이다.
 */
export const ELIGIBLE_SLOTS: Record<Position, Position[]> = {
  GK: ["GK"],
  DF: ["DF", "MF"],
  MF: ["DF", "MF", "FW"],
  FW: ["MF", "FW"],
}

/** 등록 포지션이 `playerPos` 인 선수가 `slotPos` 자리에 설 수 있는가 */
export function canPlay(playerPos: Position, slotPos: Position): boolean {
  return ELIGIBLE_SLOTS[playerPos].includes(slotPos)
}

/** 제 포지션이 아닌 자리에 선 것인가 — 화면에 표시해 주기 위한 것 */
export function isOutOfPosition(playerPos: Position, slotPos: Position): boolean {
  return playerPos !== slotPos && canPlay(playerPos, slotPos)
}

/** 슬롯 코드("MF2")에서 포지션만 떼어낸다 */
export function slotPosition(slotCode: string): Position {
  return slotCode.replace(/\d+$/, "") as Position
}
