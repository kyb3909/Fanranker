import { z } from "zod"
import { CategorySchema } from "@/lib/news/desk/types"

export const RuleSchema = z.object({
  id: z.string().uuid().optional(),
  version: z.number().int().min(0).default(0),
  title: z.string().trim().min(2).max(100),
  category: CategorySchema,
  instruction: z.string().trim().min(5).max(1000),
  priority: z.number().int().min(0).max(100),
  active: z.boolean(),
})
export type EditorialRule = z.infer<typeof RuleSchema> & { id: string; updated_at: string }
export const EvaluationReviewSchema = z.object({
  baseline_errors: z.array(CategorySchema).max(10),
  learned_errors: z.array(CategorySchema).max(10),
  preference: z.enum(["baseline", "learned", "tie"]),
  note: z.string().trim().max(2000),
})
export type EvaluationReview = z.infer<typeof EvaluationReviewSchema>
export interface TrainingSettings {
  publish_enabled: boolean | null
  per_run_cap: number
  daily_job_limit: number
  version: number
  updated_at: string
}
export interface TrainingJob {
  id: string
  kind: "news_evaluation" | "agg_generation"
  status: "queued" | "running" | "completed" | "failed"
  payload: Record<string, unknown>
  result: Record<string, unknown> | null
  error: string | null
  created_at: string
  review: EvaluationReview | null
  review_version: number
}
export function evaluationSummary(jobs: TrainingJob[]) {
  const reviewed = jobs.filter(
    (j) => j.kind === "news_evaluation" && j.status === "completed" && j.review
  )
  return {
    count: reviewed.length,
    baselineClean: reviewed.filter((j) => j.review!.baseline_errors.length === 0).length,
    learnedClean: reviewed.filter((j) => j.review!.learned_errors.length === 0).length,
    improved: reviewed.filter((j) => j.review!.preference === "learned").length,
  }
}
export function effectivePublishing(
  settings: Pick<TrainingSettings, "publish_enabled">,
  environment: string | undefined
) {
  return settings.publish_enabled ?? environment === "on"
}
