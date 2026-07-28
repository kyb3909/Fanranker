import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["__tests__/**/*.test.{ts,tsx}"],
    globals: true,
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts", "hooks/**/*.ts"],
      exclude: [
        "lib/supabase/**",
        "lib/ga4/**",
        "lib/admin/**",
        "lib/analytics/**",
        "lib/api/**",
        "hooks/use-toast.ts",
      ],
      thresholds: {
        statements: 25,
        branches: 22,
        functions: 22,
        lines: 25,
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
