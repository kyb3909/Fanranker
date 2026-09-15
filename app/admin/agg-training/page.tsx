import { requireAdminPageAccess } from "@/lib/admin/page-access"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { TrainingClient, type TrainingEntry } from "./training-client"
import { TrainingCenter } from "@/components/admin/training-center"

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
  await requireAdminPageAccess("/admin/agg-training")
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
        소재는 애초에 쓰지 말라는 신호입니다. 교정·반려는 별도 실행 없이 다음 생성에서 참고합니다.
        아래에서 소재를 선택해 새 연습을 만들 수 있습니다.
      </p>
      <TrainingClient items={items} />
      <div className="mt-8">
        <TrainingCenter communityOnly />
      </div>
    </div>
  )
}
