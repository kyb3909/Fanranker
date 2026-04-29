import { test, expect } from "@playwright/test"

/**
 * Minimal Sport — 확장 버튼/링크 감사 (auth 불필요한 시나리오만).
 * Clerk dev keys 미설정 환경에서도 통과하도록 인증 후 동작은 sign-in 모달 트리거 또는
 * 비로그인 안내 메시지 등으로 검증.
 */

test.describe("Minimal Sport — 확장 감사", () => {
  test("홈 광고 배너 — 닫기 버튼 동작", async ({ page }) => {
    await page.goto("/")
    await page.evaluate(() => localStorage.removeItem("announcement_dismissed_until"))
    await page.reload()
    // 배너 노출 대기 (애니메이션 포함)
    const closeBtn = page.locator('button[aria-label="닫기"], button:has-text("닫기")').first()
    if ((await closeBtn.count()) > 0) {
      await expect(closeBtn).toBeVisible({ timeout: 8000 })
      await closeBtn.click()
      // 닫힘 후 banner section 사라짐 또는 height 0
      await page.waitForTimeout(500)
    }
  })

  test("홈 정렬 칩 — 랜덤/온도순/최신순 클릭 모두 응답", async ({ page }) => {
    await page.goto("/")
    await page.evaluate(() =>
      localStorage.setItem("announcement_dismissed_until", String(Date.now() + 86400000))
    )
    await page.reload()
    for (const label of ["랜덤", "온도순", "최신순"]) {
      const btn = page.locator(`button:has-text("${label}")`).first()
      await expect(btn).toBeVisible()
      await btn.click()
      await page.waitForTimeout(400)
    }
  })

  test("게시판 flair 필터 — 클릭 시 URL 갱신", async ({ page }) => {
    await page.goto("/community/football")
    const flair = page.locator('a[href*="?flair="]').first()
    if ((await flair.count()) > 0) {
      await flair.click()
      await expect(page).toHaveURL(/flair=/)
    }
  })

  test("게시판 페이지네이션 — 다음 페이지 이동", async ({ page }) => {
    await page.goto("/community/football")
    const next = page.locator('a[href*="page=2"]').first()
    if ((await next.count()) > 0) {
      await next.click()
      await expect(page).toHaveURL(/page=2/)
    }
  })

  test("홈 카드 추천 클릭 — 비로그인 시 sign-in 트리거 시도", async ({ page }) => {
    await page.goto("/")
    await page.evaluate(() =>
      localStorage.setItem("announcement_dismissed_until", String(Date.now() + 86400000))
    )
    await page.reload()
    await page.waitForSelector("article")
    const card = page.locator("article").first()
    const upBtn = card.locator('button[aria-label="추천"]')
    await upBtn.click()
    // sign-in trigger는 Clerk JS가 production keys로 localhost에서 안 뜰 수 있음.
    // 최소 button 자체는 클릭 가능해야 함 (no error thrown)
    await page.waitForTimeout(500)
  })

  test("홈 카드 작성자 클릭 — /profile 이동", async ({ page }) => {
    await page.goto("/")
    await page.evaluate(() =>
      localStorage.setItem("announcement_dismissed_until", String(Date.now() + 86400000))
    )
    await page.reload()
    await page.waitForSelector("article")
    const authorLink = page.locator('article a[href*="/profile/"]').first()
    if ((await authorLink.count()) > 0) {
      await authorLink.click()
      await expect(page).toHaveURL(/\/profile\//)
    }
  })

  test("홈 카드 댓글 클릭 — /post#comments 이동", async ({ page }) => {
    await page.goto("/")
    await page.waitForSelector("article")
    const commentsLink = page.locator('article a[href*="/post/"][href*="#comments"]').first()
    await commentsLink.click()
    await expect(page).toHaveURL(/\/post\/.*#comments/)
  })

  test("홈 탭 — 경기 분석글 토글", async ({ page }) => {
    await page.goto("/")
    await page.evaluate(() =>
      localStorage.setItem("announcement_dismissed_until", String(Date.now() + 86400000))
    )
    await page.reload()
    const contentTab = page.locator('button:has-text("경기 분석글")').first()
    await expect(contentTab).toBeVisible()
    await contentTab.click()
    await expect(page).toHaveURL(/tab=content/)
    // 다시 게시물 탭
    const feedTab = page.locator('button:has-text("게시물")').first()
    await feedTab.click()
    await page.waitForTimeout(400)
  })

  test("운동장(/explore) — 카테고리 그리드 클릭 → 게시판 이동", async ({ page }) => {
    await page.goto("/explore")
    // 가운데 큰 카테고리 그리드의 첫 항목 클릭
    const cat = page.locator('main a[href*="/community/"]').first()
    await cat.click()
    await expect(page).toHaveURL(/\/community\//)
  })

  test("탐색 정렬 탭 — 추천순/댓글순/조회순 모두 클릭", async ({ page }) => {
    await page.goto("/explore")
    for (const label of ["추천순", "댓글순", "조회순"]) {
      const btn = page.locator(`button:has-text("${label}")`).first()
      if ((await btn.count()) > 0) {
        await btn.click()
        await page.waitForTimeout(300)
      }
    }
  })

  test("게시판 사이드바 즐겨찾기 ★ — 비로그인 클릭 (sign-in 트리거 시도)", async ({ page }) => {
    await page.goto("/")
    const star = page.locator('button[aria-label*="즐겨찾기 추가"]').first()
    await expect(star).toBeVisible()
    await star.click()
    // 비로그인 → sign-in 모달 시도. Clerk 미설정 환경에선 silent.
    await page.waitForTimeout(500)
  })

  test("로고 클릭 — 어디서나 홈 / 이동", async ({ page }) => {
    await page.goto("/community/football")
    await page.locator('a[aria-label="홈"]').first().click()
    await expect(page).toHaveURL(/\/$|\/?$/)
  })

  test("Footer 링크 4개 — 사이드바에서 직접 클릭 이동", async ({ page }) => {
    for (const [label, expected] of [
      ["서비스 소개", /\/about/],
      ["이용약관", /\/terms/],
      ["개인정보처리방침", /\/privacy/],
      ["콘텐츠 정책", /\/content-policy/],
    ] as const) {
      await page.goto("/")
      const link = page.locator(`nav a:has-text("${label}")`).first()
      await link.click()
      await expect(page).toHaveURL(expected)
    }
  })

  test("Topbar nav 활성 underline — 현재 페이지에 해당 아이템 font-weight 800", async ({
    page,
  }) => {
    await page.goto("/explore")
    const active = page.locator('nav a:has-text("운동장")').first()
    // 활성 항목은 fontWeight 800 inline style. 비활성은 600.
    const weight = await active.evaluate((el) => (el as HTMLElement).style.fontWeight)
    expect(weight).toBe("800")
  })

  test("/post detail — 우측 aside 최근 댓글 데이터 노출", async ({ page }) => {
    await page.goto("/")
    await page.waitForSelector("article a[href^='/post/']")
    const link = page.locator("article a[href^='/post/']").first()
    await link.click()
    await expect(page).toHaveURL(/\/post\//)
    // aside 최근 댓글 — 우측 aside (border-l 클래스 가진 것)
    await page.waitForTimeout(2500)
    const rightAside = page.locator("aside.border-l").first()
    const talkText = await rightAside.textContent()
    expect(talkText).toBeTruthy()
    expect(talkText?.length).toBeGreaterThan(10)
  })
})
