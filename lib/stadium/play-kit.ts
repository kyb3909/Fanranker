/**
 * 경기장 입장 화면의 기본 유니폼 색.
 *
 * `<input type="color">` 의 초기값이라 CSS 변수가 들어갈 수 없다 — 브라우저가
 * 실제 hex 문자열만 받는다. 그래서 디자인 토큰 대신 상수로 두고, 지면(TSX)에서는
 * 이 값을 참조만 한다.
 */
export const DEFAULT_KIT = {
  shirt: "#c2273a",
  shorts: "#f2efe6",
  socks: "#c2273a",
  number: "14",
} as const
