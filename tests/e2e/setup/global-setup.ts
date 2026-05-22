/**
 * Playwright globalSetup — runs once before the E2E suite.
 * Creates the bot accounts (Clerk Backend API) and writes fixtures/bots.json.
 */
import { createBots } from "./bot-factory"
import { seedDatabase } from "./seed"

export default async function globalSetup() {
  const count = Number(process.env.E2E_BOT_COUNT ?? "10")
  console.log(`\n[global-setup] 봇 ${count}개 생성 중...`)
  const bots = await createBots(count)
  await seedDatabase(bots)
}
