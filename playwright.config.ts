import { defineConfig, devices } from "@playwright/test"

/**
 * Playwright E2E 테스트 설정
 * 커뮤니티/승부예측 플랫폼 전용
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { open: "never" }], ["list"]],

  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",

    // 한국어 로케일 설정
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  },

  /* 테스트 전 서버 실행 (BASE_URL 설정 시 스킵) */
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "pnpm dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
      },

  /* 브라우저별 테스트 프로젝트 */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },

    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },

    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },

    /* 모바일 뷰포트 테스트 */
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 5"] },
    },

    {
      name: "Mobile Safari",
      use: { ...devices["iPhone 12"] },
    },

    /* 태블릿 뷰포트 테스트 */
    {
      name: "Tablet",
      use: {
        viewport: { width: 768, height: 1024 },
        userAgent: "Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15",
      },
    },
  ],

  /* 테스트 타임아웃 설정 */
  timeout: 30000,
  expect: {
    timeout: 10000,
  },
})
