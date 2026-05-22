/**
 * CLI wrapper for the bot factory. Run directly with tsx — never imported.
 *
 *   pnpm exec tsx tests/e2e/setup/bot-factory-cli.ts create [count]   (default 10)
 *   pnpm exec tsx tests/e2e/setup/bot-factory-cli.ts cleanup
 *   pnpm exec tsx tests/e2e/setup/bot-factory-cli.ts list
 *
 * Kept separate from bot-factory.ts so that module has no entry-point detection
 * and stays cleanly importable by Playwright globalSetup/teardown.
 */
import { createBots, cleanupBots, loadBots, mintSignInToken } from "./bot-factory"

async function main() {
  const [cmd, arg] = process.argv.slice(2)
  switch (cmd) {
    case "create":
      await createBots(arg ? Number(arg) : 10)
      break
    case "cleanup":
      await cleanupBots()
      break
    case "list":
      console.log(JSON.stringify(loadBots(), null, 2))
      break
    case "token": {
      // 수동 로그인용 sign-in token 발급. arg = 봇 인덱스(1-base), 기본 1.
      const bots = loadBots()
      const bot = bots[arg ? Number(arg) - 1 : 0]
      if (!bot) throw new Error("해당 봇 없음")
      console.log(await mintSignInToken(bot.clerkUserId))
      break
    }
    default:
      console.log("사용법: bot-factory-cli.ts <create [count] | cleanup | list | token [index]>")
      process.exit(1)
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
