export const SITE_CONFIG = {
  name: 'FanRanker',
  url: process.env.NEXT_PUBLIC_SITE_URL || 'https://community-app-brown.vercel.app',
  description: '스포츠 승부예측과 커뮤니티를 한곳에서. FanRanker',
  locale: 'ko_KR',
  keywords: [
    '스포츠 예측', '승부예측', '프로토', '축구', '야구',
    '농구', '배구', 'e스포츠', '커뮤니티',
  ],
}

/** JSON-LD 직렬화 (XSS 방지용 < 이스케이프) */
export function jsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
