import { NextResponse } from "next/server"
import { requireAdminApi } from "@/lib/admin/require-admin-api"
import { buildInsightInput, generateInsight, type Insight } from "@/lib/admin/insight"

export const dynamic = "force-dynamic"
export const maxDuration = 120

/**
 * GET  /api/admin2/insight — 가장 최근 인사이트 (없으면 null)
 * POST /api/admin2/insight — 새로 생성 (LLM 호출, 수십 초 소요)
 *
 * 생성은 버튼으로만 돈다 — 자동 주기 생성은 비용 대비 가치가 확인된 뒤에.
 */

export async function GET() {
  const gate = await requireAdminApi()
  if (gate instanceof NextResponse) return gate
  const { supabase } = gate

  const { data } = await supabase
    .from("admin_insights")
    .select("id, period_start, period_end, insight, model, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json(
    { insight: data ?? null },
    { headers: { "Cache-Control": "private, no-store" } }
  )
}

export async function POST() {
  const gate = await requireAdminApi()
  if (gate instanceof NextResponse) return gate
  const { supabase } = gate

  const input = await buildInsightInput(supabase)
  const result = await generateInsight(input)
  if (!result) {
    return NextResponse.json(
      { error: "인사이트 생성에 실패했습니다. (OPENAI_API_KEY 확인)" },
      { status: 502 }
    )
  }

  // 분석 대상 기간 = 가장 최근 GA4 주간 리포트 기준. 없으면 오늘로 채운다.
  const ga4 = (input as { ga4주간: { 기간: string }[] }).ga4주간
  const latest = ga4?.[0]?.기간?.split("~") ?? []
  const today = new Date().toISOString().slice(0, 10)

  const { data: saved, error } = await supabase
    .from("admin_insights")
    .insert({
      period_start: latest[0] || today,
      period_end: latest[1] || today,
      input_snapshot: input,
      insight: result.insight,
      model: result.model,
      generated_by: "manual",
      generation_duration_ms: result.ms,
    })
    .select("id, period_start, period_end, insight, model, created_at")
    .single()

  if (error) {
    // 저장은 실패해도 생성된 인사이트는 돌려준다 (화면에서 바로 읽을 수 있게)
    console.error("[insight] 저장 실패:", error.message)
    return NextResponse.json({
      insight: {
        id: null,
        insight: result.insight as Insight,
        model: result.model,
        created_at: new Date().toISOString(),
      },
      warning: "생성은 됐으나 저장에 실패했습니다.",
    })
  }

  return NextResponse.json({ insight: saved })
}
