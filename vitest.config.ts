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
    },
  },
})
