import * as Sentry from "@sentry/nextjs"

type SupabaseClient = {
  rpc: (
    fn: string,
    params: Record<string, unknown>
  ) => { error: unknown } | PromiseLike<{ error: unknown }>
  from: (table: string) => {
    insert: (data: Record<string, unknown>) => { error: unknown } | PromiseLike<{ error: unknown }>
  }
}

/**
 * 볼 환불 재시도 엔진 — 3회 재시도 → 실패 시 pending_refunds 큐 + Sentry fatal.
 *
 * 2026-08-08 감사 P2-3: 같은 패턴이 여기와 lib/betman/settle.ts(retryRefund)에
 * 복제돼 있던 것을 이 함수 하나로 통합. source 는 pending_refunds 의 유입 경로
 * 라벨(어드민 환불 큐 화면이 구분 표시), onSuccess 는 정산 쪽 audit row 적재용 훅.
 *
 * 반환: 성공 시 null, 최종 실패 시 에러 문자열 (기존 void 호출부는 무시해도 무해).
 */
export async function retryRefundTokens(
  supabase: SupabaseClient,
  userId: string,
  amount: number,
  description: string,
  maxRetries = 3,
  opts: { source?: string; onSuccess?: (attempt: number) => void } = {}
): Promise<string | null> {
  const source = opts.source ?? "refund_retry_exhausted"
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const { error } = await supabase.rpc("refund_tokens", {
      p_user_id: userId,
      p_amount: amount,
      p_description: description,
    })
    if (!error) {
      opts.onSuccess?.(attempt)
      return null
    }
    console.error(`refund_tokens attempt ${attempt}/${maxRetries} failed:`, error)
    if (attempt < maxRetries) await new Promise((r) => setTimeout(r, 500 * attempt))
  }
  // All retries failed - record in pending_refunds for admin resolution
  await supabase.from("pending_refunds").insert({
    user_id: userId,
    amount,
    description,
    source,
    attempts: maxRetries,
    last_error: "All retry attempts failed",
  })
  Sentry.captureMessage(
    `refund_tokens failed after ${maxRetries} retries - recorded in pending_refunds`,
    {
      level: "fatal",
      extra: { userId, amount, description, source },
    }
  )
  return `refund failed for user=${userId} amount=${amount}`
}
