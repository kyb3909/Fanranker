/**
 * 광고 룰 필터 설정 — 임계값·가중치·목록은 전부 여기서만 조정한다.
 *
 * 튜닝 원칙(P1 Phase 3): 오탐이 보이면 룰을 추가하지 말고 임계값부터 만진다.
 */

/** 도메인 블랙리스트 — 정확한 도메인(서브도메인 포함 suffix 매치). */
// 시작은 비워두고 드라이런·운영에서 실제 적발된 도메인을 채운다.
// 추측으로 채우지 않는다 — 잘못 넣으면 정상 글이 즉시 BLIND 점수를 받는다.
export const DOMAIN_BLACKLIST: string[] = []

/** 단축 URL 서비스 — 광고가 원본 도메인을 숨길 때 쓴다. */
// ⚠️ t.co(트위터)·youtu.be 는 임베드에 흔해서 제외 — 넣으면 정상 글 대량 오탐.
export const SHORT_URL_DOMAINS: string[] = [
  "bit.ly",
  "tinyurl.com",
  "is.gd",
  "ow.ly",
  "cutt.ly",
  "rb.gy",
  "shorturl.at",
  "buff.ly",
  // 한국계 단축 서비스
  "han.gl",
  "me2.do",
  "url.kr",
  "vo.la",
  "c11.kr",
  "lrl.kr",
  "zrr.kr",
  "muz.so",
  "abit.ly",
]

/**
 * 링크 신호에서 제외하는 도메인 — "외부 링크"가 아닌 것들.
 * 드라이런 실측(2026-07-29)에서 오탐 전원이 여기서 나왔다:
 * 트위터 임베드 17개 글이 linkDensity 에, 트윗 상태 ID 숫자가 전화번호 패턴에 걸림.
 * 임베드(트위터/유튜브/인스타)는 이 커뮤니티의 표준 콘텐츠 형식이라 광고 신호가 아니다.
 */
export const IGNORED_LINK_DOMAINS: string[] = [
  // 자체 도메인/스토리지
  "gongnori.fan",
  "ekysrlhdrapmsnrkytif.supabase.co",
  // 임베드 플랫폼 (TipTap embed 표준)
  "x.com",
  "twitter.com",
  "youtube.com",
  "youtu.be",
  "instagram.com",
  // 임베드가 끌고 오는 미디어 CDN
  "pbs.twimg.com",
  "i.ytimg.com",
  "img.clerk.com",
]

/** 도배 판정: SPAM_WINDOW_MINUTES 안에 유사 본문 SPAM_MIN_COUNT 회 이상 */
export const SPAM_WINDOW_MINUTES = 30
export const SPAM_MIN_COUNT = 3
/** 본문 유사도(3-gram Jaccard) 이 값 이상이면 "같은 글"로 취급 */
export const SPAM_SIMILARITY = 0.8

/** 신규 계정 기준(일). 이 안에 외부 링크를 올리면 신호 가점 */
export const NEW_ACCOUNT_DAYS = 7

/** 링크 밀도: 링크 MIN_LINKS 개 이상이고 링크당 본문이 CHARS_PER_LINK 자 미만이면 이상치 */
export const LINK_DENSITY_MIN_LINKS = 2
export const LINK_DENSITY_CHARS_PER_LINK = 120

/**
 * 연락처 패턴 — 광고의 최종 목적은 항상 "연락 채널로의 유도"다.
 * 링크형과 본문형을 분리한다: 본문형은 URL 을 제거한 텍스트에서만 검사해서
 * 트윗 상태 ID 같은 URL 내부 숫자열이 전화번호로 오탐되는 것을 막고,
 * 링크형(오픈채팅·텔레그램 초대)은 URL 목록에서 직접 검사한다.
 */
export const CONTACT_LINK_PATTERNS: RegExp[] = [
  /open\.kakao\.com\/o\//i, // 카카오 오픈채팅 초대 링크
  /(?<![\w.])t\.me\//i, // 텔레그램 초대 링크
]

export const CONTACT_TEXT_PATTERNS: RegExp[] = [
  // 채널 단어 단독으로는 안 잡는다("카톡 보내놨어" 같은 일상 대화) —
  // 채널 + ID 형태 토큰이 붙어야 신호로 본다.
  /(?:카톡|카카오톡|ㅋㅌ|톡)\s*(?:아이디|id)\s*[:：]?\s*[a-z0-9_.-]{4,}/i,
  /(?:텔레그램|텔레|텔그)\s*(?:아이디|id|주소)?\s*[:：]?\s*@?[a-z0-9_]{4,}/i,
  // 휴대폰 번호 — 앞뒤에 다른 숫자가 붙으면 긴 ID 의 일부이므로 제외 (트윗 상태 ID 오탐 실측)
  /(?<!\d)01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d)/,
]

/**
 * 신호별 가중치. 최종 점수 = min(1, Σ 가중치 × 신호점수).
 *
 * 설계 의도:
 * - domainBlacklist 단독으로 BLIND(0.9) 도달 — 블랙리스트는 이미 확정된 악성이다
 * - 나머지는 단독으론 조치 없음, 2개 이상 결합해야 VISIBILITY_DOWN/BLIND
 *   (예: 신규계정+연락처 = 0.95 → BLIND, 신규계정+단축URL = 0.75 → DOWN)
 */
export const SIGNAL_WEIGHTS = {
  domainBlacklist: 1.0,
  shortUrl: 0.35,
  spamRepeat: 0.75,
  newAccountLink: 0.4,
  linkDensity: 0.35,
  contact: 0.55,
} as const

/** 조치 임계값 */
export const THRESHOLDS = {
  /** 이 이상 → BLIND + 큐 (자동 삭제는 하지 않는다) */
  blind: 0.9,
  /** 이 이상 → VISIBILITY_DOWN + 큐 */
  visibilityDown: 0.6,
} as const
