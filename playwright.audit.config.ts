import { defineConfig, devices } from "@playwright/test"

/**
 * Full App Audit 전용 Playwright 설정.
 * 기존 e2e config 와 분리 — testDir, timeout, retries, projects 모두 다름.
 *
 * 실행:
 *   BASE_URL=https://gongnori.fan pnpm exec playwright test \
 *     --config=playwright.audit.config.ts --headed
 */
export default defineConfig({
  testDir: "./tests/audit",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  // 메인 audit 테스트는 자체적으로 60분 setTimeout — 여긴 안전 상한
  timeout: 90 * 60 * 1000,
  expect: { timeout: 15000 },

  use: {
    baseURL: process.env.BASE_URL || "https://gongnori.fan",
    trace: "off", // spec 내부에서 직접 trace 시작 (RUN_DIR/trace.zip)
    screenshot: "off", // spec 내부에서 직접 screenshot
    video: "off",
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    ignoreHTTPSErrors: true,
  },

  // production audit 이라 webServer 절대 안 띄움
  webServer: undefined,

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
})
