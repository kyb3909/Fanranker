import { execFileSync } from "node:child_process"
import { E2E_DB_CONTAINER, isLoopbackHost, loadE2EEnvironment } from "./environment"

function localDocker() {
  // DOCKER_CONTEXT takes precedence over DOCKER_HOST in Docker. Inspecting a
  // context reads local configuration; it does not connect to that daemon.
  const context = process.env.DOCKER_CONTEXT
  let endpoint = context ? undefined : process.env.DOCKER_HOST
  if (!endpoint) {
    try {
      endpoint = execFileSync(
        "docker",
        [
          "context",
          "inspect",
          ...(context ? [context] : []),
          "--format",
          "{{.Endpoints.docker.Host}}",
        ],
        { encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] }
      ).trim()
    } catch {
      throw new Error("E2E 사전 점검 실패: Docker와 로컬 컨텍스트를 확인하세요.")
    }
  }

  const localSocket = endpoint.startsWith("unix:///") || endpoint.startsWith("npipe:////./pipe/")
  let localTcp = false
  try {
    const url = new URL(endpoint)
    localTcp =
      ["tcp:", "http:", "https:"].includes(url.protocol) &&
      isLoopbackHost(url.hostname) &&
      !url.username &&
      !url.password
  } catch {
    /* socket endpoints are validated above */
  }
  if (!localSocket && !localTcp) {
    throw new Error("E2E 사전 점검 실패: 원격 Docker 컨텍스트는 허용하지 않습니다.")
  }

  // Pin the checked daemon for both the probe and later SQL, even if the
  // active context differs. Never let ambient Docker settings redirect SQL.
  const env = { ...process.env }
  delete env.DOCKER_CONTEXT
  delete env.DOCKER_HOST
  return { endpoint, env }
}

/** All seed SQL uses the same verified local daemon as the read-only probe. */
export function runLocalE2ESql(sql: string): string {
  loadE2EEnvironment()
  const { endpoint, env } = localDocker()
  try {
    return execFileSync(
      "docker",
      [
        "--host",
        endpoint,
        "exec",
        E2E_DB_CONTAINER,
        "psql",
        "-X",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-Atc",
        sql,
      ],
      { env, encoding: "utf8", timeout: 15_000, stdio: ["ignore", "pipe", "pipe"] }
    )
  } catch {
    throw new Error("E2E DB 작업 실패: 로컬 supabase_db_community의 연결과 스키마를 확인하세요.")
  }
}

/** Only reads: finish before creating/resetting Clerk accounts or seeding data. */
export async function assertE2EPrerequisites(): Promise<void> {
  const env = loadE2EEnvironment()
  runLocalE2ESql(
    "BEGIN READ ONLY; SELECT user_id, role, onboarding_completed FROM public.profiles LIMIT 0; ROLLBACK;"
  )
  try {
    const response = await fetch(
      `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?select=user_id&limit=0`,
      {
        headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY },
        redirect: "error",
        signal: AbortSignal.timeout(5_000),
      }
    )
    if (!response.ok || !Array.isArray(await response.json())) throw new Error("REST unavailable")
  } catch {
    throw new Error("E2E 사전 점검 실패: 로컬 Supabase API·서비스키·profiles 스키마를 확인하세요.")
  }
}
