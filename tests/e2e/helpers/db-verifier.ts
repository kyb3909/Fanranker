/**
 * Database verification helpers for E2E journeys.
 *
 * Every data-changing journey follows a 4-step check: UI action → UI assert →
 * DB assert → side-effect assert. These helpers cover the DB-assert step by
 * querying the local Supabase directly with the service role (RLS bypassed).
 *
 * UI actions write to the DB asynchronously, so each helper polls until the
 * expected state appears or a deadline passes — this avoids flaky failures
 * from checking the DB a few milliseconds too early.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

type Row = Record<string, unknown>
type Match = Record<string, string | number | boolean | null>

let cached: SupabaseClient | null = null

/** Service-role client for the local Supabase instance under test. */
export function dbClient(): SupabaseClient {
  if (cached) return cached
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      "E2E DB 클라이언트: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 없음. " +
        "tests/e2e/.env.e2e 가 로드됐는지 확인하세요."
    )
  }
  cached = createClient(url, key, { auth: { persistSession: false } })
  return cached
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Return all rows in `table` matching `match` (no polling). */
export async function getDBRecords(table: string, match: Match): Promise<Row[]> {
  const { data, error } = await dbClient().from(table).select("*").match(match)
  if (error) throw new Error(`getDBRecords(${table}) 실패: ${error.message}`)
  return (data ?? []) as Row[]
}

/**
 * Poll until at least one row in `table` matches `match`; return the first.
 * Throws with a descriptive message if the deadline passes.
 */
export async function expectDBRecord(
  table: string,
  match: Match,
  opts: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<Row> {
  // 10워커 동시 부하에서 API 라운드트립이 느려질 수 있어 넉넉히 폴링한다.
  const timeoutMs = opts.timeoutMs ?? 15_000
  const intervalMs = opts.intervalMs ?? 250
  const deadline = Date.now() + timeoutMs
  let lastError = ""

  while (Date.now() < deadline) {
    const { data, error } = await dbClient().from(table).select("*").match(match).limit(1)
    if (error) lastError = error.message
    else if (data && data.length > 0) return data[0] as Row
    await sleep(intervalMs)
  }
  throw new Error(
    `expectDBRecord 실패: ${table} ${JSON.stringify(match)} — ` +
      (lastError ? `쿼리 에러: ${lastError}` : "일치하는 레코드 없음")
  )
}

/**
 * Poll until no row in `table` matches `match` (for delete / soft-delete
 * verification). Throws if a matching row still exists at the deadline.
 */
export async function expectDBRecordGone(
  table: string,
  match: Match,
  opts: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 15_000
  const intervalMs = opts.intervalMs ?? 250
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const { data, error } = await dbClient().from(table).select("*").match(match).limit(1)
    if (!error && (!data || data.length === 0)) return
    await sleep(intervalMs)
  }
  throw new Error(
    `expectDBRecordGone 실패: ${table} ${JSON.stringify(match)} — 레코드가 아직 존재함`
  )
}
