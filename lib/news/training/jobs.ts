import "server-only"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"
import { ResearchSchema } from "@/lib/news/desk/types"
import { validateResearch } from "@/lib/news/desk/evidence"
import { ask, loadDeskLessons, RESEARCH_PROMPT, writeDeskArticle } from "@/lib/news/desk/service"
import { EvaluationEvidenceSchema } from "./evidence"
import { loadEditorialRules } from "./settings"
import { loadNotation } from "@/lib/news/notation"
import { selectNotationHints } from "@/lib/news/notation/select-hints"
import { inspectDraft } from "@/lib/news/quality-gate"
import { generateAggPractice } from "@/lib/agg/training"
import { NEWS_WRITER_POLICY_VERSION } from "@/scripts/vps-news-scanner/writer-policy.mjs"

async function evaluate(db: SupabaseClient, payload: unknown) {
  const input = EvaluationEvidenceSchema.extend({ item_id: z.string().uuid() }).parse(payload)
  // Reuse one source-grounded research snapshot in both sides of the comparison.
  const research = validateResearch(
    input.research ??
      ResearchSchema.parse(
        await ask("news-evaluation-research", RESEARCH_PROMPT, { sources: input.sources }, 7000)
      ),
    input.sources
  )
  if (research.rejected) throw Error("원문 근거가 부족한 소재는 비교 평가에 사용할 수 없습니다.")
  const [lessons, rules, notation] = await Promise.all([
    loadDeskLessons(db),
    loadEditorialRules(db),
    loadNotation(db),
  ])
  const common = {
    sources: input.sources,
    research,
    naming: selectNotationHints(
      notation.hints,
      input.sources.map((s) => `${s.title}\n${s.text}`).join("\n")
    ),
  }
  const [baseline, learned] = await Promise.all([
    writeDeskArticle({ ...common, rules: [], lessons: [] }, "news-evaluation-baseline"),
    writeDeskArticle({ ...common, rules, lessons }, "news-evaluation-learned"),
  ])
  const source = input.sources.find((s) => s.role === "current")!
  if (!source) throw Error("현재 원문이 없습니다.")
  const judge = (article: typeof baseline) =>
    inspectDraft(
      article.title,
      {
        type: "doc",
        content: article.article
          .split(/\n+/)
          .filter(Boolean)
          .map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })),
      },
      source.text,
      {
        original_title: source.title,
        source_url: source.source_url,
        published_at: source.published_at,
        captured_at: source.captured_at,
        background: input.sources
          .filter((s) => s.role === "background")
          .map((s) => ({
            id: s.id,
            url: s.source_url,
            title: s.title,
            published_at: s.published_at!,
            excerpt: s.text,
          })),
      }
    )
  const quality = await Promise.all([judge(baseline), judge(learned)])
  return {
    baseline,
    learned,
    baseline_quality: quality[0],
    learned_quality: quality[1],
    rules,
    lessons,
    research,
    policy_version: NEWS_WRITER_POLICY_VERSION,
    item_id: input.item_id,
  }
}

export async function runTrainingJob(db: SupabaseClient, id?: string) {
  const token = randomUUID()
  const { data, error } = await db.rpc("claim_admin_training", { p_id: id ?? null, p_token: token })
  if (error) throw Error("학습 작업을 시작하지 못했습니다.")
  const job = data?.[0]
  if (!job) return { skipped: true }
  try {
    const generated =
      job.kind === "news_evaluation"
        ? { result: await evaluate(db, job.payload), entry: null }
        : await generateAggPractice(db, job.payload)
    const saved = await db.rpc("complete_admin_training", {
      p_id: job.id,
      p_token: token,
      p_result: generated.result,
      p_entry: generated.entry,
    })
    if (saved.error) throw Error("학습 결과를 저장하지 못했습니다.")
    if (!saved.data) return { id: job.id, skipped: true }
    return { id: job.id, completed: true }
  } catch (error) {
    const reason =
      error instanceof z.ZodError
        ? "생성 응답의 형식을 확인하지 못했습니다."
        : error instanceof Error
          ? error.message.slice(0, 300)
          : "학습 작업에 실패했습니다."
    const saved = await db
      .from("admin_training_jobs")
      .update({
        status: "failed",
        error: reason,
        completed_at: new Date().toISOString(),
        lease_until: null,
      })
      .eq("id", job.id)
      .eq("token", token)
      .eq("status", "running")
      .select("id")
      .maybeSingle()
    if (saved.error) throw Error("실패한 작업의 상태를 저장하지 못했습니다.")
    if (!saved.data) return { id: job.id, skipped: true }
    return { id: job.id, error: reason }
  }
}
