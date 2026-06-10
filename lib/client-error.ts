import * as Sentry from "@sentry/nextjs"
import { toast } from "@/hooks/use-toast"

/**
 * 클라이언트 에러 표준 보고 헬퍼 (REFACTOR_PLAN Phase 3 — 유일한 신규 파일).
 *
 * 불변: "실패가 빈 상태로 위장되지 않는다" — 모든 클라이언트 catch 는
 * 이 헬퍼 호출 + 명시적 에러 상태 set 중 최소 1개를 포함한다.
 *
 * 동작: console.error(`[scope]`) + Sentry.captureException(tags.scope)
 * + opts.toast 가 있으면 destructive 토스트 노출.
 */
export function reportClientError(scope: string, error: unknown, opts?: { toast?: string }) {
  console.error(`[${scope}]`, error)
  Sentry.captureException(error, { tags: { scope } })
  if (opts?.toast) {
    toast({ variant: "destructive", title: opts.toast })
  }
}
