import { SITE_META } from "./site-config"

export const SITE_CONFIG = {
  name: SITE_META.name,
  title: SITE_META.title,
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://gongnori.fan",
  description: SITE_META.description,
  locale: "ko_KR",
  keywords: [...SITE_META.keywords],
}

/** JSON-LD 직렬화 (XSS 방지용 < 이스케이프) */
export function jsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c")
}
