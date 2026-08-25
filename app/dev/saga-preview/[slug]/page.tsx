import { notFound } from "next/navigation"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { formatRelativeTime } from "@/lib/utils/date"
import { STAGE_FLOW, STAGE_LABEL, stageIndex, type SagaType } from "@/lib/saga/stages"
import { aggregateMainVotes } from "@/lib/saga/votes"
import { CommentSection } from "@/components/post-detail/comment-section"
import { renderTipTapToHTML } from "@/lib/tiptap/render-html"
import { SAGA_DEADLINE_KST } from "@/lib/saga/config"
import { VoteCard } from "./vote-card"

/**
 * 사가 상세 리디자인 프리뷰 — 코덱스 목업 기준
 * (design-references/saga-transfer-mockup-2026-08-04). 실데이터·실투표로 동작하되
 * 본 페이지(/saga/[slug])는 건드리지 않는다. 승인되면 이 디자인을 본 페이지로 이식.
 *
 * 목업 대비 반영 사항: 도트 스테퍼 / 헤더에 티어 칩·D-day / 여론 게이지 분리 카드 +
 * 큰 % / "지금 읽는 중" 칩 / "사가 연대기 · 최신 기록부터"(역순) / 에코 풀폭 접힘 바.
 * 데이터 로직은 app/saga/[slug]/page.tsx 를 복제 (프리뷰 폐기 시 같이 삭제).
 */

export const dynamic = "force-dynamic"

const TIER_LABEL = { official: "오피셜", tier1: "유력", rumor: "루머" } as const
const TIER_STYLE = {
  official: { color: "#0E7A3C", bg: "rgba(14,122,60,.08)" },
  tier1: { color: "var(--wc-burgundy, #961E37)", bg: "rgba(150,30,55,.07)" },
  rumor: { color: "#946A12", bg: "rgba(148,106,18,.09)" },
} as const

function kstDateLabel(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000)
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`
}

function ddayLabel(): string | null {
  const deadline = new Date(SAGA_DEADLINE_KST).getTime()
  const days = Math.ceil((deadline - Date.now()) / 86400_000)
  return days > 0 ? `D-${days}` : null
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

interface LinkedArticle {
  postId: string
  title: string
  contentHtml: string | null
}

async function fetchSaga(slug: string) {
  const supabase = createServiceRoleClient()
  const { data: saga } = await supabase.from("sagas").select("*").eq("slug", slug).maybeSingle()
  if (!saga) return null
  // 목업 확정: 최신 기록부터 (본 페이지의 시간순과 반대 — 프리뷰에서 검증)
  const { data: entries } = await supabase
    .from("saga_entries")
    .select("id, headline, summary, tier, stage_after, origin, echoes, occurred_at")
    .eq("saga_id", saga.id)
    .order("occurred_at", { ascending: false })

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

  const vote = await aggregateMainVotes(supabase, saga.id)
  return { saga, entries: (entries ?? []) as unknown as EntryRow[], articlesByEntry, vote }
}

export default async function SagaPreviewPage({
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
  if (saga.saga_type === "season") notFound() // 프리뷰는 transfer 전용

  const flow = STAGE_FLOW[saga.saga_type as SagaType]
  const idx = stageIndex(saga.saga_type as SagaType, saga.stage)
  const closed = saga.status === "closed"
  const dday = ddayLabel()
  // 헤더 티어 칩 = 가장 최신 엔트리의 신뢰 등급
  const headTier = entries[0]?.tier ?? "rumor"
  const fromArticle = from
    ? [...articlesByEntry.values()].flat().find((a) => a.postId === from)
    : undefined

  return (
    <div className="worldcup-scope min-h-[100dvh]" style={{ background: "var(--wc-paper)" }}>
      <main className="mx-auto max-w-[760px] px-4 pt-6 pb-16 sm:px-6">
        {/* 프리뷰 배너 */}
        <p
          className="mb-4 rounded-lg px-4 py-2 text-[12px] font-bold"
          style={{ background: "#EEF2FF", color: "#3730A3" }}
        >
          디자인 프리뷰 — 본 페이지는 /saga/{slug} (이 화면은 목업 검증용)
        </p>

        {!saga.is_confirmed && !closed && (
          <div
            className="mb-4 rounded-lg px-4 py-2.5 text-[13px] font-bold"
            style={{ background: "rgba(148,106,18,.08)", color: "#946A12" }}
          >
            ⚠️ 확정되지 않은 이적설입니다 — 아래 내용은 보도 시점의 주장이며 사실과 다를 수
            있습니다.
          </div>
        )}

        {/* ── [1] 헤더: 제목 + 부제 + 도트 스테퍼 + 티어 칩·D-day ── */}
        <header
          className="rounded-2xl px-5 py-6 sm:px-7"
          style={{ background: "var(--wc-card, #fff)", boxShadow: "var(--wc-shadow-1)" }}
        >
          <h1
            className="text-[24px] font-extrabold sm:text-[28px]"
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

          {/* 도트 스테퍼 — 노선도식. 지나온 단계는 채운 도트 + 버건디 연결선 */}
          <ol className="mt-6 flex items-start" aria-label="진행 단계">
            {flow.map((st, i) => {
              const reached = closed ? saga.outcome === "done" : i <= idx
              const current = !closed && i === idx
              const lineReached = closed ? saga.outcome === "done" : i <= idx
              return (
                <li key={st} className="relative flex flex-1 flex-col items-center gap-2">
                  {/* 연결선 — 첫 단계 제외, 이전 도트에서 이어짐 */}
                  {i > 0 && (
                    <span
                      className="absolute top-[26px] right-1/2 left-[-50%] h-0.5"
                      style={{
                        background: lineReached ? "var(--wc-burgundy)" : "var(--wc-line)",
                      }}
                      aria-hidden
                    />
                  )}
                  <span
                    className="text-[11px]"
                    style={{
                      color: reached ? "var(--wc-burgundy)" : "var(--wc-mute)",
                      fontWeight: current ? 800 : 700,
                    }}
                  >
                    {STAGE_LABEL[st] ?? st}
                  </span>
                  <span
                    className="relative z-10 rounded-full"
                    style={{
                      width: current ? 14 : 11,
                      height: current ? 14 : 11,
                      background: reached ? "var(--wc-burgundy)" : "#D4D4D8",
                      boxShadow: current ? "0 0 0 4px rgba(150,30,55,.15)" : undefined,
                    }}
                    aria-hidden
                  />
                </li>
              )
            })}
          </ol>

          <div className="mt-5 flex items-center gap-2.5">
            <span
              className="rounded-md border px-2 py-0.5 text-[12px] font-extrabold"
              style={{
                borderColor: TIER_STYLE[headTier].color,
                color: TIER_STYLE[headTier].color,
                background: TIER_STYLE[headTier].bg,
              }}
            >
              {TIER_LABEL[headTier]}
            </span>
            {dday && !closed && (
              <span className="text-[13px] font-bold" style={{ color: "var(--wc-mute)" }}>
                이적시장 마감{" "}
                <span style={{ color: "var(--wc-burgundy)", fontWeight: 800 }}>{dday}</span>
              </span>
            )}
            {closed && saga.outcome && (
              <span className="text-[13px] font-bold" style={{ color: "var(--wc-mute)" }}>
                &ldquo;{STAGE_LABEL[saga.outcome] ?? saga.outcome}&rdquo;로 종결
              </span>
            )}
          </div>
        </header>

        {/* ── [2] 여론 투표 카드 (기사 경유 진입이면 기사 뒤로) ── */}
        {!fromArticle && <VoteCard slug={saga.slug} closed={closed} initial={vote} />}

        {/* ── [3] 지금 읽는 중 — 타고 들어온 기사 ── */}
        {fromArticle && fromArticle.contentHtml && (
          <>
            <section
              className="mt-4 rounded-2xl px-5 py-5 sm:px-7"
              style={{ background: "var(--wc-card, #fff)", boxShadow: "var(--wc-shadow-1)" }}
              aria-label="기사"
            >
              <span
                className="inline-flex rounded-full px-2.5 py-1 text-[11px] font-extrabold"
                style={{ background: "rgba(150,30,55,.08)", color: "var(--wc-burgundy)" }}
              >
                지금 읽는 중
              </span>
              <h2
                className="mt-2 text-[18px] font-extrabold"
                style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
              >
                {fromArticle.title}
              </h2>
              <div
                className="prose prose-base mt-2 max-w-none"
                dangerouslySetInnerHTML={{ __html: fromArticle.contentHtml }}
              />
            </section>
            <VoteCard slug={saga.slug} closed={closed} initial={vote} />
          </>
        )}

        {/* ── [4] 사가 연대기 — 최신 기록부터, 날짜 마디에 도트 ── */}
        <section className="mt-8" aria-label="사가 연대기">
          <h2 className="mb-4 text-[16px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
            사가 연대기{" "}
            <span className="text-[12px] font-bold" style={{ color: "var(--wc-mute)" }}>
              최신 기록부터
            </span>
          </h2>
          <div className="relative">
            <span
              className="absolute top-2 bottom-2 left-[5px] w-0.5 rounded-full"
              style={{ background: "var(--wc-line)" }}
              aria-hidden
            />
            <div className="flex flex-col gap-3">
              {entries.map((e, i) => {
                const newDate =
                  i === 0 ||
                  kstDateLabel(entries[i - 1].occurred_at) !== kstDateLabel(e.occurred_at)
                return (
                  <div key={e.id} className="relative pl-7">
                    {newDate && (
                      <>
                        <span
                          className="absolute top-[5px] left-0 h-3 w-3 rounded-full"
                          style={{ background: "var(--wc-ink)" }}
                          aria-hidden
                        />
                        <p
                          className="mb-2 text-[13px] font-extrabold"
                          style={{ color: "var(--wc-ink)" }}
                        >
                          {kstDateLabel(e.occurred_at)}
                        </p>
                      </>
                    )}
                    <article
                      className="overflow-hidden rounded-xl"
                      style={{
                        background: "var(--wc-card, #fff)",
                        boxShadow: "var(--wc-shadow-1)",
                      }}
                    >
                      <div className="px-4 py-3.5">
                        <div className="flex items-start gap-2.5">
                          <span
                            className="mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-extrabold"
                            style={{
                              color: TIER_STYLE[e.tier].color,
                              background: TIER_STYLE[e.tier].bg,
                            }}
                          >
                            {TIER_LABEL[e.tier]}
                          </span>
                          <div className="min-w-0 flex-1">
                            <h3
                              className="text-[14px] leading-snug font-bold"
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
                          </div>
                          <a
                            href={e.origin.url}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="shrink-0 text-[12px] font-bold whitespace-nowrap underline-offset-2 hover:underline"
                            style={{ color: "var(--wc-mute)" }}
                          >
                            {e.origin.outlet} ↗
                          </a>
                        </div>
                        <div
                          className="mt-1.5 flex items-center gap-2 text-[11px] font-bold"
                          style={{ color: "var(--wc-mute)" }}
                        >
                          {e.stage_after && (
                            <span
                              className="rounded px-1 py-px"
                              style={{
                                background: "rgba(150,30,55,.07)",
                                color: "var(--wc-burgundy)",
                              }}
                            >
                              → {STAGE_LABEL[e.stage_after] ?? e.stage_after}
                            </span>
                          )}
                          <span suppressHydrationWarning>
                            {formatRelativeTime(new Date(e.occurred_at))}
                          </span>
                        </div>

                        {(articlesByEntry.get(e.id) ?? []).map(
                          (a) =>
                            a.contentHtml && (
                              <details key={a.postId} className="group mt-2">
                                <summary
                                  className="cursor-pointer list-none text-[12px] font-bold select-none"
                                  style={{ color: "var(--wc-burgundy)" }}
                                >
                                  <span className="group-open:hidden">
                                    기사 펼쳐보기 — {a.title}
                                  </span>
                                  <span className="hidden group-open:inline">기사 접기</span>
                                </summary>
                                <div className="mt-2">
                                  <h4
                                    className="text-[15px] font-extrabold"
                                    style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
                                  >
                                    {a.title}
                                  </h4>
                                  <div
                                    className="prose prose-base mt-2 max-w-none"
                                    dangerouslySetInnerHTML={{ __html: a.contentHtml }}
                                  />
                                </div>
                              </details>
                            )
                        )}
                      </div>

                      {/* 에코 — 풀폭 접힘 바 (목업) */}
                      {e.echoes.length > 0 && (
                        <details
                          className="group border-t"
                          style={{ borderColor: "var(--wc-line)" }}
                        >
                          <summary
                            className="flex cursor-pointer items-center justify-between px-4 py-2.5 text-[12px] font-bold select-none"
                            style={{ color: "var(--wc-mute)" }}
                          >
                            외신 {e.echoes.length}곳이 받아씀
                            <span className="transition-transform group-open:rotate-180">⌄</span>
                          </summary>
                          <ul className="flex flex-col gap-1 px-4 pb-3 text-[12px]">
                            {e.echoes.map((echo, j) => (
                              <li key={j}>
                                <a
                                  href={echo.url}
                                  target="_blank"
                                  rel="noopener noreferrer nofollow"
                                  className="underline underline-offset-2"
                                  style={{ color: "var(--wc-mute)" }}
                                >
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
                )
              })}
            </div>
          </div>
        </section>

        {/* ── [5] 댓글 — 기존 컴포넌트 그대로 (심플 확정) ── */}
        <section className="mt-8" aria-label="댓글">
          <CommentSection postId={saga.anchor_post_id} />
        </section>
      </main>
    </div>
  )
}
