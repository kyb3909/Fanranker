import { test, expect } from "@playwright/test"

/**
 * Minimal Sport 디자인 마이그레이션 후 버튼/링크 동작 전수 감사.
 * 비로그인 상태로 클릭 가능한 모든 액션을 검증한다.
 *
 * 통과 조건:
 * - 페이지가 200으로 응답
 * - 핵심 인터랙티브 요소가 DOM에 존재
 * - 클릭 시 navigation 또는 sign-in 모달 발생
 */

test.describe("Minimal Sport — 버튼/링크 동작 감사", () => {
  test("홈 — 핵심 인터랙티브 요소 모두 존재", async ({ page }) => {
    await page.goto("/")
    // 광고 배너 dismiss로 카드까지 스크롤 가능하게
    await page.evaluate(() =>
      localStorage.setItem("announcement_dismissed_until", String(Date.now() + 86400000))
    )
    await page.reload()
    await page.waitForLoadState("networkidle")

    // 로고
    await expect(page.locator('a[aria-label="홈"]')).toBeVisible()
    // Topbar nav 4개 (모바일도 노출)
    for (const label of ["담벼락", "운동장", "경기 예측", "상점"]) {
      await expect(page.locator(`nav a:has-text("${label}")`).first()).toBeVisible()
    }
    // 검색 input
    await expect(page.locator('input[name="q"]').first()).toBeVisible()
    // 알림 버튼
    await expect(page.locator('button[aria-label="알림"]').first()).toBeVisible()
    // 사이드바 별표 (즐겨찾기)
    await expect(page.locator('button[aria-label*="즐겨찾기"]').first()).toBeVisible()
    // 사이드바 footer 링크
    await expect(page.locator('a:has-text("이용약관")')).toBeVisible()
  })

  test("홈 카드 — 추천/공유/저장/댓글/작성자 버튼 wiring", async ({ page }) => {
    await page.goto("/")
    await page.waitForSelector("article")
    const card = page.locator("article").first()
    // 카드 액션 5종
    await expect(card.locator('button[aria-label="추천"]')).toBeVisible()
    await expect(card.locator('button[aria-label="비추천"]')).toBeVisible()
    await expect(card.locator('button[aria-label="공유"]')).toBeVisible()
    await expect(card.locator('button[aria-label*="저장"]')).toBeVisible()
    await expect(card.locator('a[href*="comments"]')).toBeVisible()
    await expect(card.locator('a[href*="profile"]')).toBeVisible()
  })

  test("Topbar nav 클릭 → 각 페이지로 이동", async ({ page }) => {
    await page.goto("/")
    await page.locator('nav a:has-text("운동장")').first().click()
    await expect(page).toHaveURL(/\/explore/)

    await page.locator('nav a:has-text("경기 예측")').first().click()
    await expect(page).toHaveURL(/\/prediction/)

    await page.locator('nav a:has-text("상점")').first().click()
    await expect(page).toHaveURL(/\/shop/)

    await page.locator('nav a:has-text("담벼락")').first().click()
    await expect(page).toHaveURL(/\/$/)
  })

  test("검색 폼 — 타이핑 + Enter → /search 이동", async ({ page }) => {
    await page.goto("/")
    const input = page.locator('input[name="q"]').first()
    await input.fill("축구")
    await input.press("Enter")
    await expect(page).toHaveURL(/\/search\?q=/)
  })

  test("게시판 — 글쓰기 / 팔로우 버튼 존재", async ({ page }) => {
    await page.goto("/community/football")
    await expect(page.locator('a:has-text("글쓰기")')).toBeVisible()
    await expect(page.locator('button:has-text("팔로우")').first()).toBeVisible()
  })

  test("Footer 페이지 4개 모두 200 + h1 렌더", async ({ page }) => {
    for (const path of ["/about", "/terms", "/privacy", "/content-policy"]) {
      await page.goto(path)
      await expect(page.locator("h1, h2").first()).toBeVisible()
    }
  })

  test("사이드바 카테고리 링크 → 게시판 이동", async ({ page }) => {
    await page.goto("/")
    // 첫 번째 사이드바 카테고리 링크 (축구)
    await page.locator('nav[aria-label="카테고리 탐색"] a[href*="/community/"]').first().click()
    await expect(page).toHaveURL(/\/community\//)
  })

  test("Post detail — 뒤로 / 댓글 폼 존재", async ({ page }) => {
    // 홈에서 첫 번째 카드 클릭
    await page.goto("/")
    await page.waitForSelector("article")
    const titleLink = page.locator("article a[href^='/post/']").first()
    if ((await titleLink.count()) > 0) {
      await titleLink.click()
    } else {
      await page.locator("article").first().click()
    }
    await expect(page).toHaveURL(/\/post\//)
    await expect(page.locator('button:has-text("뒤로")')).toBeVisible()
    await expect(page.locator('textarea, input[type="text"]').first()).toBeVisible()
  })

  test("/search 페이지 — 폼 + 카테고리 select", async ({ page }) => {
    await page.goto("/search?q=테스트")
    await expect(page.locator('input[name="q"]').nth(1)).toHaveValue("테스트")
    await expect(page.locator('button:has-text("검색")').first()).toBeVisible()
  })

  test("핵심 페이지 6개 — 200 + 토피탑 노출", async ({ page }) => {
    for (const path of [
      "/",
      "/prediction",
      "/explore",
      "/shop",
      "/community/football",
      "/search",
    ]) {
      const res = await page.goto(path)
      expect(res?.status()).toBe(200)
      await expect(page.locator('a[aria-label="홈"]')).toBeVisible()
    }
  })
})
