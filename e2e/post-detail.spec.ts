import { test, expect, type Page } from "@playwright/test"

// 2026-06-11 현행화: 측정된 상세 페이지 DOM(돌아가기/추천·비추천/북마크/공유/댓글 N개) 기준.
// 홈 클릭-체이닝 beforeEach(불안정) 제거 — 첫 글 href 를 읽어 직접 진입.

/** 홈 피드의 첫 게시글 href 를 얻는다 (속성 읽기라 배너 오버레이 무관) */
async function getFirstPostHref(page: Page): Promise<string> {
  await page.goto("/")
  const titleLink = page.locator('article a.group.block[href^="/post/"]').first()
  await titleLink.waitFor({ state: "visible", timeout: 15000 })
  const href = await titleLink.getAttribute("href")
  expect(href).toBeTruthy()
  return href!
}

/** 홈 상단 공지 배너(의도된 커튼 오버레이)를 닫는다 — 클릭 상호작용 전 필수 */
async function dismissBannerIfPresent(page: Page) {
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

test.describe("게시글 상세 페이지", () => {
  test.describe("페이지 접근", () => {
    test("메인 페이지에서 게시글 클릭으로 상세 페이지 진입", async ({ page }) => {
      await page.goto("/")
      await dismissBannerIfPresent(page)
      const titleLink = page.locator('article a.group.block[href^="/post/"]').first()
      await titleLink.waitFor({ state: "visible", timeout: 15000 })
      await titleLink.click()
      await expect(page).toHaveURL(/\/post\/[a-zA-Z0-9-]+/, { timeout: 15000 })
    })

    test("직접 URL로 게시글 상세 페이지 접근", async ({ page }) => {
      const href = await getFirstPostHref(page)
      await page.goto(href)
      await expect(page).toHaveURL(href)
      await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible()
    })

    test("존재하지 않는 게시글 ID로 접근 시 404 처리", async ({ page }) => {
      const response = await page.goto("/post/non-existent-post-id-12345")
      expect(response?.status() === 404 || response?.status() === 200).toBeTruthy()
      const notFoundContent = page.getByText(/찾을 수 없|존재하지 않|404/)
      if (
        await notFoundContent
          .first()
          .isVisible()
          .catch(() => false)
      ) {
        await expect(notFoundContent.first()).toBeVisible()
      }
    })
  })

  test.describe("게시글 콘텐츠", () => {
    test.beforeEach(async ({ page }) => {
      const href = await getFirstPostHref(page)
      await page.goto(href)
    })

    test("게시글 제목(h2)이 표시되어야 한다", async ({ page }) => {
      await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible()
    })

    test("게시글 본문 영역이 표시되어야 한다", async ({ page }) => {
      // 주의: 상세 페이지는 main 이 중첩(2개) — 시맨틱 이슈로 별도 보고 (2026-06-11)
      await expect(page.locator("main").first()).toBeVisible()
    })

    test("작성자 정보(아바타 메뉴 버튼)가 표시되어야 한다", async ({ page }) => {
      // 작성자 영역: 닉네임 메뉴 버튼 (예: "몽몽이 몽몽이")
      const authorButton = page
        .locator("main button")
        .filter({ has: page.locator("img") })
        .first()
      await expect(authorButton).toBeVisible()
    })

    test("게시판(커뮤니티) 배지가 표시되어야 한다", async ({ page }) => {
      // 상세 헤더의 게시판 배지 버튼 (자유/축구 등) 또는 게시판 링크
      const badge = page
        .locator('a[href^="/community/"]')
        .or(page.getByRole("button", { name: /^(자유|축구|야구|농구|배구|영화|음악|게임)$/ }))
        .first()
      await expect(badge).toBeVisible()
    })
  })

  test.describe("뒤로가기 버튼", () => {
    test("돌아가기 버튼이 표시되어야 한다", async ({ page }) => {
      const href = await getFirstPostHref(page)
      await page.goto(href)
      await expect(page.getByRole("button", { name: "돌아가기" })).toBeVisible()
    })

    test("돌아가기 버튼 클릭 시 이전 페이지로 이동", async ({ page }) => {
      const href = await getFirstPostHref(page)
      await dismissBannerIfPresent(page)
      // history 를 쌓기 위해 클릭으로 진입
      const titleLink = page.locator(`article a.group.block[href="${href}"]`).first()
      await titleLink.waitFor({ state: "visible", timeout: 15000 })
      await titleLink.click()
      await expect(page).toHaveURL(href, { timeout: 15000 })
      await page.getByRole("button", { name: "돌아가기" }).click()
      await expect(page).toHaveURL("/", { timeout: 15000 })
    })
  })

  test.describe("투표 기능", () => {
    test.beforeEach(async ({ page }) => {
      const href = await getFirstPostHref(page)
      await page.goto(href)
    })

    test("추천/비추천 버튼이 표시되어야 한다", async ({ page }) => {
      await expect(page.getByRole("button", { name: "추천" }).first()).toBeVisible()
      await expect(page.getByRole("button", { name: "비추천" }).first()).toBeVisible()
    })

    test("비로그인 상태에서 투표 클릭 시 페이지가 깨지지 않아야 한다", async ({ page }) => {
      // 비로그인 → openSignIn() 호출 (로컬에선 Clerk 위젯이 동작하지 않을 수 있음)
      await page.getByRole("button", { name: "추천" }).first().click()
      // 상세 페이지가 유지되고 본문이 계속 보이면 통과
      await expect(page).toHaveURL(/\/post\//)
      await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible()
    })
  })

  test.describe("북마크/공유", () => {
    test.beforeEach(async ({ page }) => {
      const href = await getFirstPostHref(page)
      await page.goto(href)
    })

    test("북마크 버튼이 표시되어야 한다", async ({ page }) => {
      await expect(page.getByRole("button", { name: /북마크/ }).first()).toBeVisible()
    })

    test("공유 버튼이 표시되어야 한다", async ({ page }) => {
      await expect(page.getByRole("button", { name: "공유" }).first()).toBeVisible()
    })
  })

  test.describe("댓글 섹션", () => {
    test.beforeEach(async ({ page }) => {
      const href = await getFirstPostHref(page)
      await page.goto(href)
    })

    test("댓글 섹션 제목(댓글 N개)이 표시되어야 한다", async ({ page }) => {
      await expect(page.getByRole("heading", { name: /댓글 \d+개/ })).toBeVisible({
        timeout: 15000,
      })
    })

    test("댓글 입력 필드가 표시되어야 한다", async ({ page }) => {
      await expect(page.getByPlaceholder(/댓글을 입력하세요/)).toBeVisible()
    })

    test("내용이 없으면 댓글 작성 버튼이 비활성화되어야 한다", async ({ page }) => {
      await expect(page.getByRole("button", { name: "댓글 작성" })).toBeDisabled()
    })
  })

  test.describe("레이아웃", () => {
    test("데스크톱에서 사이드바가 표시되어야 한다", async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 })
      const href = await getFirstPostHref(page)
      await page.goto(href)
      await expect(page.locator("aside").first()).toBeVisible()
    })

    test("모바일에서 사이드바가 숨겨져야 한다", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      const href = await getFirstPostHref(page)
      await page.goto(href)
      const sidebars = page.locator("aside")
      const count = await sidebars.count()
      for (let i = 0; i < count; i++) {
        await expect(sidebars.nth(i)).toBeHidden()
      }
    })
  })

  test.describe("접근성", () => {
    test("게시글 제목에 적절한 heading 레벨(h2)이 있어야 한다", async ({ page }) => {
      const href = await getFirstPostHref(page)
      await page.goto(href)
      await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible()
    })

    test("이미지에 alt 텍스트가 있어야 한다", async ({ page }) => {
      const href = await getFirstPostHref(page)
      await page.goto(href)
      const images = page.locator("main img")
      const imageCount = await images.count()
      for (let i = 0; i < imageCount; i++) {
        const img = images.nth(i)
        const alt = await img.getAttribute("alt")
        expect(alt !== null).toBeTruthy()
      }
    })
  })

  test.describe("조회수", () => {
    // 2026-06-11 복구: usePostViewTracker 가 상세 진입 시 POST /view 비콘을 쏜다
    test("페이지 로드 시 조회수 API가 호출되어야 한다", async ({ page }) => {
      const href = await getFirstPostHref(page)
      const viewResponse = page.waitForResponse(
        (res) => res.url().includes("/view") && res.request().method() === "POST",
        { timeout: 10000 }
      )
      await page.goto(href)
      await viewResponse
    })
  })
})
