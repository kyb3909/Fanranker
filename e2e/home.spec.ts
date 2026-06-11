import { test, expect } from "@playwright/test"

// 2026-06-11 현행화: 리브랜딩(그깟 공놀이…) + 홈 탭 구조(게시물/경기 분석글) 반영.
// 측정 기준: 로컬 프로덕션 빌드 a11y 스냅샷 (docs/refactor/2026-06/04_phase4_notes.md 참조).

/** 피드 카드가 렌더될 때까지 대기 (networkidle 은 폴링 때문에 불안정) */
async function waitForFeed(page: import("@playwright/test").Page) {
  await page
    .locator('article a[href^="/post/"]')
    .first()
    .waitFor({ state: "visible", timeout: 15000 })
}

/**
 * 공지 배너는 홈 상단을 덮는 의도된 "커튼" 오버레이 (app-shell-client.tsx).
 * 떠 있는 동안 탭/정렬/상단 카드 클릭이 막히므로, 실사용자처럼 닫고 상호작용한다.
 */
async function dismissBannerIfPresent(page: import("@playwright/test").Page) {
  const closeButton = page
    .getByRole("region", { name: "공지 · 광고 배너" })
    .getByRole("button", { name: "닫기" })
  try {
    await closeButton.click({ timeout: 5000 })
    await closeButton.waitFor({ state: "hidden", timeout: 3000 })
  } catch {
    // 배너가 없거나 이미 닫힘 — 무시
  }
}

test.describe("메인 페이지 (홈)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/")
  })

  test.describe("페이지 로딩 및 초기 렌더링", () => {
    test("페이지가 정상적으로 로드되어야 한다", async ({ page }) => {
      await expect(page).toHaveTitle(/그깟 공놀이|gongnori/)
    })

    test("헤더가 표시되어야 한다", async ({ page }) => {
      const header = page.locator("header")
      await expect(header).toBeVisible()
    })

    test("GNB 주요 메뉴가 표시되어야 한다", async ({ page }) => {
      const nav = page.getByRole("navigation", { name: "주요 메뉴" })
      await expect(nav).toBeVisible()
      await expect(nav.getByRole("link", { name: "담벼락" })).toBeVisible()
      await expect(nav.getByRole("link", { name: "운동장" })).toBeVisible()
    })

    test("메인 콘텐츠 영역이 표시되어야 한다", async ({ page }) => {
      const main = page.locator("main")
      await expect(main).toBeVisible()
    })
  })

  test.describe("홈 탭 네비게이션", () => {
    test("게시물 탭이 기본 선택되어야 한다", async ({ page }) => {
      const postsTab = page.getByRole("tab", { name: "게시물" })
      await expect(postsTab).toBeVisible()
      await expect(postsTab).toHaveAttribute("aria-selected", "true")
    })

    test("경기 분석글 탭이 표시되어야 한다", async ({ page }) => {
      const analysisTab = page.getByRole("tab", { name: "경기 분석글" })
      await expect(analysisTab).toBeVisible()
    })

    test("경기 분석글 탭을 클릭하면 탭이 전환되어야 한다", async ({ page }) => {
      await dismissBannerIfPresent(page)
      const analysisTab = page.getByRole("tab", { name: "경기 분석글" })
      await analysisTab.click()
      await expect(analysisTab).toHaveAttribute("aria-selected", "true")
      await expect(page.getByRole("tab", { name: "게시물" })).toHaveAttribute(
        "aria-selected",
        "false"
      )
    })
  })

  test.describe("정렬 기능", () => {
    test("온도순 버튼이 표시되어야 한다", async ({ page }) => {
      const hotButton = page.getByRole("button", { name: /온도순/ })
      await expect(hotButton).toBeVisible()
    })

    test("최신순 버튼이 표시되어야 한다", async ({ page }) => {
      const newButton = page.getByRole("button", { name: /최신순/ })
      await expect(newButton).toBeVisible()
    })

    test("랜덤 버튼이 표시되어야 한다", async ({ page }) => {
      const randomButton = page.getByRole("button", { name: /랜덤/ })
      await expect(randomButton).toBeVisible()
    })

    test("정렬 버튼 클릭 시 활성 상태(aria-pressed)가 변경되어야 한다", async ({ page }) => {
      await dismissBannerIfPresent(page)
      const newButton = page.getByRole("button", { name: /최신순/ })
      await newButton.click()
      await expect(newButton).toHaveAttribute("aria-pressed", "true")
      await expect(page.getByRole("button", { name: /온도순/ })).toHaveAttribute(
        "aria-pressed",
        "false"
      )
    })

    test("정렬 변경 시 sort=new API 호출이 발생해야 한다", async ({ page }) => {
      await dismissBannerIfPresent(page)
      await waitForFeed(page)
      const requestPromise = page.waitForRequest(
        (request) => request.url().includes("/api/posts") && request.url().includes("sort=new"),
        { timeout: 15000 }
      )
      await page.getByRole("button", { name: /최신순/ }).click()
      const request = await requestPromise
      expect(request.url()).toContain("sort=new")
    })
  })

  test.describe("게시글 카드", () => {
    test("게시글 카드 목록이 표시되어야 한다", async ({ page }) => {
      await waitForFeed(page)
      const count = await page.locator("article").count()
      expect(count).toBeGreaterThan(0)
    })

    test("게시글 카드에 제목(h2)과 게시판 링크가 있어야 한다", async ({ page }) => {
      await waitForFeed(page)
      const firstCard = page
        .locator("article")
        .filter({ has: page.locator('a[href^="/post/"]') })
        .first()
      await expect(firstCard.getByRole("heading", { level: 2 })).toBeVisible()
      await expect(firstCard.locator('a[href^="/community/"]').first()).toBeVisible()
    })

    test("게시글 카드 제목 클릭 시 상세 페이지로 이동해야 한다", async ({ page }) => {
      await dismissBannerIfPresent(page)
      await waitForFeed(page)
      // 클릭 표면은 제목 Link(a.group.block)만 — 카드 본문은 비클릭 영역
      const titleLink = page.locator('article a.group.block[href^="/post/"]').first()
      await titleLink.click()
      await expect(page).toHaveURL(/\/post\/[a-zA-Z0-9-]+/, { timeout: 15000 })
    })
  })

  test.describe("사이드바", () => {
    test("데스크톱에서 왼쪽 사이드바(게시판)가 표시되어야 한다", async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 })
      const leftSidebar = page.locator("aside").first()
      await expect(leftSidebar).toBeVisible()
      await expect(leftSidebar.getByRole("heading", { name: /게시판/ })).toBeVisible()
    })

    test("데스크톱에서 양쪽 사이드바가 있어야 한다", async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 })
      const sidebars = page.locator("aside")
      await expect(sidebars.first()).toBeVisible()
      expect(await sidebars.count()).toBeGreaterThanOrEqual(2)
    })

    test("모바일에서 사이드바가 숨겨져야 한다", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      const sidebars = page.locator("aside")
      const count = await sidebars.count()
      for (let i = 0; i < count; i++) {
        await expect(sidebars.nth(i)).toBeHidden()
      }
    })
  })

  test.describe("접근성", () => {
    test("홈 탭이 키보드로 포커스 가능해야 한다", async ({ page }) => {
      const postsTab = page.getByRole("tab", { name: "게시물" })
      await postsTab.focus()
      await expect(postsTab).toBeFocused()
      await page.keyboard.press("Tab")
      await expect(postsTab).not.toBeFocused()
    })

    test("버튼에 적절한 aria 레이블이 있어야 한다", async ({ page }) => {
      const buttons = page.locator("button")
      const buttonCount = await buttons.count()
      for (let i = 0; i < Math.min(buttonCount, 5); i++) {
        const button = buttons.nth(i)
        const text = await button.innerText().catch(() => "")
        const ariaLabel = await button.getAttribute("aria-label")
        const ariaLabelledBy = await button.getAttribute("aria-labelledby")
        const hasAccessibleName = text.trim().length > 0 || ariaLabel || ariaLabelledBy
        expect(hasAccessibleName).toBeTruthy()
      }
    })
  })

  test.describe("성능 (스모크)", () => {
    // 병렬 워커 부하 하의 로컬 측정 — 극단적 회귀만 감지하는 스모크 한도.
    // 정밀 측정은 audit harness 가 담당: `pnpm audit:cwv` (gongnori.fan 기준 LCP/FCP/CLS/TTFB)
    test("페이지 로드가 10초 이내에 완료되어야 한다", async ({ page }) => {
      const startTime = Date.now()
      await page.goto("/")
      await page.waitForLoadState("domcontentloaded")
      const loadTime = Date.now() - startTime
      expect(loadTime).toBeLessThan(10000)
    })

    test("헤더가 8초 이내에 표시되어야 한다", async ({ page }) => {
      const startTime = Date.now()
      await page.goto("/")
      await page.locator("header").waitFor({ timeout: 8000 })
      const renderTime = Date.now() - startTime
      expect(renderTime).toBeLessThan(8000)
    })
  })

  test.describe("에러 처리", () => {
    test("네트워크 오류 시 빈 상태 또는 에러 메시지가 표시되어야 한다", async ({ page }) => {
      await page.route("**/api/posts**", (route) => route.abort())
      await page.goto("/")
      const emptyOrError = page.getByText(/게시물이 없습니다|오류|에러|실패|불러오지 못/)
      await expect(emptyOrError.first()).toBeVisible({ timeout: 10000 })
    })
  })
})
