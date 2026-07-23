import { createServiceRoleClient } from "@/lib/supabase/server"
import { TrainingClient, type TrainingEntry } from "./training-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "AI 글 학습 | 관리자" }

interface Row {
  id: string
  round: number
  source_title: string
  category: string | null
  body_excerpt: string | null
  media: { type: string; url?: string; rehosted_url?: string | null }[] | null
  persona: string
  structure: string
  angle: string | null
  ai_title: string
  ai_body: string
  created_at: string
}

export default async function AggTrainingPage() {
  const supabase = createServiceRoleClient()

  const { data } = await supabase
    .from("agg_training_entries")
    .select(
      "id, round, source_title, category, body_excerpt, media, persona, structure, angle, ai_title, ai_body, created_at"
    )
    .eq("status", "pending")
    .order("round", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(50)

  // 회수 대기 (검수했지만 아직 learn 안 돌린 것) — 페이지 상단 안내용
  const { count: unlearnedCount } = await supabase
    .from("agg_training_entries")
    .select("id", { count: "exact", head: true })
    .in("status", ["corrected", "rejected"])
    .is("learned_at", null)

  const items: TrainingEntry[] = ((data as Row[]) ?? []).map((r) => ({
    id: r.id,
    round: r.round,
    sourceTitle: r.source_title,
    category: r.category,
    bodyExcerpt: r.body_excerpt,
    images: (r.media ?? [])
      .filter((m) => m.type === "image" && m.rehosted_url)
      .map((m) => m.rehosted_url as string)
      .slice(0, 4),
    persona: r.persona,
    structure: r.structure,
    angle: r.angle,
    aiTitle: r.ai_title,
    aiBody: r.ai_body,
  }))

  return (
    <div className="mx-auto max-w-[860px] p-6">
      <h1 className="text-xl font-bold">AI 글 학습 (페르소나 품질 교정)</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        학습 라운드의 AI 초안입니다. <b>발행되지 않습니다</b> — 검수 결과만 학습됩니다. <b>통과</b>
        =이대로 좋음, <b>교정 저장</b>=고친 글이 다음 생성의 few-shot 예시가 됨, <b>반려</b>=이런
        소재는 애초에 쓰지 말라는 신호. 검수 후 로컬에서{" "}
        <code className="bg-muted rounded px-1 py-0.5 text-xs">agg-train.js learn</code> →{" "}
        <code className="bg-muted rounded px-1 py-0.5 text-xs">gen</code> 으로 다음 라운드를
        생성하세요.
      </p>
      {(unlearnedCount ?? 0) > 0 && (
        <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          검수 완료 {unlearnedCount}건이 아직 학습 회수 전입니다 —{" "}
          <code>node data/agents/scripts/agg-train.js learn</code> 을 실행하세요.
        </p>
      )}
      <TrainingClient items={items} />
    </div>
  )
}
