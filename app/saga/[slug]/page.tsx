import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { formatRelativeTime } from "@/lib/utils/date"
import { STAGE_FLOW, STAGE_LABEL, stageIndex, type SagaType } from "@/lib/saga/stages"
import { aggregateMainVotes } from "@/lib/saga/votes"
import { SagaMainVote } from "@/components/saga/main-vote"
import { CommentSection } from "@/components/post-detail/comment-section"
import { ScrollToOpenArticle } from "@/components/saga/scroll-to-open"
import { renderTipTapToHTML } from "@/lib/tiptap/render-html"

/** KST 날짜 마디 라벨 — "8월 2일" */
function kstDateLabel(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000)
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`
}

// 사가는 이벤트가 붙을 때마다 자란다 — 짧은 재검증
export const revalidate = 30

interface SagaRow {
  id: string
  saga_type: SagaType
  slug: string
  title: string
  stage: string
  status: string
  outcome: string | null
  is_confirmed: boolean
  summary: string | null
  anchor_post_id: string
  entry_count: number
  last_event_at: string
  created_at: string
  subject: Record<string, unknown>
}

interface EntryRow {
  id: string
  headline: string
  summary: string | null
  tier: "official" | "tier1" | "rumor"
  stage_after: string | null
  origin: { reporter?: string | null; outlet: string; url: string }
  echoes: { outlet: string; url: string; title: string }[]
  occurred_at: string
}

/** 엔트리에 연결된 발행 기사 — 타임라인 자리에서 본문을 펼쳐 보여준다 */
interface LinkedArticle {
  postId: string
  title: string
  contentHtml: string | null
}

async function fetchSaga(slug: string) {
  const supabase = createServiceRoleClient()
  const { data: saga } = await supabase.from("sagas").select("*").eq("slug", slug).maybeSingle()
  if (!saga) return null
  // 연혁은 시간순 — 오래된 사건이 위, 새 기사는 아래로 붙는다 (드라마를 처음부터 읽는 방향)
  const { data: entries } = await supabase
    .from("saga_entries")
    .select("id, headline, summary, tier, stage_after, origin, echoes, occurred_at")
    .eq("saga_id", saga.id)
    .order("occurred_at", { ascending: true })

  // 연결된 발행 기사 — 떡밥에서 타고 들어온 기사를 해당 엔트리 자리에 펼치기 위함
  const { data: links } = await supabase
    .from("saga_article_links")
    .select("post_id, entry_id, posts ( title, content )")
    .eq("saga_id", saga.id)
  const articlesByEntry = new Map<string, LinkedArticle[]>()
  for (const l of links ?? []) {
    if (!l.entry_id) continue
    const post = l.posts as unknown as { title: string; content: unknown } | null
    if (!post) continue
    const article: LinkedArticle = {
      postId: l.post_id as string,
      title: post.title,
      contentHtml:
        typeof post.content === "object" && post.content ? renderTipTapToHTML(post.content) : null,
    }
    const list = articlesByEntry.get(l.entry_id as string)
    if (list) list.push(article)
    else articlesByEntry.set(l.entry_id as string, [article])
  }

  // 메인 투표 집계 — lib/saga/votes (append-only 원장에서 유저별 최신 선택만)
  const vote = await aggregateMainVotes(supabase, saga.id)
  return {
    saga: saga as unknown as SagaRow,
    entries: (entries ?? []) as unknown as EntryRow[],
    articlesByEntry,
    vote,
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const data = await fetchSaga(slug)
  if (!data) return { title: "사가를 찾을 수 없습니다" }
  return {
    title: `${data.saga.title} — 이적 사가`,
    description: data.saga.summary ?? undefined,
    alternates: { canonical: `/saga/${slug}` },
    // D7: 오피셜 확정 전에는 검색 비노출 (선수 실명 명예훼손 리스크)
    robots: data.saga.is_confirmed ? undefined : { index: false },
  }
}

const TIER_LABEL = { official: "오피셜", tier1: "티어1", rumor: "루머" } as const
const TIER_COLOR = { official: "#0E7A3C", tier1: "var(--wc-burgundy)", rumor: "#946A12" } as const

export default async function SagaDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ from?: string }>
}) {
  const { slug } = await params
  const { from } = await searchParams
  const data = await fetchSaga(slug)
  if (!data) notFound()
  const { saga, entries, articlesByEntry, vote } = data

  const flow = STAGE_FLOW[saga.saga_type]
  const idx = stageIndex(saga.saga_type, saga.stage)
  const closed = saga.status === "closed"
  return (
    <div className="worldcup-scope min-h-[100dvh]" style={{ background: "var(--wc-paper)" }}>
      <main className="mx-auto max-w-[760px] px-4 pt-6 pb-16 sm:px-6">
        {/* 미확인 루머 배너 (D7) — 오피셜 확정 전 고정 */}
        {!saga.is_confirmed && !closed && (
          <div
            className="mb-4 rounded-lg px-4 py-2.5 text-[13px] font-bold"
            style={{ background: "rgba(148,106,18,.08)", color: "#946A12" }}
          >
            ⚠️ 확정되지 않은 이적설입니다 — 아래 내용은 보도 시점의 주장이며 사실과 다를 수
            있습니다.
          </div>
        )}

        {/* ── 헤더: 제목 + 단계 스테퍼 + 메인 투표 (PRD §4.1 레이아웃) ── */}
        <header
          className="rounded-2xl px-5 py-5 sm:px-6"
          style={{ background: "var(--wc-card, #fff)", boxShadow: "var(--wc-shadow-1)" }}
        >
          <h1
            className="text-[22px] font-extrabold sm:text-[26px]"
            style={{ color: "var(--wc-ink)", letterSpacing: "-.02em", wordBreak: "keep-all" }}
          >
            {saga.title}
          </h1>
          {saga.summary && (
            <p
              className="mt-1.5 text-[14px]"
              style={{ color: "var(--wc-mute)", wordBreak: "keep-all" }}
            >
              {saga.summary}
            </p>
          )}

          {/* 단계 스테퍼 — "지금 어디까지 왔나" 상시 표시 (PRD §7) */}
          <ol className="mt-4 flex items-center gap-1" aria-label="진행 단계">
            {flow.map((st, i) => {
              const active = closed ? saga.outcome === "done" : i <= idx
              const current = !closed && i === idx
              return (
                <li key={st} className="flex flex-1 flex-col items-center gap-1.5">
                  <span
                    className="h-1.5 w-full rounded-full"
                    style={{ background: active ? "var(--wc-burgundy)" : "var(--wc-line)" }}
                  />
                  <span
                    className="text-[10.5px] font-bold"
                    style={{
                      color: current ? "var(--wc-burgundy)" : "var(--wc-mute)",
                      fontWeight: current ? 800 : 600,
                    }}
                  >
                    {STAGE_LABEL[st] ?? st}
                  </span>
                </li>
              )
            })}
          </ol>
          {closed && saga.outcome && saga.outcome !== "done" && (
            <p className="mt-2 text-[12.5px] font-bold" style={{ color: "var(--wc-mute)" }}>
              이 사가는 &ldquo;{STAGE_LABEL[saga.outcome] ?? saga.outcome}&rdquo;로 종결됐습니다.
            </p>
          )}

          {/* 메인 투표 — 1탭 참전. SSR 집계로 첫 페인트, 스탠스는 위젯이 하이드레이션 */}
          <div className="mt-5">
            <SagaMainVote slug={saga.slug} closed={closed} initial={vote} />
          </div>
        </header>

        {/* ── 연표 — 시간순(위→아래) 세로 레일 + 날짜 마디. 클러스터 1개 = 엔트리 1개 (D9) ── */}
        <section className="mt-6" aria-label="연표">
          <h2 className="mb-3 text-[15px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
            타임라인 <span style={{ color: "var(--wc-mute)" }}>{entries.length}</span>
          </h2>
          <div className="relative">
            {/* 세로 레일 — 사가가 자랄수록 아래로 길어진다 */}
            <span
              className="absolute top-2 bottom-2 left-[7px] w-0.5 rounded-full"
              style={{ background: "var(--wc-line)" }}
              aria-hidden
            />
            <div className="flex flex-col gap-4">
              {entries.map((e, i) => (
                <div key={e.id} className="relative pl-7">
                  {/* 노드 점 — 오피셜은 채워진 점 */}
                  <span
                    className="absolute top-[30px] left-0 h-4 w-4 rounded-full border-2"
                    style={{
                      borderColor: TIER_COLOR[e.tier],
                      background:
                        e.tier === "official" ? TIER_COLOR[e.tier] : "var(--wc-card, #fff)",
                    }}
                    aria-hidden
                  />
                  {/* 날짜 마디 — 날짜가 바뀔 때만 */}
                  {(i === 0 ||
                    kstDateLabel(entries[i - 1].occurred_at) !== kstDateLabel(e.occurred_at)) && (
                    <p
                      className="mb-1.5 text-[12px] font-extrabold tracking-wide"
                      style={{ color: "var(--wc-mute)" }}
                    >
                      {kstDateLabel(e.occurred_at)}
                    </p>
                  )}
                  <article
                    className="rounded-xl px-4 py-3.5"
                    style={{ background: "var(--wc-card, #fff)", boxShadow: "var(--wc-shadow-1)" }}
                  >
                    <div className="flex items-center gap-2 text-[11.5px] font-bold">
                      <span style={{ color: TIER_COLOR[e.tier] }}>{TIER_LABEL[e.tier]}</span>
                      {e.stage_after && (
                        <span
                          className="rounded px-1 py-px"
                          style={{ background: "rgba(139,30,63,.07)", color: "var(--wc-burgundy)" }}
                        >
                          → {STAGE_LABEL[e.stage_after] ?? e.stage_after}
                        </span>
                      )}
                      <span
                        className="ml-auto"
                        style={{ color: "var(--wc-mute)" }}
                        suppressHydrationWarning
                      >
                        {formatRelativeTime(new Date(e.occurred_at))}
                      </span>
                    </div>
                    <h3
                      className="mt-1 text-[14.5px] font-bold"
                      style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
                    >
                      {e.headline}
                    </h3>
                    {e.summary && (
                      <p
                        className="mt-1 text-[13px]"
                        style={{ color: "var(--wc-mute)", wordBreak: "keep-all" }}
                      >
                        {e.summary}
                      </p>
                    )}
                    <p className="mt-1.5 text-[12px]" style={{ color: "var(--wc-mute)" }}>
                      {e.origin.reporter ? `${e.origin.reporter} · ` : ""}
                      <a
                        href={e.origin.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="underline underline-offset-2"
                      >
                        {e.origin.outlet}
                      </a>
                    </p>
                    {/* 연결된 발행 기사 본문 — 떡밥에서 타고 들어온 기사(?from=)는 펼쳐진 채,
                    나머지는 "기사 펼쳐보기"로 접혀 있다 (2026-08-03 오너) */}
                    {(articlesByEntry.get(e.id) ?? []).map(
                      (a) =>
                        a.contentHtml && (
                          <details
                            key={a.postId}
                            open={a.postId === from}
                            data-article
                            className="group mt-2"
                          >
                            <summary
                              className="cursor-pointer list-none text-[12.5px] font-bold select-none"
                              style={{ color: "var(--wc-burgundy)" }}
                            >
                              <span className="group-open:hidden">
                                📰 기사 펼쳐보기 — {a.title}
                              </span>
                              <span className="hidden group-open:inline">▲ 기사 접기</span>
                            </summary>
                            {/* 펼치면 카드뉴스 카드 그대로 — 제목 + 본문(이미지 포함) */}
                            <div
                              className="mt-2 overflow-hidden rounded-xl px-4 py-3.5"
                              style={{
                                background: "var(--wc-card, #fff)",
                                boxShadow: "var(--wc-shadow-1)",
                              }}
                            >
                              <h4
                                className="text-[15px] font-extrabold"
                                style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
                              >
                                {a.title}
                              </h4>
                              <div
                                className="prose prose-base mt-2 max-w-[68ch]"
                                dangerouslySetInnerHTML={{ __html: a.contentHtml }}
                              />
                            </div>
                          </details>
                        )
                    )}
                    {e.echoes.length > 0 && (
                      <details className="mt-1.5">
                        <summary
                          className="cursor-pointer text-[12px] font-bold"
                          style={{ color: "var(--wc-mute)" }}
                        >
                          이 소식을 전한 매체 {e.echoes.length}곳
                        </summary>
                        <ul className="mt-1 flex flex-col gap-0.5 pl-1 text-[12px]">
                          {e.echoes.map((echo, i) => (
                            <li key={i}>
                              <a
                                href={echo.url}
                                target="_blank"
                                rel="noopener noreferrer nofollow"
                                className="underline underline-offset-2"
                                style={{ color: "var(--wc-mute)" }}
                              >
                                {/* 제목에 이미 [출처] 브래킷이 있으면 중복 표기하지 않는다 */}
                                {echo.title.startsWith("[")
                                  ? echo.title
                                  : `[${echo.outlet}] ${echo.title}`}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </article>
                </div>
              ))}
            </div>
          </div>
        </section>

        {from && <ScrollToOpenArticle />}

        {/* ── 댓글 — 앵커 포스트 경유로 기존 시스템 전부 재사용 (P0 오딧) ── */}
        <section className="mt-8" aria-label="댓글">
          <CommentSection postId={saga.anchor_post_id} />
        </section>
      </main>
    </div>
  )
}
