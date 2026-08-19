/**
 * 구단별 뉴스 플레이스홀더 카드 — 이미지 없는 기사에 붙일 그림을 고른다.
 *
 * ## 배경
 * 원문에 이미지가 없는 기사는 `no_image` 로 검수 무덤에 갇히거나(비니시우스 실사고),
 * 오피셜만 예외로 와인톤 기본 카드를 달고 나갔다. 그 기본 카드는 흰 배경이 박힌 로고를
 * 버건디 위에 합성한 것이라 "이미지 로딩 실패"처럼 보였고, 기사 내용도 못 알려줬다.
 * 2026-08-11 구단별 카드 21종을 만들어 대체한다 — 색만 봐도 어느 팀 소식인지 안다.
 *
 * ## 카드가 없는 구단은?
 * `default.webp`(중립 축구 카드)로 떨어진다. 구단을 늘리려면
 * `scripts/gen-team-news-cards.mjs` 의 TEAMS 에 추가해 생성한 뒤 아래 표에 등록하면 된다.
 */

/** `public/images/news-team/` 에 실제로 존재하는 카드만 등록한다 */
export const TEAM_CARD_DIR = "/images/news-team"
export const DEFAULT_TEAM_CARD = `${TEAM_CARD_DIR}/default.webp`

/**
 * 한글 표기 → 카드 id.
 *
 * ⚠️ **순서가 곧 우선순위다.** 더 구체적인 표기를 먼저 둔다:
 *   · "맨체스터 시티"·"맨체스터 유나이티드" 가 "맨체스터" 보다 앞
 *   · "인터 밀란"·"AC밀란" 이 "밀란" 보다 앞
 * 뒤집히면 맨유 기사가 맨시티 카드를 달고 나간다.
 */
const TEAM_PATTERNS: [RegExp, string][] = [
  // ── 맨체스터 두 팀 (가장 헷갈리는 쌍) ──
  [/맨체스터\s*시티|맨시티/, "epl_mancity"],
  [/맨체스터\s*유나이티드|맨유/, "epl_manutd"],
  // ── 밀라노 두 팀 ──
  [/인터\s*밀란|인테르/, "seriea_inter"],
  [/AC\s*밀란|에이씨\s*밀란/, "seriea_milan"],
  // ── 마드리드 두 팀 ──
  [/레알\s*마드리드/, "laliga_realmadrid"],
  [/아틀레티코/, "laliga_atletico"],
  // ── 나머지 (겹침 없음) ──
  [/아스날|아스널/, "epl_arsenal"],
  [/리버풀/, "epl_liverpool"],
  [/첼시/, "epl_chelsea"],
  [/토트넘/, "epl_tottenham"],
  [/뉴캐슬/, "epl_newcastle"],
  [/아스톤\s*빌라/, "epl_astonvilla"],
  [/브라이턴|브라이튼/, "epl_brighton"],
  [/웨스트햄/, "epl_westham"],
  [/바르셀로나/, "laliga_barcelona"],
  [/바이에른|뮌헨/, "bundesliga_bayern"],
  [/도르트문트/, "bundesliga_dortmund"],
  [/유벤투스/, "seriea_juventus"],
  [/나폴리/, "seriea_napoli"],
  [/파리\s*생제르맹|PSG/, "ligue1_psg"],
  // ── 26/27 EPL 잔여 11팀 (2026-08-20 P2 — 개막 주간 커버리지) ──
  [/본머스/, "epl_bournemouth"],
  [/브렌트퍼드|브렌트포드/, "epl_brentford"],
  [/코벤트리|코번트리/, "epl_coventry"],
  [/크리스털\s*팰리스|크리스탈\s*팰리스|팰리스/, "epl_crystalpalace"],
  [/에버턴|에버튼/, "epl_everton"],
  [/풀럼|풀햄/, "epl_fulham"],
  // "헐" 단독은 한국어 감탄사와 충돌한다 — 반드시 "시티"까지 요구
  [/헐\s*시티/, "epl_hull"],
  [/입스위치/, "epl_ipswich"],
  // "리즈" 단독은 "시리즈"에 걸린다 — 뒤에 유나이티드가 오거나, 앞이 "시"가 아닐 때만
  [/리즈\s*유나이티드|(?<!시)리즈(?=[가-힣\s]|$)/, "epl_leeds"],
  [/노팅엄/, "epl_nottingham"],
  [/선덜랜드|썬더랜드/, "epl_sunderland"],
  // "밀란" 단독은 위 두 밀라노 팀이 다 안 걸린 뒤에만 — AC밀란 쪽이 통칭이다
  [/밀란/, "seriea_milan"],
]

/**
 * 텍스트에서 구단을 찾아 카드 경로를 돌려준다. 못 찾으면 중립 카드.
 *
 * 제목을 먼저 보고 본문을 나중에 보는 이유: 이적 기사는 본문에 팀이 여럿 나오는데,
 * 제목에 걸린 팀이 그 기사의 주인공일 확률이 훨씬 높다.
 */
export function resolveTeamCard(title: string, body?: string): string {
  for (const source of [title, body ?? ""]) {
    if (!source) continue
    for (const [re, id] of TEAM_PATTERNS) {
      if (re.test(source)) return `${TEAM_CARD_DIR}/${id}.webp`
    }
  }
  return DEFAULT_TEAM_CARD
}

/** 이 경로가 우리가 붙인 플레이스홀더인가 (검수 화면·통계에서 실제 사진과 구분) */
export function isTeamCard(src: string | null | undefined): boolean {
  return !!src && src.startsWith(`${TEAM_CARD_DIR}/`)
}
