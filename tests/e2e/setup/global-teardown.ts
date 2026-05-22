/**
 * Playwright globalTeardown — runs once after the E2E suite.
 * Deletes the bot accounts from Clerk. Set E2E_KEEP_BOTS=1 to keep them between
 * runs while iterating (createBots is idempotent, so re-running is cheap).
 */
import { cleanupBots } from "./bot-factory"

export default async function globalTeardown() {
  if (process.env.E2E_KEEP_BOTS === "1") {
    console.log("\n[global-teardown] E2E_KEEP_BOTS=1 — 봇 유지")
    return
  }
  console.log("\n[global-teardown] 봇 정리 중...")
  await cleanupBots()
}
