/**
 * 경기장 입장 화면의 경로 판정.
 *
 * 이 라우트는 걸어다니는 풀스크린 3D 화면이라 사이트 크롬(헤더·모바일 탭바·FAB)을
 * 전부 걷는다. 판정이 여러 곳에 흩어지면 한 곳만 고쳐지고 나머지가 남는다 —
 * 실제로 헤더만 걷고 탭바가 남아 [입장하기] 의 탭 가능 높이가 17px 로 깎였다(감리 C3).
 * 그래서 판정을 여기 한 줄로 모은다.
 */
const STADIUM_PLAY = /^\/stadium\/[^/]+\/enter\/?$/

export function isStadiumPlayRoute(pathname: string): boolean {
  return STADIUM_PLAY.test(pathname)
}
