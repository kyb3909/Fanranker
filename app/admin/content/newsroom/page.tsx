import type { Metadata } from "next"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export const metadata: Metadata = { title: "뉴스룸 큐" }
export const dynamic = "force-dynamic"

interface KoreanBrief {
  headline?: string
  body?: string
  unverifiedFlags?: string[]
}

interface DraftedItem {
  id: string
  source: { platform?: string; subreddit?: string } | null
  raw: { title?: string } | null
  scores: { credibility?: number; newsworthiness?: number } | null
  draft: KoreanBrief | null
  issue_type: string | null
  created_at: string
}

const STATUS_LABELS: Record<string, string> = {
  ingested: "수집됨",
  credibility_passed: "공신력 통과",
  credibility_rejected: "공신력 탈락",
  normalized: "정규화",
  enriched: "보강",
  dedupe_checked: "중복 검사",
  duplicate: "중복",
  desk_approved: "데스크 승인",
  desk_rejected: "데스크 반려",
  desk_held: "데스크 보류",
  desk_merge: "병합 대상",
  assigned: "작성 배정",
  drafted: "초안 완료",
  formatted: "포맷 완료",
  published: "게시됨",
  failed: "실패",
}

export default async function AdminNewsroomPage() {
  const supabase = createServiceRoleClient()

  const [{ data: queueRaw }, { data: draftedRaw }] = await Promise.all([
    supabase.from("news_reservoir_queue_lengths").select("*"),
    supabase
      .from("news_reservoir")
      .select("id, source, raw, scores, draft, issue_type, created_at")
      .eq("status", "drafted")
      .order("created_at", { ascending: false })
      .limit(50),
  ])

  const queue = (queueRaw ?? []) as { status: string; count: number }[]
  const drafted = (draftedRaw ?? []) as unknown as DraftedItem[]

  return (
    <main id="main-content" tabIndex={-1} className="space-y-6 p-6">
      <div>
        <h1 className="text-foreground text-2xl font-bold">뉴스룸 큐</h1>
        <p className="text-muted-foreground text-sm">
          newsroom 에이전트 파이프라인의 단계별 현황과 검수 대기 초안입니다.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">파이프라인 단계</h2>
        {queue.length === 0 ? (
          <p className="text-muted-foreground text-sm">reservoir 데이터가 없습니다.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {queue.map((q) => (
              <Card key={q.status}>
                <CardContent className="pt-4">
                  <p className="text-muted-foreground text-xs">
                    {STATUS_LABELS[q.status] ?? q.status}
                  </p>
                  <p className="text-2xl font-bold">{q.count}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">검수 대기 초안 ({drafted.length})</h2>
        <p className="text-muted-foreground text-xs">
          Phase A 는 초안 단계에서 정지하고 수동 검수합니다. 게시·반려는 agents CLI 에서 수행하세요.
        </p>
        {drafted.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground pt-6 text-center text-sm">
              검수 대기 초안이 없습니다.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {drafted.map((item) => (
              <Card key={item.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm">
                      {item.draft?.headline ?? item.raw?.title ?? item.id}
                    </CardTitle>
                    <div className="flex shrink-0 gap-1">
                      {item.issue_type && (
                        <Badge variant="outline" className="text-xs">
                          {item.issue_type}
                        </Badge>
                      )}
                      {item.source?.subreddit && (
                        <Badge variant="secondary" className="text-xs">
                          r/{item.source.subreddit}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {item.draft?.body && (
                    <p className="text-muted-foreground line-clamp-3 text-sm">{item.draft.body}</p>
                  )}
                  <div className="text-muted-foreground flex flex-wrap gap-3 text-xs">
                    {item.scores?.credibility != null && (
                      <span>공신력 {Math.round(item.scores.credibility * 100)}%</span>
                    )}
                    {item.scores?.newsworthiness != null && (
                      <span>뉴스성 {Math.round(item.scores.newsworthiness * 100)}%</span>
                    )}
                    <span>{new Date(item.created_at).toLocaleString("ko-KR")}</span>
                  </div>
                  {item.draft?.unverifiedFlags && item.draft.unverifiedFlags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {item.draft.unverifiedFlags.map((f, i) => (
                        <Badge
                          key={i}
                          variant="outline"
                          className="border-yellow-500 text-[10px] text-yellow-700 dark:text-yellow-400"
                        >
                          미검증: {f}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
