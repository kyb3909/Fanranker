import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"

/**
 * Cron route 실행 계측 래퍼.
 *
 * Vercel cron 으로 호출되는 route handler 를 감싸 실행 결과를 cron_run_log 에 1건 기록한다.
 * - 정상/에러/소요시간/HTTP status 를 남겨 어드민 시스템 모니터가 job 별 상태를 표시.
 * - CRON_SECRET 인증을 통과한 호출만 기록한다. wisetoto sync 처럼 cron 과 브라우저
 *   폴링을 함께 받는 route 에서 폴링 호출이 로그를 오염시키지 않도록 하기 위함.
 * - 로그 기록 실패가 cron 본 동작을 깨면 안 되므로 insert 는 best-effort.
 *
 * 적용: `export const GET = withCronLog("job-name", handler)`
 */

/**
 * 4xx/5xx 응답의 본문 앞부분 — "HTTP 500" 만 남기면 무엇이 죽었는지 아무도 모른다
 * (2026-09-06 motm-sync 500 ×3: 테이블 부재였는데 원인이 로그 어디에도 없었다).
 * 503 을 내는 크론은 본문에 경기별 오류 목록을 싣는다 — 그 앞 300자면 원인이 보인다.
 * 본문을 못 읽으면 종전처럼 상태 코드만 남긴다.
 */
async function bodyExcerpt(res: Response): Promise<string> {
  try {
    const text = (await res.clone().text()).replace(/\s+/g, " ").trim()
    return text ? `: ${text.slice(0, 300)}` : ""
  } catch {
    return ""
  }
}

export function withCronLog<T extends Request>(
  jobName: string,
  handler: (req: T) => Promise<Response>
): (req: T) => Promise<Response> {
  return async (req: T) => {
    const isCronCall = verifyCronSecret(req) === null
    const start = Date.now()
    let httpStatus = 0
    let status: "success" | "error" = "success"
    let errorMessage: string | null = null

    try {
      const res = await handler(req)
      httpStatus = res.status
      if (res.status >= 400) {
        status = "error"
        errorMessage = `HTTP ${res.status}${await bodyExcerpt(res)}`
      }
      return res
    } catch (e) {
      status = "error"
      errorMessage = e instanceof Error ? e.message : String(e)
      throw e
    } finally {
      if (isCronCall) {
        try {
          const supabase = createServiceRoleClient()
          await supabase.from("cron_run_log").insert({
            job_name: jobName,
            status,
            http_status: httpStatus || null,
            error_message: errorMessage,
            duration_ms: Date.now() - start,
          })
        } catch {
          // 로그 기록 실패는 무시 — cron 본 동작 보호
        }
      }
    }
  }
}
