/**
 * E2E journey-verification config — separate from playwright.config.ts (e2e/)
 * and playwright.audit.config.ts (tests/audit/).
 *
 * Isolation (the "safe direction"): the app under test runs on port 3100, not
 * 3000, so it never collides with a normal `pnpm dev`. webServer.env injects
 * the local Supabase URL/keys from tests/e2e/.env.e2e — real env vars override
 * .env.local in Next.js, so the user's .env.local is never touched. All bot
 * activity therefore writes to local Supabase only; production stays clean.
 */
import { defineConfig, devices } from "@playwright/test"
import { E2E_BASE_URL, loadE2EEnvironment } from "./tests/e2e/setup/environment"

// Validate the dedicated file before any build/start/setup. Never inherit a
// missing credential from .env or .env.local. Workers and Next receive the same keys.
const e2eEnv = loadE2EEnvironment()
Object.assign(process.env, e2eEnv)

const PORT = 3100
const BASE_URL = E2E_BASE_URL

export default defineConfig({
  testDir: "./tests/e2e/journeys",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // dev 서버(Turbopack)는 동시 요청 시 라우트 첫 컴파일이 느려 간헐 실패가 난다.
  // retry 1회 + 넉넉한 타임아웃으로 인프라 노이즈를 흡수한다 (실제 앱 결함은 그대로 드러남).
  retries: process.env.CI ? 0 : 1,
  workers: 10,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["json", { outputFile: "tests/e2e/reports/results.json" }]],
  globalSetup: "./tests/e2e/setup/global-setup.ts",
  globalTeardown: "./tests/e2e/setup/global-teardown.ts",

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    // 프로덕션 빌드로 구동 — next dev(Turbopack)는 10워커 동시 부하에서
    // 요청별 컴파일로 응답 불능이 된다. next build + next start 는 부하에 강함.
    command: `pnpm exec tsx tests/e2e/setup/preflight-cli.ts && pnpm build && pnpm start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 600_000, // 빌드(~수분) + 기동
    env: { ...process.env, ...e2eEnv, E2E_TEST_BUILD: "1" } as Record<string, string>,
  },
})
