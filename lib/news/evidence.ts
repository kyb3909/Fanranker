import { z } from "zod"

/** The same captured evidence accompanies writing, storage and verification. */
export const BackgroundSourceSchema = z.object({
  id: z.string().max(180),
  url: z.string().url().max(2000),
  title: z.string().max(1000),
  published_at: z.string().datetime({ offset: true }),
  excerpt: z.string().min(80).max(5000),
})

export const NewsEvidenceSchema = z.object({
  version: z.literal(1),
  original_title: z.string().max(2000),
  source_url: z.string().url().max(2000),
  published_at: z.string().datetime({ offset: true }).nullable(),
  captured_at: z.string().datetime({ offset: true }),
  background: z.array(BackgroundSourceSchema).max(3),
  match_ids: z.array(z.string().uuid()).max(4),
})

export type NewsEvidence = z.infer<typeof NewsEvidenceSchema>
export type BackgroundSource = z.infer<typeof BackgroundSourceSchema>

export function readNewsEvidence(value: unknown): NewsEvidence | undefined {
  const parsed = NewsEvidenceSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

/** Only infrastructure-only legacy verdicts can be retried without an editor. */
export function isInfrastructureGate(gate: { pass?: boolean; reasons?: unknown } | null): boolean {
  return (
    gate?.pass === false &&
    Array.isArray(gate.reasons) &&
    gate.reasons.length > 0 &&
    gate.reasons.every(
      (r) => typeof r === "string" && /^검사관 (호출 실패|미가동|응답 불완전)/.test(r)
    )
  )
}

export const QUALITY_RETRY_LIMIT = 4
export function qualityRetryState(decision: Record<string, unknown> | null, now = Date.now()) {
  const retry = decision?.quality_retry as { attempts?: number; next_at?: string } | undefined
  const attempts = Number.isSafeInteger(retry?.attempts) ? Math.max(0, retry!.attempts!) : 0
  return {
    attempts,
    exhausted: attempts >= QUALITY_RETRY_LIMIT,
    waiting: Boolean(retry?.next_at && Date.parse(retry.next_at) > now),
    next: {
      attempts: attempts + 1,
      next_at: new Date(now + Math.min(120, 30 * 2 ** attempts) * 60_000).toISOString(),
    },
  }
}
