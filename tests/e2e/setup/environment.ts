import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { parse } from "dotenv"

export const E2E_BASE_URL = "http://localhost:3100"
export const E2E_DB_CONTAINER = "supabase_db_community"
export const E2E_ENV_FILE = resolve(process.cwd(), "tests/e2e/.env.e2e")

const REQUIRED_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
] as const

export type E2EEnvironment = Readonly<Record<(typeof REQUIRED_KEYS)[number], string>>

export function isLoopbackHost(hostname: string): boolean {
  return ["localhost", "127.0.0.1", "[::1]"].includes(hostname)
}

/** Validate values from the dedicated file, never a merge with application secrets. */
export function validateE2EEnvironment(values: Record<string, string | undefined>): E2EEnvironment {
  const env = {} as Record<(typeof REQUIRED_KEYS)[number], string>
  for (const key of REQUIRED_KEYS) {
    const value = values[key]?.trim()
    if (!value) throw new Error(`E2E 환경 오류: .env.e2e에 ${key}가 필요합니다.`)
    env[key] = value
  }

  let url: URL
  try {
    url = new URL(env.NEXT_PUBLIC_SUPABASE_URL)
  } catch {
    throw new Error("E2E 환경 오류: Supabase URL이 올바르지 않습니다.")
  }
  // Match this repository's local Supabase API port, not a remote proxy/path.
  if (
    url.protocol !== "http:" ||
    !isLoopbackHost(url.hostname) ||
    url.port !== "54321" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("E2E 환경 오류: Supabase는 로컬 HTTP 주소의 54321 포트만 허용합니다.")
  }
  env.NEXT_PUBLIC_SUPABASE_URL = url.origin

  if (!/^pk_test_[A-Za-z0-9_=-]+$/.test(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)) {
    throw new Error("E2E 환경 오류: Clerk publishable key는 pk_test_ 개발키여야 합니다.")
  }
  if (!/^sk_test_[A-Za-z0-9_-]+$/.test(env.CLERK_SECRET_KEY)) {
    throw new Error("E2E 환경 오류: Clerk secret key는 sk_test_ 개발키여야 합니다.")
  }
  return Object.freeze(env)
}

/** No import-time IO or process.env mutation. Missing keys never fall back to .env/.env.local. */
export function loadE2EEnvironment(envFile = E2E_ENV_FILE): E2EEnvironment {
  let contents: string
  try {
    contents = readFileSync(envFile, "utf8")
  } catch {
    throw new Error("E2E 환경 오류: tests/e2e/.env.e2e를 읽을 수 없습니다. 예제 파일을 확인하세요.")
  }
  return validateE2EEnvironment(parse(contents))
}
