import { SITE_MODE, SITE_META } from './site-config'

const meta = SITE_META[SITE_MODE]

export const SITE_CONFIG = {
  name: meta.name,
  url: process.env.NEXT_PUBLIC_SITE_URL || 'https://community-app-brown.vercel.app',
  description: meta.description,
  locale: 'ko_KR',
  keywords: [...meta.keywords],
}

/** JSON-LD 직렬화 (XSS 방지용 < 이스케이프) */
export function jsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
