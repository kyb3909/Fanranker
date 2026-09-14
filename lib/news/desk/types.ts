import { z } from "zod"

export const CATEGORY_LABELS = {
  fact: "사실관계",
  number: "숫자·금액",
  time: "날짜·시점",
  naming: "이름·표기",
  attribution: "출처 귀속",
  certainty: "확신 수준",
  quote: "인용",
  context: "배경·맥락",
  structure: "기사 구조",
  style: "문장 표현",
} as const
export const CategorySchema = z.enum([
  "fact",
  "number",
  "time",
  "naming",
  "attribution",
  "certainty",
  "quote",
  "context",
  "structure",
  "style",
])
export const ArticleSchema = z.object({
  title: z.string().trim().min(2).max(300),
  article: z.string().trim().min(20).max(8000),
})
export type DeskArticle = z.infer<typeof ArticleSchema>
export const SourceSchema = z.object({
  id: z.string().min(1).max(200),
  source_name: z.string(),
  source_url: z.string().url(),
  title: z.string(),
  published_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  author: z.string().nullable(),
  source_tier: z.number().int().min(1).max(5),
  primary_or_secondary: z.enum(["primary", "secondary", "unverified"]),
  original_reporting: z.boolean().nullable(),
  origin_group: z.string().nullable(),
  role: z.enum(["current", "background"]),
  captured_at: z.string(),
  text: z.string().min(80).max(24000),
})
export type DeskSource = z.infer<typeof SourceSchema>
export const FactSchema = z.object({
  id: z.string().max(40),
  text: z.string().min(1).max(800),
  kind: z.enum(["CONFIRMED", "REPORTED", "CLAIM", "OPINION"]),
  evidence: z
    .array(z.object({ source_id: z.string(), quote: z.string().min(12).max(1400) }))
    .min(1)
    .max(4),
})
export const ResearchSchema = z.object({
  rejected: z.boolean(),
  rejection_reason: z.string().nullable(),
  news_type: z.enum(["BREAKING", "GENERAL", "FOLLOW_UP", "OFFICIAL", "RUMOR", "ANALYSIS"]),
  angle: z.string().max(1000),
  facts: z.array(FactSchema).max(18),
  conflicts: z.array(z.string().max(1000)).max(8),
  verification_gaps: z.array(z.string().max(1000)).max(8),
})
export type DeskResearch = z.infer<typeof ResearchSchema> & {
  confidence?: "HIGH" | "MEDIUM" | "LOW"
  policy_version?: string
}
export const LessonProposalSchema = z.object({
  category: CategorySchema,
  field: z.enum(["title", "article"]),
  wrong: z.string().max(2000),
  correct: z.string().max(2000),
  explanation: z.string().min(1).max(2000),
})
export type LessonProposal = z.infer<typeof LessonProposalSchema>
export interface DeskLesson extends LessonProposal {
  id: string
  revision_id: string
  ordinal: number
  instruction: string
  scope: "general" | "case"
  active: boolean
  created_at: string
  updated_at: string
}
export interface DeskRevision {
  id: string
  item_id: string
  version: number
  before_draft: DeskArticle
  after_draft: DeskArticle
  editor_reason: string
  learning_state: "pending" | "processing" | "ready" | "failed" | "skipped"
  learning_attempts: number
  learning_token: string | null
  learning_error: string | null
  created_at: string
}
export interface DeskItem {
  id: string
  source_reservoir_id: string
  status: "generating" | "drafted" | "reviewed" | "rejected" | "failed"
  sources: DeskSource[]
  research: DeskResearch | null
  original: DeskArticle | null
  draft: DeskArticle | null
  quality: { pass: boolean; reasons: string[] } | null
  applied_lesson_ids: string[]
  version: number
  error: string | null
  created_at: string
  updated_at: string
}
export interface DeskSettings {
  enabled: boolean
  pending_target: number
  daily_limit: number
  next_auto_at: string
  last_run_at: string | null
  lease_until: string | null
  last_error: string | null
}
export interface DeskResponse {
  items: DeskItem[]
  lessons: DeskLesson[]
  revisions: DeskRevision[]
  settings: DeskSettings
  counts: { pending: number; reviewed: number; lessons: number; today: number }
  isAdmin: boolean
}
