/**
 * Bot factory — creates and deletes E2E test users via the Clerk Backend API.
 *
 * Why the Backend API and not UI signup: the production sign-up form is gated by
 * Clerk Smart CAPTCHA (Cloudflare Turnstile), which blocks automated browsers.
 * The Backend API runs in a trusted server context and is not subject to it.
 * Bots created here log in through the normal UI (sign-in has no CAPTCHA).
 *
 * CLI:
 *   pnpm exec tsx tests/e2e/setup/bot-factory.ts create [count]   (default 10)
 *   pnpm exec tsx tests/e2e/setup/bot-factory.ts cleanup
 *   pnpm exec tsx tests/e2e/setup/bot-factory.ts list
 */
import { config as loadEnv } from "dotenv"
import { randomBytes } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

loadEnv()
loadEnv({ path: ".env.local", override: true })
// .env.e2e wins: the bot factory always targets the Clerk development instance
// (bots live there, not in the production instance).
loadEnv({ path: join(process.cwd(), "tests/e2e/.env.e2e"), override: true })

const CLERK_API = "https://api.clerk.com/v1"
const FIXTURES_PATH = join(process.cwd(), "tests", "e2e", "fixtures", "bots.json")

export interface Bot {
  index: number
  email: string
  password: string
  clerkUserId: string
}

function secretKey(): string {
  const key = process.env.CLERK_SECRET_KEY
  if (!key) throw new Error("CLERK_SECRET_KEY 가 .env 에 없습니다.")
  return key
}

async function clerkFetch(
  path: string,
  init: RequestInit = {}
): Promise<{ ok: boolean; status: number; body: any }> {
  const res = await fetch(`${CLERK_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  })
  const text = await res.text()
  return { ok: res.ok, status: res.status, body: text ? JSON.parse(text) : null }
}

const pad = (n: number) => String(n).padStart(2, "0")
const botEmail = (index: number) => `kyb3909+e2ebot${pad(index)}@gmail.com`

// Strong, unique password. E2e7- prefix guarantees upper/lower/digit classes.
const genPassword = () => `E2e7-${randomBytes(12).toString("base64url")}`

/** Create or refresh a single bot. Idempotent: an existing email is reused and
 *  its password is reset so bots.json is always the source of truth. */
async function createBot(index: number): Promise<Bot> {
  const email = botEmail(index)
  const password = genPassword()

  const existing = await clerkFetch(`/users?email_address=${encodeURIComponent(email)}`, {
    method: "GET",
  })
  if (existing.ok && Array.isArray(existing.body) && existing.body.length > 0) {
    const userId = existing.body[0].id as string
    const patched = await clerkFetch(`/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ password, skip_password_checks: true }),
    })
    if (!patched.ok) {
      throw new Error(
        `Clerk PATCH 실패 (${email}): ${patched.status} ${JSON.stringify(patched.body)}`
      )
    }
    return { index, email, password, clerkUserId: userId }
  }

  const created = await clerkFetch(`/users`, {
    method: "POST",
    body: JSON.stringify({
      email_address: [email],
      username: `e2ebot${pad(index)}`,
      password,
      skip_password_checks: true,
    }),
  })
  if (!created.ok) {
    throw new Error(
      `Clerk createUser 실패 (${email}): ${created.status} ${JSON.stringify(created.body)}`
    )
  }
  return { index, email, password, clerkUserId: created.body.id }
}

export async function createBots(count = 10): Promise<Bot[]> {
  const bots: Bot[] = []
  for (let i = 1; i <= count; i++) {
    const bot = await createBot(i)
    bots.push(bot)
    console.log(`  ✓ bot${pad(i)} → ${bot.clerkUserId}`)
  }
  mkdirSync(dirname(FIXTURES_PATH), { recursive: true })
  writeFileSync(FIXTURES_PATH, JSON.stringify(bots, null, 2) + "\n")
  console.log(`\n${bots.length}개 봇 저장: ${FIXTURES_PATH}`)
  return bots
}

/**
 * Mint a one-time Clerk sign-in token for a bot.
 *
 * Why: a fresh browser is an untrusted device, so Clerk demands email-code 2FA
 * on password sign-in — which a bot cannot satisfy. A sign-in token is consumed
 * by the frontend via `signIn.create({ strategy: "ticket" })` and bypasses
 * CAPTCHA, email verification, and 2FA. See helpers/auth.ts.
 */
export async function mintSignInToken(clerkUserId: string): Promise<string> {
  const res = await clerkFetch(`/sign_in_tokens`, {
    method: "POST",
    body: JSON.stringify({ user_id: clerkUserId }),
  })
  if (!res.ok) {
    throw new Error(
      `sign-in token 발급 실패 (${clerkUserId}): ${res.status} ${JSON.stringify(res.body)}`
    )
  }
  return res.body.token as string
}

export function loadBots(): Bot[] {
  if (!existsSync(FIXTURES_PATH)) {
    throw new Error(`bots.json 없음 (${FIXTURES_PATH}). 먼저 'create' 를 실행하세요.`)
  }
  return JSON.parse(readFileSync(FIXTURES_PATH, "utf8"))
}

export async function cleanupBots(): Promise<void> {
  if (!existsSync(FIXTURES_PATH)) {
    console.log("bots.json 없음 — 정리할 봇이 없습니다.")
    return
  }
  const bots = loadBots()
  for (const bot of bots) {
    const res = await clerkFetch(`/users/${bot.clerkUserId}`, { method: "DELETE" })
    console.log(`  ${res.ok ? "✓ 삭제" : `✗ 실패(${res.status})`} bot${pad(bot.index)}`)
  }
  writeFileSync(FIXTURES_PATH, "[]\n")
}
