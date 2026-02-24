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
      exclude: ["lib/supabase/**", "hooks/use-toast.ts"],
      thresholds: {
        statements: 10,
        branches: 15,
        functions: 8,
        lines: 10,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
})
