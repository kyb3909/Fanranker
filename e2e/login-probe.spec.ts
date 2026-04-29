import { test, expect } from "@playwright/test"

test("로그인 버튼 클릭 → Clerk 모달 또는 sign-up 페이지", async ({ page }) => {
  await page.goto("/")
  await page.waitForLoadState("networkidle")

  // 로그인 트리거 — 보통 SignInMenu 또는 user 아이콘
  const userIcon = page
    .locator('svg[class*="lucide-user"], button[aria-label*="계정"], button[aria-label*="로그인"]')
    .first()
  console.log("user icon visible:", await userIcon.isVisible().catch(() => false))

  // 알림 클릭 시 sign-in 모달 (SignedOut 상태)
  const bell = page.locator('button[aria-label="알림"]').first()
  await bell.click()
  await page.waitForTimeout(2000)

  // Clerk 모달 dialog
  const modal = page.locator('[class*="cl-"], [data-clerk-element], div[role="dialog"]').first()
  const visible = await modal.isVisible().catch(() => false)
  console.log("Clerk modal opened:", visible)

  // 콘솔 에러 캡처
  const errors: string[] = []
  page.on("pageerror", (err) => errors.push(err.message))
  page.on("response", async (res) => {
    if (!res.ok() && res.url().includes("clerk")) {
      errors.push(`${res.status()} ${res.url()}`)
    }
  })
  await page.waitForTimeout(1500)
  console.log("Clerk errors:", errors.slice(0, 5))
})
