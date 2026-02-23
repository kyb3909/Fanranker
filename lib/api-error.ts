import * as Sentry from "@sentry/nextjs"
import { NextResponse } from "next/server"

/**
 * API 라우트에서 일관된 에러 응답 생성 + Sentry 자동 보고
 *
 * @example
 * catch (error) {
 *   return apiError('게시글 작성에 실패했습니다.', 500, error)
 * }
 */
export function apiError(message: string, status: number, error?: unknown) {
  if (error) {
    Sentry.captureException(error, {
      extra: { apiMessage: message, status },
    })
  }
  return NextResponse.json({ error: message }, { status })
}

/**
 * 400 Bad Request 헬퍼
 */
export function apiBadRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

/**
 * 401 Unauthorized 헬퍼
 */
export function apiUnauthorized(message = "로그인이 필요합니다.") {
  return NextResponse.json({ error: message }, { status: 401 })
}
