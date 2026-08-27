/**
 * 경기장 지도에 오르는 팀 — 서북 3 + 동남 3 구조 (2026-08-27 운영자 확정).
 *
 * team_map_pins 에는 EPL 11개 핀이 있지만 지도에 세우는 건 **구장 모델이 있는 6곳**뿐이다.
 * 팀을 늘리려면 여기에 좌표를 추가하고 구장 모델 파라미터를 함께 정한다.
 *
 * ⚠️ gx/gy 는 england-terrain 격자 좌표(158×105)다. team_map_pins.pin_x/pin_y 는
 *    구 캔버스 지도(components/stadium/region-map.tsx)용이라 좌표계가 다르다 — 섞지 말 것.
 *    3라운드 평가에서 "리버풀이 바다 위"·"아스날이 요크셔" 로 걸린 게 이 좌표라,
 *    지형 격자에 직접 찍어 육지 위임을 보장한다.
 */

export interface MapTeam {
  teamId: string
  /** 지도·모달에 쓰는 짧은 한글 이름 */
  name: string
  stadiumName: string
  /** 팀 컬러 */
  color: string
  /** 팀 컬러가 밝아서 글자를 어둡게 깔아야 하는가 */
  darkInk: boolean
  /** 지형 격자 좌표 */
  gx: number
  gy: number
  /** 라벨 선호 방향 (화면 px, 마커 기준 상대) — 충돌 회피 전 초기 배치 */
  labelDx: number
  labelDy: number
  /** 격차 배지·점선을 그리는 더비 상대 */
  derby?: string
}

export const MAP_TEAMS: readonly MapTeam[] = [
  // ── 서북 3 ──
  {
    teamId: "epl_liverpool",
    name: "리버풀",
    stadiumName: "안필드",
    color: "#C8102E",
    darkInk: false,
    gx: 76,
    gy: 99,
    labelDx: -104,
    labelDy: -84,
  },
  {
    teamId: "epl_manutd",
    name: "맨유",
    stadiumName: "올드 트래포드",
    color: "#DA291C",
    darkInk: false,
    gx: 85,
    gy: 87,
    labelDx: 8,
    labelDy: -122,
    derby: "epl_mancity",
  },
  {
    teamId: "epl_mancity",
    name: "맨시티",
    stadiumName: "에티하드 스타디움",
    color: "#6CABDD",
    darkInk: true,
    gx: 94,
    gy: 99,
    labelDx: 116,
    labelDy: -50,
    derby: "epl_manutd",
  },
  // ── 동남 3 ──
  {
    teamId: "epl_chelsea",
    name: "첼시",
    stadiumName: "스탬퍼드 브리지",
    color: "#034694",
    darkInk: false,
    gx: 100,
    gy: 121,
    labelDx: -96,
    labelDy: -48,
  },
  {
    teamId: "epl_arsenal",
    name: "아스날",
    stadiumName: "에미레이츠 스타디움",
    color: "#EF0107",
    darkInk: false,
    gx: 111,
    gy: 111,
    labelDx: -8,
    labelDy: -116,
    derby: "epl_tottenham",
  },
  {
    teamId: "epl_tottenham",
    name: "토트넘",
    stadiumName: "토트넘 홋스퍼 스타디움",
    color: "#132257",
    darkInk: false,
    gx: 121,
    gy: 101,
    labelDx: 112,
    labelDy: -74,
    derby: "epl_arsenal",
  },
]

export const MAP_TEAM_IDS: readonly string[] = MAP_TEAMS.map((t) => t.teamId)

/**
 * 구장들이 차지하는 격자 영역. 좁은 화면에서는 섬 전체가 아니라 이 영역에 맞춘다
 * — 390px 에 브리튼 전체를 넣으면 구장이 점만 해진다.
 */
export const MAP_TEAM_BOUNDS = {
  minX: Math.min(...MAP_TEAMS.map((t) => t.gx)),
  maxX: Math.max(...MAP_TEAMS.map((t) => t.gx)),
  minY: Math.min(...MAP_TEAMS.map((t) => t.gy)),
  maxY: Math.max(...MAP_TEAMS.map((t) => t.gy)),
}

export function findMapTeam(teamId: string): MapTeam | undefined {
  return MAP_TEAMS.find((t) => t.teamId === teamId)
}

/**
 * 지도 한 팀의 현재 상태 — 서버가 채워 클라이언트로 넘긴다.
 *
 * ⚠️ 이 타입은 순수 모듈에 둔다. 서버 조회 함수와 한 파일에 있으면 클라이언트
 *    컴포넌트가 타입만 import 해도 supabase/server 가 클라이언트 번들로 딸려온다.
 */
export interface StadiumMapRow {
  teamId: string
  level: number
  totalPoints: number
  fanCount: number
  /** 누적 벽돌 (기여 점수 환산) */
  bricks: number
  /** 최근 24시간에 쌓인 벽돌 */
  todayBricks: number
  /** 다음 레벨까지 0~1 */
  pct: number
}
