/**
 * Bot authentication helper.
 *
 * Logs a bot in by minting a Clerk sign-in token (server side) and consuming it
 * in the browser via `signIn.create({ strategy: "ticket" })`. This bypasses the
 * production sign-up CAPTCHA and the new-device email-code 2FA that block any
 * automated browser from completing the normal password flow.
 *
 * The bot is still a real id+password account — only the test's login mechanism
 * differs from a human typing into the form.
 */
import type { Page } from "@playwright/test"
import { mintSignInToken } from "../setup/bot-factory"
import type { Bot } from "../setup/bot-factory"

interface TicketResult {
  status: string
  userId: string | null
  error?: string
}

/**
 * Establish an authenticated Clerk session for `bot` on `page`.
 * After this resolves the session cookie is set; subsequent navigations are
 * authenticated server-side. Does NOT complete onboarding — a freshly created
 * bot has no profile and protected routes will redirect to /onboarding.
 */
export async function loginAs(page: Page, bot: Bot): Promise<void> {
  const ticket = await mintSignInToken(bot.clerkUserId)

  await page.goto("/")
  await page.waitForFunction(() => typeof (window as { Clerk?: unknown }).Clerk !== "undefined", {
    timeout: 20_000,
  })

  const result: TicketResult = await page.evaluate(async (ticketArg) => {
    const Clerk = (window as unknown as { Clerk: any }).Clerk
    try {
      if (!Clerk.loaded) await Clerk.load()
      const signIn = await Clerk.client.signIn.create({ strategy: "ticket", ticket: ticketArg })
      await Clerk.setActive({ session: signIn.createdSessionId })
      return { status: signIn.status, userId: Clerk.user?.id ?? null }
    } catch (e) {
      return { status: "error", userId: null, error: String(e) }
    }
  }, ticket)

  if (result.status !== "complete" || result.userId !== bot.clerkUserId) {
    throw new Error(
      `봇 로그인 실패 (${bot.email}): status=${result.status} userId=${result.userId}` +
        (result.error ? ` — ${result.error}` : "")
    )
  }
}

/** Sign the current session out. */
export async function logout(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const Clerk = (window as unknown as { Clerk?: any }).Clerk
    if (Clerk?.signOut) await Clerk.signOut()
  })
  // signOut() 반환 후에도 Clerk 의 클라이언트 user 상태가 비워지기까지
  // 짧은 지연이 있어, 실제로 null 이 될 때까지 기다린다.
  await page.waitForFunction(
    () => !(window as unknown as { Clerk?: { user?: unknown } }).Clerk?.user,
    null,
    { timeout: 10_000 }
  )
}
