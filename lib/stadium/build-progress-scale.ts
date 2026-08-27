/**
 * 레벨 → 시공률, 그리고 팀 → 3D 시안 구장 키.
 *
 * 이 두 값이 세 곳에서 같아야 한다:
 *   ① 모달 스틸 (scripts/render-stadiums.mjs 가 이 비율로 미리 구웠다)
 *   ② 경기장 입장 화면 (같은 비율로 세워 연다)
 *   ③ 지도 라벨의 진행률 표기
 * 어긋나면 "지도에선 34% 인데 들어가 보니 반쯤 지어져 있다"가 된다.
 *
 * ⚠️ scripts/render-stadiums.mjs 는 .mjs 라 이 파일을 import 하지 못해 같은 식을
 *    복사해 두었다. 여기를 고치면 그쪽도 같이 고치고 이미지를 다시 구울 것.
 */

/** 레벨 1 은 터파기, 레벨 10 은 완공 */
export function buildFraction(level: number): number {
  return Math.min(1, 0.06 + ((Math.min(Math.max(level, 1), 10) - 1) / 9) * 0.94)
}

/** 팀 → 3D 시안(public/stadium/play/stadium-app.js STADIUMS)의 구장 키 */
export const PLAY_SCENE: Record<string, string> = {
  epl_arsenal: "emirates",
  epl_manutd: "oldtrafford",
  epl_liverpool: "anfield",
  epl_chelsea: "bridge",
  epl_mancity: "etihad",
  epl_tottenham: "spurs",
}
