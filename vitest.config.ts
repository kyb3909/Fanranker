import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["__tests__/**/*.test.{ts,tsx}"],
    globals: true,
    // 기본 5초는 라우트 통합 테스트에 부족하다 — 그 테스트들은 beforeEach 의
    // resetModules 뒤 `await import("@/app/api/…/route")` 로 매번 의존성 그래프를
    // 새로 로드하는데, 커버리지 계측이 붙으면 콜드 로드가 5초를 넘겨 플레이키하게
    // 실패한다(실제 CI 실패 사례). 느린 테스트를 숨기려는 게 아니라 콜드 import
    // 비용을 감안한 값 — 대다수 테스트는 여전히 ms 단위로 끝난다.
    testTimeout: 15_000,
    coverage: {
      provider: "v8",
      // app/**(API 라우트)·middleware.ts 를 계측에 포함 — 돈 라우트 5종이 전부
      // app/ 에 있는데 기존 include 밖이라 갭이 숫자로 안 보였다 (test-gaps.md P7).
      include: ["lib/**/*.ts", "hooks/**/*.ts", "app/api/**/*.ts", "middleware.ts"],
      exclude: [
        "lib/supabase/**",
        "lib/ga4/**",
        // lib/admin/** 제거 — requireAdminApi 는 39개 admin 라우트의 단일 관문인데
        // 명시적 exclude 로 갭이 숨겨져 있었다. lib/api/** 는 존재하지 않는 스테일 항목이라 삭제.
        "lib/analytics/**",
        "hooks/use-toast.ts",
      ],
      // 실측치(2026-07-29: stmts 12.81 / branch 12.74 / funcs 14.88 / lines 12.51)
      // 바로 아래로 시작하는 래칫(ratchet) — 초록에서 시작해 떨어지면 빨개지게
      // 만드는 게 목적. 테스트가 늘 때마다 올리기만 하고, 절대 내리지 않는다.
      thresholds: {
        statements: 12.5,
        branches: 12.5,
        functions: 14.5,
        lines: 12,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // server-only 는 클라이언트 조건에서 throw 하도록 만들어진 패키지다.
      // vitest 는 node 환경이라 서버 모듈(lib/supabase/server.ts)을 import 하면 터진다.
      // 테스트에서만 no-op 스텁으로 대체한다 (프로덕션 번들 무관).
      "server-only": path.resolve(__dirname, "__tests__/_stubs/server-only.ts"),
    },
  },
})
