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
        errorMessage = `HTTP ${res.status}`
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
