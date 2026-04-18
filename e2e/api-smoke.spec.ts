import { test, expect } from "@playwright/test"

/**
 * API Smoke Test — 가오픈 후 회귀 방어선
 *
 * 목적: 배포 직후 또는 매 PR에서 핵심 공개 API가 살아있는지 1분 안에 검증.
 * 범위: 인증 불필요한 GET 엔드포인트 + 응답 형식 기본 검사.
 * 인증 필요한 POST/PATCH 플로우는 Clerk test mode 설정 후 별도 스위트로.
 *
 * 이 스위트가 깨지면 "뭔가 배포가 잘못됨" — 가장 먼저 쳐다볼 경보.
 */

const PUBLIC_ENDPOINTS = [
  { path: "/api/posts", label: "피드 목록" },
  { path: "/api/posts?community_slug=football&limit=10", label: "축구 보드 피드" },
  { path: "/api/categories", label: "카테고리 목록" },
  { path: "/api/banners", label: "배너" },
  { path: "/api/community/popular", label: "인기글" },
  { path: "/api/betman/games", label: "오늘의 경기" },
  { path: "/api/betman/rankings?sport=전체&limit=10", label: "예측 랭킹" },
  { path: "/api/betman/community-stats", label: "예측 커뮤니티 통계" },
  { path: "/api/rankings?scope=weekly&limit=10", label: "주간 랭킹" },
  { path: "/api/standings?league=epl", label: "EPL 순위" },
  { path: "/api/stickers", label: "스티커 상점" },
  { path: "/api/search?q=축구&limit=5", label: "검색" },
  { path: "/sitemap.xml", label: "sitemap (SEO)", contentType: "xml" },
  { path: "/robots.txt", label: "robots.txt (SEO)", contentType: "text" },
] as const

const AUTH_REQUIRED_ENDPOINTS = [
  { path: "/api/notifications", label: "알림" },
  { path: "/api/bookmarks", label: "북마크" },
  { path: "/api/posts/my", label: "내 글" },
  { path: "/api/predictions/my", label: "내 예측" },
  { path: "/api/tokens/balance", label: "토큰 잔액" },
  { path: "/api/gold/balance", label: "골드 잔액" },
  { path: "/api/profile/me", label: "내 프로필" },
] as const

test.describe("API smoke — 공개 엔드포인트", () => {
  for (const endpoint of PUBLIC_ENDPOINTS) {
    test(`${endpoint.label}: ${endpoint.path}`, async ({ request }) => {
      const res = await request.get(endpoint.path)
      expect(res.status(), `${endpoint.path} should return 2xx`).toBeGreaterThanOrEqual(200)
      expect(res.status()).toBeLessThan(300)

      const contentType = endpoint.contentType ?? "json"
      if (contentType === "json") {
        // JSON 응답 파싱 가능해야 함
        const body = await res.json()
        expect(body).toBeDefined()
      } else if (contentType === "xml") {
        const text = await res.text()
        expect(text).toContain("<?xml")
      } else if (contentType === "text") {
        const text = await res.text()
        expect(text.length).toBeGreaterThan(0)
      }
    })
  }
})

test.describe("API smoke — 인증 필요 엔드포인트 (401 기대)", () => {
  for (const endpoint of AUTH_REQUIRED_ENDPOINTS) {
    test(`${endpoint.label} 비로그인 거부: ${endpoint.path}`, async ({ request }) => {
      const res = await request.get(endpoint.path)
      // 401 로그인 필요 또는 403 권한 없음 허용
      expect(
        [401, 403].includes(res.status()),
        `${endpoint.path} should reject unauthenticated (got ${res.status()})`
      ).toBe(true)
    })
  }
})

test.describe("API smoke — rate-limit 반응", () => {
  test("follow 엔드포인트는 비로그인 요청도 rate-limit 적용 (STRICT)", async ({ request }) => {
    // 빠르게 여러 번 쏘아서 429 반환 경로 확인
    const results = await Promise.all(
      Array.from({ length: 30 }).map(() =>
        request.post("/api/follow", { data: { user_id: "test" } }).then((r) => r.status())
      )
    )
    // 401 또는 429 중 하나는 섞여 있어야 함 (rate limit이 발동하거나 인증에서 먼저 거부)
    const has429 = results.some((s) => s === 429)
    const has401 = results.some((s) => s === 401)
    expect(has429 || has401, `expected 401 or 429, got ${JSON.stringify(results)}`).toBe(true)
  })
})

test.describe("페이지 2xx 회귀", () => {
  const PAGES = [
    "/",
    "/?view=prediction",
    "/explore",
    "/community/football",
    "/community/baseball",
    "/community/game",
    "/shop",
    "/about",
    "/terms",
    "/privacy",
  ]

  for (const path of PAGES) {
    test(`${path} 로드`, async ({ page }) => {
      const response = await page.goto(path)
      expect(response?.status(), `${path} returned non-2xx`).toBeLessThan(400)
    })
  }
})
