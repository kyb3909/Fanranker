// lib/site-config.ts - 사이트 설정

/** 사이트 메타 정보 */
export const SITE_META = {
  name: "gongnori.fan",
  title: "그깟 공놀이에 진심인 팬들의 놀이터",
  description:
    "그깟 공놀이에 진심인 팬들의 놀이터. 경기 결과를 예측하고, 이야기하고, 팬심을 기록하는 스포츠 팬 커뮤니티입니다.",
  keywords: [
    "스포츠 예측",
    "승부예측",
    // "프로토" 제거 (2026-07-29) — 실존 도박 상품명. 카카오 비즈앱 심사에서
    // 사행성 서비스로 오인시키는 자충수라 중립 키워드로 대체.
    "해외축구",
    "EPL",
    "축구",
    "야구",
    "농구",
    "배구",
    "e스포츠",
    "커뮤니티",
  ],
} as const

/**
 * 사업자 표시 정보 — 푸터·개인정보처리방침·콘텐츠 정책이 전부 이 상수를 참조한다.
 *
 * ⚠️ TODO(운영자): 아래 플레이스홀더를 실제 값으로 채울 것. 채우기 전까지는
 * isBusinessInfoConfigured() 가 false 라서 화면에 노출되지 않는다 — 미기재보다
 * 나쁜 것이 허위 기재이므로, 플레이스홀더가 그대로 배포되어도 표시되지 않게 설계.
 */
export const BUSINESS_INFO = {
  company: "블루버드홀딩스",
  ceo: "OOO", // TODO(운영자): 대표자명
  regNo: "000-00-00000", // TODO(운영자): 사업자등록번호
  address: "OOO", // TODO(운영자): 사업장 주소
  contactEmail: "OOO", // TODO(운영자): 실제 개설한 문의 메일 (예: contact@gongnori.fan)
  mailOrderNo: "", // TODO(운영자): 통신판매업 신고번호 (미신고 시 신고 후 기재. 빈 값이면 해당 줄 비노출)
} as const

/** 운영자가 실값을 채웠는지 — 플레이스홀더 상태로는 화면에 내보내지 않는다 */
export function isBusinessInfoConfigured(): boolean {
  return BUSINESS_INFO.ceo !== "OOO" && BUSINESS_INFO.regNo !== "000-00-00000"
}

/** 문의 이메일이 실제로 개설·기재됐는지 */
export function isContactEmailConfigured(): boolean {
  return BUSINESS_INFO.contactEmail.includes("@")
}
