import { after, NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAdminApi } from "@/lib/admin/require-admin-api"
import { RuleSchema, EvaluationReviewSchema, evaluationSummary } from "@/lib/news/training/types"
import { loadPublishingSettings } from "@/lib/news/training/settings"
import { runTrainingJob } from "@/lib/news/training/jobs"
import { EvaluationEvidenceSchema } from "@/lib/news/training/evidence"
import { loadAggCorrections } from "@/data/agents/core/agg-corrections.mjs"
import baseCorrections from "@/data/agents/config/agg-corrections.json"

export const dynamic = "force-dynamic"
export const maxDuration = 300
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } })
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rule"), rule: RuleSchema }),
  z.object({
    action: z.literal("settings"),
    version: z.number().int().min(0),
    publish_enabled: z.boolean().nullable(),
    per_run_cap: z.number().int().min(1).max(10),
    daily_job_limit: z.number().int().min(1).max(48),
  }),
  z.object({
    action: z.literal("lesson_priority"),
    id: z.string().uuid(),
    priority: z.number().int().min(0).max(100),
    expected: z.string().datetime({ offset: true }),
  }),
  z.object({ action: z.literal("evaluate"), item_id: z.string().uuid() }),
  z.object({ action: z.literal("generate_agg"), source_id: z.string().uuid() }),
  z.object({ action: z.literal("retry"), id: z.string().uuid() }),
  z.object({
    action: z.literal("review"),
    id: z.string().uuid(),
    version: z.number().int().min(0),
    review: EvaluationReviewSchema,
  }),
])
export async function GET() {
  const auth = await requireAdminApi()
  if (auth instanceof NextResponse) return auth
  const db = auth.supabase
  try {
    const [settings, results, corrections] = await Promise.all([
      loadPublishingSettings(db),
      Promise.all([
        db
          .from("news_editorial_rules")
          .select("*")
          .order("active", { ascending: false })
          .order("priority", { ascending: false })
          .order("updated_at", { ascending: false })
          .limit(200),
        db
          .from("news_desk_lessons")
          .select("id,category,explanation,instruction,priority,active,review_status,updated_at")
          .order("priority", { ascending: false })
          .order("updated_at", { ascending: false })
          .limit(160),
        db
          .from("news_desk_items")
          .select("id,draft,status,sources,research")
          .in("status", ["drafted", "reviewed"])
          .order("created_at", { ascending: false })
          .limit(80),
        db
          .from("admin_training_jobs")
          .select("id,kind,status,payload,result,error,created_at,review,review_version")
          .order("created_at", { ascending: false })
          .limit(30),
        db
          .from("agg_reservoir")
          .select("id,source_title,category")
          .not("body_excerpt", "is", null)
          .order("created_at", { ascending: false })
          .limit(30),
        db
          .from("agg_training_entries")
          .select(
            "id,source_title,ai_title,ai_body,fix_title,fix_body,reject_reason,status,reviewed_at,applied_training_ids"
          )
          .in("status", ["corrected", "rejected", "passed"])
          .order("reviewed_at", { ascending: false })
          .limit(30),
      ]),
      loadAggCorrections(db, baseCorrections),
    ])
    if (results.some((r) => r.error)) throw Error("학습 현황을 불러오지 못했습니다.")
    const [rules, lessons, items, jobs, aggSources, aggHistory] = results.map((r) => r.data ?? [])
    return json({
      settings,
      rules,
      lessons,
      items: items.flatMap((item) => {
        const evidence = EvaluationEvidenceSchema.safeParse(item)
        return evidence.success && !evidence.data.research?.rejected
          ? [
              {
                id: item.id,
                draft: item.draft,
                status: item.status,
                needs_research: evidence.data.research === null,
              },
            ]
          : []
      }),
      jobs,
      aggSources,
      aggHistory,
      summary: evaluationSummary(jobs),
      correctionIds: [...corrections.pairs, ...corrections.rejects].flatMap((r: { id?: string }) =>
        r.id ? [r.id] : []
      ),
      modelReady: Boolean(process.env.OPENAI_API_KEY),
    })
  } catch {
    return json(
      {
        error:
          "학습 관리 자료를 불러오지 못했습니다. 관리자 학습 저장소의 배포 상태를 확인해 주세요.",
      },
      503
    )
  }
}
export async function POST(req: NextRequest) {
  const auth = await requireAdminApi()
  if (auth instanceof NextResponse) return auth
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return json({ error: "입력 형식과 필수 항목을 확인해 주세요." }, 400)
  const body = parsed.data,
    db = auth.supabase
  try {
    if (body.action === "rule" || body.action === "settings") {
      const { error } =
        body.action === "rule"
          ? await db.rpc("save_news_editorial_rule", { p_rule: body.rule, p_actor: auth.userId })
          : await db.rpc("save_news_training_setting", {
              p_version: body.version,
              p_enabled: body.publish_enabled,
              p_cap: body.per_run_cap,
              p_limit: body.daily_job_limit,
              p_actor: auth.userId,
            })
      if (error)
        return json(
          {
            error:
              error.code === "40001"
                ? "다른 창에서 변경했습니다. 새로고침 후 다시 저장해 주세요."
                : error.code === "22023"
                  ? "활성 편집 원칙은 최대 20개입니다. 기존 원칙을 정리해 주세요."
                  : "설정을 저장하지 못했습니다.",
          },
          error.code === "40001" ? 409 : 400
        )
      return json({ ok: true })
    }
    if (body.action === "lesson_priority") {
      const { data, error } = await db
        .from("news_desk_lessons")
        .update({ priority: body.priority, updated_at: new Date().toISOString() })
        .eq("id", body.id)
        .eq("updated_at", body.expected)
        .select("id")
        .maybeSingle()
      if (error) throw error
      return data
        ? json({ ok: true })
        : json({ error: "학습 항목이 변경됐습니다. 새로고침해 주세요." }, 409)
    }
    if (body.action === "review") {
      const { data, error } = await db
        .from("admin_training_jobs")
        .update({
          review: { ...body.review, reviewer: auth.userId },
          review_version: body.version + 1,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", body.id)
        .eq("kind", "news_evaluation")
        .eq("status", "completed")
        .eq("review_version", body.version)
        .select("id")
        .maybeSingle()
      if (error) throw error
      return data
        ? json({ ok: true })
        : json({ error: "평가가 변경됐거나 아직 실행 중입니다. 새로고침해 주세요." }, 409)
    }
    if (!process.env.OPENAI_API_KEY)
      return json({ error: "AI 작성 연결이 준비되지 않았습니다." }, 503)
    let kind: string, payload: unknown
    if (body.action === "evaluate") {
      const { data, error } = await db
        .from("news_desk_items")
        .select("id,sources,research,status")
        .eq("id", body.item_id)
        .single()
      const evidence = EvaluationEvidenceSchema.safeParse(data)
      if (
        error ||
        !data ||
        !evidence.success ||
        evidence.data.research?.rejected ||
        !["drafted", "reviewed"].includes(data.status)
      )
        return json(
          {
            error:
              "원문이 확보된 데스킹 기사를 선택해 주세요. 원문이 없는 기사는 데스킹에서 직접 교정할 수 있습니다.",
          },
          400
        )
      kind = "news_evaluation"
      payload = { item_id: data.id, ...evidence.data }
    } else if (body.action === "generate_agg") {
      const { data, error } = await db
        .from("agg_reservoir")
        .select("source_title,category,body_excerpt,media")
        .eq("id", body.source_id)
        .single()
      if (error || !data?.body_excerpt || data.body_excerpt.length < 30)
        return json({ error: "본문 자료가 있는 소재를 선택해 주세요." }, 400)
      kind = "agg_generation"
      payload = {
        ...data,
        body_excerpt: data.body_excerpt.slice(0, 20000),
        media: (data.media ?? []).slice(0, 50),
      }
    } else {
      const { data, error } = await db
        .from("admin_training_jobs")
        .select("kind,payload,status")
        .eq("id", body.id)
        .single()
      if (error || !data || data.status !== "failed")
        return json({ error: "실패한 작업만 다시 실행할 수 있습니다." }, 409)
      kind = data.kind
      payload = data.payload
    }
    const { data: id, error } = await db.rpc("enqueue_admin_training", {
      p_kind: kind,
      p_payload: payload,
      p_actor: auth.userId,
    })
    if (error)
      return json(
        {
          error: ["22023", "40001"].includes(error.code)
            ? error.message
            : "학습 작업을 예약하지 못했습니다.",
        },
        error.code === "40001" ? 409 : 400
      )
    after(async () => {
      await runTrainingJob(db, id)
    })
    return json({ ok: true, id }, 202)
  } catch {
    return json({ error: "요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요." }, 503)
  }
}
