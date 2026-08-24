import type { MetadataRoute } from "next"
import { SITE_CONFIG } from "@/lib/seo"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // ⚠️ `/matches?date=` 는 날짜 칩이 양쪽으로 끝없이 이어져 크롤러에게 무한 공간이다.
      //    한 페이지마다 유료 축구 API 하루치를 사므로 반드시 막는다 (2026-08-25 크레딧 화재).
      disallow: ["/admin/", "/api/", "/settings/", "/payments/", "/matches?date="],
    },
    sitemap: `${SITE_CONFIG.url}/sitemap.xml`,
  }
}
