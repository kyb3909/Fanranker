/**
 * 경기장 팀 → 그 구단의 올해 홈 유니폼 킷 키.
 *
 * 입장한 구장의 아바타가 그 팀 유니폼을 입고 나오게 하는 유일한 연결점이다.
 * 킷 정의는 lib/metaverse/avatar3d/kits.ts (+ club-kit-collections.ts) 가 정본.
 */
export const STADIUM_TEAM_KIT: Record<string, string> = {
  epl_arsenal: "red-horizon-home",
  epl_manutd: "manchester-red-26-home",
  epl_liverpool: "mersey-deep-red-26-home",
  epl_chelsea: "west-london-blue-26-home",
  epl_mancity: "manchester-sky-26-home",
  epl_tottenham: "north-london-lily-26-home",
}
