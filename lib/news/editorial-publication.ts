import { extractTextFromTipTapJSON } from "@/lib/tiptap/extract-text"
import type { TipTapNode } from "@/types/post"
import type { EditorialRule } from "@/lib/news/training/types"
import {
  NEWS_WRITER_POLICY_VERSION,
  findEditorialStyleViolations,
} from "@/scripts/vps-news-scanner/writer-policy.mjs"

export interface EditorialPublicationHold {
  reasonCode: "editorial_style_violation" | "editorial_rules_stale" | "editorial_rules_unavailable"
  reasons: string[]
  retryable: boolean
}

/** Automatic publication must check the saved copy as well as its writing guidance. */
export function editorialPublicationHold(
  content: unknown,
  guidance: unknown,
  rules: EditorialRule[]
): EditorialPublicationHold | null {
  const active = rules.filter((rule) => rule.active)
  if (!active.length) return null
  const violations = findEditorialStyleViolations(
    extractTextFromTipTapJSON(content as TipTapNode),
    active
  )
  if (violations.length) {
    return {
      reasonCode: "editorial_style_violation",
      reasons: violations.map((violation) => `${violation.instruction} (${violation.excerpt})`),
      retryable: false,
    }
  }
  const trace =
    guidance && typeof guidance === "object"
      ? (guidance as { policy_version?: unknown; loaded_at?: unknown; applied_rule_ids?: unknown })
      : null
  const loadedAt = typeof trace?.loaded_at === "string" ? Date.parse(trace.loaded_at) : NaN
  const ids = new Set(Array.isArray(trace?.applied_rule_ids) ? trace.applied_rule_ids : [])
  if (
    trace?.policy_version !== NEWS_WRITER_POLICY_VERSION ||
    !Number.isFinite(loadedAt) ||
    active.some((rule) => !ids.has(rule.id) || !(loadedAt >= Date.parse(rule.updated_at)))
  ) {
    return {
      reasonCode: "editorial_rules_stale",
      reasons: [
        "현재 편집 규칙으로 작성한 기록이 없어 재작성 또는 데스킹 후 수동 발행이 필요합니다.",
      ],
      retryable: false,
    }
  }
  return null
}
