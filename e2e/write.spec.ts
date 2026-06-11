import { test, expect } from "@playwright/test"

// 2026-06-11 현행화: /write 는 로그인 게이트 뒤에 있음 — 비로그인 시 Clerk SignIn 분기
// (app/write/page.tsx). E2E 는 Clerk 프로덕션 키로 로그인할 수 없으므로(localhost 거부)
// 비로그인 동작만 검증하고, 폼 테스트는 auth fixture 도입 시 활성화하도록 skip 보존.

test.describe("글쓰기 페이지 (비로그인)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/write")
  })

  test("글쓰기 페이지가 정상 로드되어야 한다", async ({ page }) => {
    await expect(page).toHaveURL("/write")
    await expect(page).toHaveTitle(/글쓰기/)
  })

  test("헤더와 GNB가 표시되어야 한다", async ({ page }) => {
    await expect(page.locator("header")).toBeVisible()
    await expect(page.getByRole("navigation", { name: "주요 메뉴" })).toBeVisible()
  })

  test("비로그인 상태에서는 글쓰기 폼이 노출되지 않아야 한다 (로그인 게이트)", async ({ page }) => {
    // 로그인 게이트가 동작하면 작성하기 버튼/제목 입력이 없어야 함
    await expect(page.getByRole("button", { name: /작성하기/ })).toHaveCount(0)
    await expect(page.getByLabel(/제목/)).toHaveCount(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 아래 폼 테스트는 로그인 세션이 필요하다.
// Clerk 프로덕션 키는 gongnori.fan 외 도메인의 로그인을 거부하므로 localhost E2E 에서
// 세션을 만들 수 없음. Clerk testing token / auth fixture 도입 시 .skip 을 제거할 것.
// ─────────────────────────────────────────────────────────────────────────────
test.describe.skip("글쓰기 폼 (로그인 세션 필요 — auth fixture 도입 시 활성화)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/write")
  })

  test.describe("폼 요소", () => {
    test("게시판 선택 드롭다운이 표시되어야 한다", async ({ page }) => {
      const communitySelect = page.locator('[role="combobox"]').first()
      await expect(communitySelect).toBeVisible()
    })

    test("제목 입력 필드가 표시되어야 한다", async ({ page }) => {
      await expect(page.getByLabel(/제목/)).toBeVisible()
    })

    test("내용 입력 영역(TipTap)이 표시되어야 한다", async ({ page }) => {
      const editor = page.locator(
        '[class*="ProseMirror"], [class*="tiptap"], [contenteditable="true"]'
      )
      await expect(editor.first()).toBeVisible()
    })

    test("이미지 업로드 영역이 표시되어야 한다", async ({ page }) => {
      const uploadArea = page.locator('[class*="border-dashed"], input[type="file"]')
      await expect(uploadArea.first()).toBeVisible()
    })

    test("작성하기 버튼이 표시되어야 한다", async ({ page }) => {
      await expect(page.getByRole("button", { name: /작성하기/ })).toBeVisible()
    })
  })

  test.describe("게시판 선택", () => {
    test("게시판 선택 드롭다운을 열고 선택할 수 있어야 한다", async ({ page }) => {
      const communitySelect = page.locator('[role="combobox"]').first()
      await communitySelect.click()
      const option = page.getByRole("option").first()
      await expect(option).toBeVisible()
      await option.click()
    })
  })

  test.describe("제목 입력", () => {
    test("제목을 입력할 수 있어야 한다", async ({ page }) => {
      const titleInput = page.getByLabel(/제목/)
      await titleInput.fill("테스트 제목입니다")
      await expect(titleInput).toHaveValue("테스트 제목입니다")
    })
  })

  test.describe("내용 입력 (TipTap 에디터)", () => {
    test("에디터에 텍스트를 입력할 수 있어야 한다", async ({ page }) => {
      const editor = page.locator('[class*="ProseMirror"], [contenteditable="true"]').first()
      await editor.click()
      await page.keyboard.type("테스트 내용입니다")
      const editorText = await editor.textContent()
      expect(editorText).toContain("테스트 내용")
    })
  })

  test.describe("폼 유효성 검사", () => {
    test("필수 필드가 비어있으면 작성하기 버튼이 비활성화되어야 한다", async ({ page }) => {
      await expect(page.getByRole("button", { name: /작성하기/ })).toBeDisabled()
    })

    test("모든 필수 필드를 입력하면 버튼이 활성화되어야 한다", async ({ page }) => {
      const communitySelect = page.locator('[role="combobox"]').first()
      await communitySelect.click()
      await page.getByRole("option").first().click()

      await page.getByLabel(/제목/).fill("테스트 제목")

      const editor = page.locator('[class*="ProseMirror"], [contenteditable="true"]').first()
      await editor.click()
      await page.keyboard.type("테스트 내용입니다")

      await expect(page.getByRole("button", { name: /작성하기/ })).toBeEnabled()
    })
  })

  test.describe("접근성", () => {
    test("폼 필드에 적절한 레이블이 있어야 한다", async ({ page }) => {
      await expect(page.getByText(/제목/).first()).toBeVisible()
      await expect(page.getByText(/내용/).first()).toBeVisible()
    })
  })

  test.describe("반응형 레이아웃", () => {
    test("모바일에서 폼이 정상 표시되어야 한다", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      await page.goto("/write")
      await expect(page.getByLabel(/제목/)).toBeVisible()
    })
  })
})
