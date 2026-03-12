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

export async function retryRefundTokens(
  supabase: SupabaseClient,
  userId: string,
  amount: number,
  description: string,
  maxRetries = 3
) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const { error } = await supabase.rpc("refund_tokens", {
      p_user_id: userId,
      p_amount: amount,
      p_description: description,
    })
    if (!error) return
    console.error(`refund_tokens attempt ${attempt}/${maxRetries} failed:`, error)
    if (attempt < maxRetries) await new Promise((r) => setTimeout(r, 500 * attempt))
  }
  // All retries failed - record in pending_refunds for admin resolution
  await supabase.from("pending_refunds").insert({
    user_id: userId,
    amount,
    description,
    source: "refund_retry_exhausted",
    attempts: maxRetries,
    last_error: "All retry attempts failed",
  })
  Sentry.captureMessage(
    `refund_tokens failed after ${maxRetries} retries - recorded in pending_refunds`,
    {
      level: "fatal",
      extra: { userId, amount, description },
    }
  )
}
