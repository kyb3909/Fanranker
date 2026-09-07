/**
 * 운영 알림 → 처리 화면 (순수 모듈, 2026-09-08).
 *
 * 운영자: "디코로 나한테 해야할 일이 날아오잖아. 그러면 관리자 페이지 거기로 이동하게끔."
 *
 * 종전 알림은 대부분 `/admin/operations` 한 곳으로만 보냈다. 거기 가도 환불은 환불 화면,
 * 표기는 사전 화면으로 또 이동해야 한다. 알림 항목마다 **실제 일하는 자리**를 붙인다.
 *
 * ⚠️ 필터가 있는 화면은 필터까지 넣는다 — 목록 첫 쪽이 아니라 **오래된 것부터** 열려야
 *    알림을 받고 바로 처리할 수 있다(신고·환불 화면이 `status`·`sort` 를 URL 로 받는다).
 */

export interface OpsScreen {
  label: string
  path: string
}

export const OPS_SCREENS = {
  controlCenter: { label: "관제 센터", path: "/admin" },
  operations: { label: "운영 모니터링", path: "/admin/operations" },
  system: { label: "시스템 상태", path: "/admin/system" },
  matches: { label: "경기 관리", path: "/admin/matches" },
  settlements: { label: "정산 처리", path: "/admin/settlements" },
  // 오래 기다린 미지급부터 — 알림이 왔다는 건 이미 밀렸다는 뜻이다
  refunds: { label: "환불 큐", path: "/admin/refunds?status=pending&sort=oldest" },
  reportsOldest: {
    label: "신고 처리",
    path: "/admin/content/reports?status=pending&sort=oldest",
  },
  newsReview: { label: "뉴스 검수", path: "/admin/news-review" },
  aggReview: { label: "커뮤글 검수", path: "/admin/agg-review" },
  sagaReview: { label: "사가 검수", path: "/admin/saga-review" },
  ticker: { label: "뉴스 티커", path: "/admin/content/ticker" },
  teamDictionary: { label: "팀 사전", path: "/admin/team-dictionary" },
} as const satisfies Record<string, OpsScreen>

/**
 * 운영 점검 항목 이름 → 처리 화면.
 *
 * 이름에 이모지가 붙어 오므로 **핵심 낱말**로만 맞춘다. 순서가 규칙의 일부다 —
 * 위에서부터 처음 걸리는 것을 쓴다.
 */
const RULES: { match: RegExp; screen: OpsScreen }[] = [
  { match: /환불/, screen: OPS_SCREENS.refunds },
  { match: /미정산|고아 슬립|정산/, screen: OPS_SCREENS.settlements },
  { match: /신고/, screen: OPS_SCREENS.reportsOldest },
  { match: /티커|뉴스 크롤러/, screen: OPS_SCREENS.ticker },
  { match: /커뮤 크롤|커뮤글/, screen: OPS_SCREENS.aggReview },
  { match: /브레이킹|스캐너|검수 기사|오류 제보/, screen: OPS_SCREENS.newsReview },
  { match: /사가/, screen: OPS_SCREENS.sagaReview },
  { match: /매치 ID|표기|사전/, screen: OPS_SCREENS.teamDictionary },
  { match: /betman 동기화|배당|경기|스코어|결과/, screen: OPS_SCREENS.matches },
  { match: /감사관|크레딧|API 호출/, screen: OPS_SCREENS.operations },
]

/** 못 맞추면 관제 센터로 — 링크가 없는 것보다 낫고, 거기서 다시 고를 수 있다 */
export function screenForIssue(name: string): OpsScreen {
  return RULES.find((r) => r.match.test(name))?.screen ?? OPS_SCREENS.controlCenter
}

/** 항목 여러 개 → 중복 없는 바로가기 목록 */
export function screensForIssues(names: string[]): OpsScreen[] {
  const seen = new Set<string>()
  const out: OpsScreen[] = []
  for (const name of names) {
    const screen = screenForIssue(name)
    if (seen.has(screen.path)) continue
    seen.add(screen.path)
    out.push(screen)
  }
  return out
}
