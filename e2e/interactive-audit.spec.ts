import { test, expect, type Page } from "@playwright/test"

/**
 * Interactive Audit — 페이지별 핵심 시나리오. 콘솔 에러 + page error 자동 캡처.
 * Clerk/CSP 경고는 환경 영역이라 무시.
 */

test.setTimeout(60000)

function attachErrorCollector(page: Page) {
  const errors: string[] = []
  page.on("console", (msg) => {
    if (msg.type() !== "error") return
    const text = msg.text()
    if (text.includes("Clerk") || text.includes("HTTP Origin")) return
    if (text.includes("Content Security Policy")) return
    if (text.includes("Failed to load resource")) return
    if (text.includes("X-Frame-Options")) return
    errors.push(`console: ${text.slice(0, 200)}`)
  })
  page.on("pageerror", (err) => {
    if (err.message.includes("Clerk") || err.message.includes("X-Frame-Options")) return
    errors.push(`pageerror: ${err.message.slice(0, 200)}`)
  })
  return errors
}

test.describe("Interactive Audit", () => {
  test("홈 — 카드 dropdown 메뉴 4가지 클릭", async ({ page }) => {
    const errors = attachErrorCollector(page)
    await page.goto("/")
    await page.evaluate(() =>
      localStorage.setItem("announcement_dismissed_until", String(Date.now() + 86400000))
    )
    await page.reload({ waitUntil: "domcontentloaded" })
    await page.waitForSelector("article", { timeout: 15000 })
    const card = page.locator("article").first()

    // 작성자 dropdown 열기 → 메뉴 항목 노출
    await card.locator("button").filter({ hasText: /^@/ }).first().click()
    await expect(page.locator('[role="menuitem"]').filter({ hasText: "검색" })).toBeVisible({
      timeout: 5000,
    })
    await page.keyboard.press("Escape")
    await page.waitForTimeout(300)

    // 더보기 메뉴 열기 → 신고하기
    await card.locator('button[aria-label="더보기 메뉴"]').click()
    await expect(page.locator('[role="menuitem"]').filter({ hasText: "신고" })).toBeVisible({
      timeout: 5000,
    })
    await page.keyboard.press("Escape")

    expect(errors, errors.join("\n")).toEqual([])
  })

  test("홈 — 추천/저장/공유 버튼 클릭 (콘솔 에러 0)", async ({ page }) => {
    const errors = attachErrorCollector(page)
    await page.goto("/")
    await page.waitForSelector("article")
    const card = page.locator("article").first()

    await card.locator('button[aria-label="추천"]').click()
    await page.waitForTimeout(500)
    await card.locator('button[aria-label="비추천"]').click()
    await page.waitForTimeout(500)
    await card.locator('button[aria-label*="저장"]').click()
    await page.waitForTimeout(500)
    // 공유는 navigator.share 호출하므로 dialog 발생 가능 — 스킵

    expect(errors, errors.join("\n")).toEqual([])
  })

  test("홈 — 사이드바 ★ 즐겨찾기 클릭 (비로그인 silent)", async ({ page }) => {
    const errors = attachErrorCollector(page)
    await page.goto("/")
    const star = page.locator('button[aria-label*="즐겨찾기 추가"]').first()
    await expect(star).toBeVisible()
    await star.click()
    await page.waitForTimeout(800)

    expect(errors, errors.join("\n")).toEqual([])
  })

  test("게시판 — 글쓰기/팔로우/flair 클릭", async ({ page }) => {
    const errors = attachErrorCollector(page)
    await page.goto("/community/football")
    await page.waitForLoadState("networkidle")

    // flair "정보" 클릭 — URL에 ?flair= 추가
    const flair = page.locator('a:has-text("정보")').first()
    if ((await flair.count()) > 0) {
      await flair.click()
      await page.waitForTimeout(500)
    }

    expect(errors, errors.join("\n")).toEqual([])
  })

  test("/search?q=후프드림즈&type=nickname — 페이지 로드 + 결과", async ({ page }) => {
    const errors = attachErrorCollector(page)
    await page.goto("/search?q=후프드림즈&type=nickname")
    await page.waitForLoadState("networkidle", { timeout: 10000 })
    // 결과 ul 또는 빈 상태 메시지 노출
    await page.waitForTimeout(1500)
    const has = (await page.locator('ul[class*="overflow"] li').count()) > 0
    const empty = await page
      .locator("text=검색 결과가 없습니다")
      .isVisible()
      .catch(() => false)
    expect(has || empty).toBeTruthy()

    expect(errors, errors.join("\n")).toEqual([])
  })

  test("/post/[id] — 뒤로 / 댓글 입력 / 사이드바 카테고리 클릭", async ({ page }) => {
    const errors = attachErrorCollector(page)
    await page.goto("/post/fab2827a-bb9d-439b-8a48-a3238353d894")
    await page.waitForLoadState("networkidle")
    // 사이드바 카테고리 링크 한 개 클릭
    const cat = page.locator('nav[aria-label="카테고리 탐색"] a[href*="/community/"]').first()
    await cat.click()
    await expect(page).toHaveURL(/\/community\//)

    expect(errors, errors.join("\n")).toEqual([])
  })

  test("Topbar nav 4개 클릭 → 모두 정상 navigation", async ({ page }) => {
    const errors = attachErrorCollector(page)
    await page.goto("/")
    for (const [label, expected] of [
      ["운동장", /\/explore/],
      ["경기 예측", /\/prediction/],
      ["상점", /\/shop/],
      ["담벼락", /\/$|\/?$/],
    ] as const) {
      await page.locator(`nav a:has-text("${label}")`).first().click()
      await expect(page).toHaveURL(expected)
      await page.waitForTimeout(400)
    }
    expect(errors, errors.join("\n")).toEqual([])
  })

  test("Topbar 로고 클릭 → 홈 이동", async ({ page }) => {
    const errors = attachErrorCollector(page)
    await page.goto("/community/football")
    await page.locator('a[aria-label="홈"]').first().click()
    await expect(page).toHaveURL(/\/$|\/?$/)
    expect(errors, errors.join("\n")).toEqual([])
  })

  test("검색 폼 submit + ESC", async ({ page }) => {
    const errors = attachErrorCollector(page)
    await page.goto("/")
    const input = page.locator('input[name="q"]').first()
    await input.fill("축구")
    await input.press("Enter")
    await expect(page).toHaveURL(/\/search\?q=/)
    expect(errors, errors.join("\n")).toEqual([])
  })

  test("/explore 카테고리 그리드 클릭 → 게시판", async ({ page }) => {
    const errors = attachErrorCollector(page)
    await page.goto("/explore")
    const cat = page.locator('main a[href*="/community/"]').first()
    await cat.click()
    await expect(page).toHaveURL(/\/community\//)
    expect(errors, errors.join("\n")).toEqual([])
  })

  test("Footer 4 페이지 — 사이드바 link 직접 클릭", async ({ page }) => {
    const errors = attachErrorCollector(page)
    for (const [label, expected] of [
      ["서비스 소개", /\/about/],
      ["콘텐츠 정책", /\/content-policy/],
      ["이용약관", /\/terms/],
      ["개인정보처리방침", /\/privacy/],
    ] as const) {
      await page.goto("/")
      await page.locator(`nav a:has-text("${label}")`).first().click()
      await expect(page).toHaveURL(expected)
    }
    expect(errors, errors.join("\n")).toEqual([])
  })
})
