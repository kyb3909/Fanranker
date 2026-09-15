import "server-only"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"
import config from "@/data/agents/config/aggregator.json"
import tiers from "@/data/agents/config/model-tiers.json"
import baseCorrections from "@/data/agents/config/agg-corrections.json"
import { createAggWriter } from "@/data/agents/core/agg-writing.mjs"
import { loadAggCorrections } from "@/data/agents/core/agg-corrections.mjs"
import { openaiChat } from "@/lib/llm/usage-log"
import { chatParams } from "@/lib/llm/openai-params"

export const AggMaterialSchema = z.object({
  source_title: z.string().min(1).max(1000),
  category: z.string().nullable(),
  body_excerpt: z.string().min(30).max(20000),
  media: z.array(z.record(z.unknown())).max(50),
})
export async function generateAggPractice(db: SupabaseClient, material: unknown) {
  const item = AggMaterialSchema.parse(material)
  const model = tiers.tiers.T1.default.id
  const writer = createAggWriter(
    config,
    model,
    readFileSync(join(process.cwd(), "data/agents/prompts/agg-rewriter.md"), "utf8")
  )
  const corrections = await loadAggCorrections(db, baseCorrections)
  const appliedIds = [...corrections.pairs, ...corrections.rejects].flatMap((r: { id?: string }) =>
    r.id ? [r.id] : []
  )
  const persona = writer.pickPersona(item),
    structure = writer.pickStructure(item, () => 0.6)
  const out = await writer.generatePost({
    item,
    persona,
    structure,
    systemPrompt: writer.buildSystemPrompt(corrections),
    chatWithRetry: async (body: Record<string, unknown>) => {
      const response = await openaiChat(
        "agg-training-write",
        { ...body, ...chatParams(model, { temperature: 0.85, max_tokens: 1200 }) },
        { signal: AbortSignal.timeout(65000) }
      )
      if (!response) throw Error("커뮤니티 연습 생성에 실패했습니다.")
      return response
    },
  })
  if (out.decision === "reject")
    return {
      result: {
        rejected: true,
        reason: String(out.reject_reason || "소재 부적합"),
        applied_ids: appliedIds,
      },
      entry: null,
    }
  const parsed = z
    .object({
      decision: z.literal("pass"),
      title: z.string().trim().min(2).max(300),
      paragraphs: z.array(z.string().min(1).max(2000)).min(1).max(5),
      angle: z.string().max(1000).optional(),
    })
    .parse(out)
  const entry = {
    ...item,
    persona: persona.nickname,
    structure,
    angle: parsed.angle ?? null,
    ai_title: parsed.title,
    ai_body: parsed.paragraphs.join("\n\n"),
    applied_training_ids: appliedIds,
  }
  return { entry, result: { title: parsed.title, applied_ids: appliedIds } }
}
