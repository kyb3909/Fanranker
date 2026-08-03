import Link from "@/components/ui/app-link"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { CommentSection } from "@/components/post-detail/comment-section"
import { STAGE_LABEL } from "@/lib/saga/stages"
import {
  loadSquad,
  fetchStanding,
  fetchMatches,
  fetchRelatedTransferSagas,
  type SeasonSubject,
} from "@/lib/saga/season"

/**
 * 팀 시즌 위키 (saga_type='season') — 나무위키 시즌 문서 지향 v1 (2026-08-04).
 * 전 섹션이 기존 데이터의 재조립: 순위(standings_cache) · 일정(betman_games) ·
 * 이적시장(transfer 사가 연동) · 스쿼드(fpl). 글맛(월별 리뷰)은 추후.
 */

interface SeasonSagaRow {
  id: string
  slug: string
  title: string
  summary: string | null
  anchor_post_id: string
  subject: SeasonSubject
}

function fmtDate(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000)
  return `${d.getUTCMonth() + 1}.${d.getUTCDate()}`
}

const card: React.CSSProperties = {
  background: "var(--wc-card, #fff)",
  boxShadow: "var(--wc-shadow-1)",
}

export async function SeasonWiki({ saga }: { saga: SeasonSagaRow }) {
  const supabase = createServiceRoleClient()
  const subject = saga.subject
  const [standing, matches, relatedSagas] = await Promise.all([
    fetchStanding(supabase, subject.team_kr),
    fetchMatches(supabase, subject.aliases ?? [subject.team_kr]),
    fetchRelatedTransferSagas(supabase, subject.aliases ?? [subject.team_kr]),
  ])
  const squad = loadSquad(subject.team_fpl)
  const teamNames = new Set(subject.aliases ?? [subject.team_kr])

  return (
    <div className="worldcup-scope min-h-[100dvh]" style={{ background: "var(--wc-paper)" }}>
      <main className="mx-auto max-w-[860px] px-4 pt-6 pb-16 sm:px-6">
        {/* ── 헤더: 팀 + 시즌 + 순위 요약 ── */}
        <header className="rounded-2xl px-5 py-5 sm:px-6" style={card}>
          <p
            className="text-[12px] font-extrabold tracking-wide"
            style={{ color: "var(--wc-mute)" }}
          >
            SEASON WIKI · {subject.season}
          </p>
          <h1
            className="mt-0.5 text-[24px] font-extrabold sm:text-[28px]"
            style={{ color: "var(--wc-ink)", letterSpacing: "-.02em" }}
          >
            {saga.title}
          </h1>
          {standing && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px]">
              <span className="font-extrabold" style={{ color: "var(--wc-burgundy)" }}>
                리그 {standing.rank}위
              </span>
              <span style={{ color: "var(--wc-ink)" }}>
                {standing.played}경기 {standing.win}승 {standing.draw}무 {standing.loss}패 · 승점{" "}
                {standing.points}
              </span>
              <span className="text-[11.5px]" style={{ color: "var(--wc-mute)" }}>
                기준 {fmtDate(standing.fetchedAt)}
              </span>
            </div>
          )}
        </header>

        {/* ── 이적시장 — transfer 사가 연동 (문서끼리 서로 가리킨다) ── */}
        {relatedSagas.length > 0 && (
          <section
            className="mt-5 rounded-2xl px-5 py-4 sm:px-6"
            style={card}
            aria-label="이적시장"
          >
            <h2 className="text-[15px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
              이적시장 <span style={{ color: "var(--wc-mute)" }}>{relatedSagas.length}</span>
            </h2>
            <div className="mt-2 flex flex-col gap-1.5">
              {relatedSagas.map((s) => (
                <Link
                  key={s.slug}
                  href={`/saga/${s.slug}`}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-2 transition-colors hover:bg-black/[.03]"
                >
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-extrabold"
                    style={{
                      background: s.status === "closed" ? "var(--wc-line)" : "rgba(139,30,63,.08)",
                      color: s.status === "closed" ? "var(--wc-mute)" : "var(--wc-burgundy)",
                    }}
                  >
                    {s.status === "closed"
                      ? (STAGE_LABEL[s.outcome ?? ""] ?? "종결")
                      : (STAGE_LABEL[s.stage] ?? s.stage)}
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate text-[13.5px] font-semibold"
                    style={{ color: "var(--wc-ink)" }}
                  >
                    {s.title}
                  </span>
                  <span className="shrink-0 text-[11px]" style={{ color: "var(--wc-mute)" }}>
                    기록 {s.entry_count}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── 일정·결과 ── */}
        {matches.length > 0 && (
          <section className="mt-5 rounded-2xl px-5 py-4 sm:px-6" style={card} aria-label="일정">
            <h2 className="text-[15px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
              일정 · 결과
            </h2>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-[13px]" style={{ color: "var(--wc-ink)" }}>
                <tbody>
                  {matches.map((m, i) => {
                    const done = m.status === "completed" && m.homeScore !== null
                    const isHome = teamNames.has(m.home)
                    const our = isHome ? m.homeScore : m.awayScore
                    const their = isHome ? m.awayScore : m.homeScore
                    const wdl =
                      done && our !== null && their !== null
                        ? our > their
                          ? "승"
                          : our < their
                            ? "패"
                            : "무"
                        : null
                    return (
                      <tr
                        key={i}
                        style={{ borderTop: i > 0 ? "1px solid var(--wc-line)" : undefined }}
                      >
                        <td
                          className="py-1.5 pr-2 whitespace-nowrap tabular-nums"
                          style={{ color: "var(--wc-mute)" }}
                        >
                          {fmtDate(m.matchTime)}
                        </td>
                        <td
                          className="py-1.5 pr-2 text-[11.5px] whitespace-nowrap"
                          style={{ color: "var(--wc-mute)" }}
                        >
                          {m.leagueCode ?? ""}
                        </td>
                        <td className="py-1.5 text-right font-semibold">{m.home}</td>
                        <td className="px-2 py-1.5 text-center font-extrabold whitespace-nowrap tabular-nums">
                          {done ? `${m.homeScore} : ${m.awayScore}` : "vs"}
                        </td>
                        <td className="py-1.5 font-semibold">{m.away}</td>
                        <td className="py-1.5 pl-2">
                          {wdl && (
                            <span
                              className="rounded px-1 text-[11px] font-extrabold"
                              style={{
                                color:
                                  wdl === "승"
                                    ? "#0E7A3C"
                                    : wdl === "패"
                                      ? "var(--wc-burgundy)"
                                      : "var(--wc-mute)",
                              }}
                            >
                              {wdl}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── 스쿼드 (fpl 시드 — 한글명·포지션) ── */}
        {squad.length > 0 && (
          <section className="mt-5 rounded-2xl px-5 py-4 sm:px-6" style={card} aria-label="스쿼드">
            <h2 className="text-[15px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
              스쿼드
            </h2>
            <div className="mt-2 flex flex-col gap-2.5">
              {squad.map((group) => (
                <div key={group.position} className="flex gap-2">
                  <span
                    className="w-[64px] shrink-0 pt-0.5 text-[11.5px] font-extrabold"
                    style={{ color: "var(--wc-mute)" }}
                  >
                    {group.label}
                  </span>
                  <p
                    className="flex-1 text-[13px] leading-relaxed"
                    style={{ color: "var(--wc-ink)" }}
                  >
                    {group.players.map((p) => p.nameKo).join(" · ")}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── 댓글 — 시즌 문서의 상주 수다방 (앵커 포스트 경유) ── */}
        <section className="mt-6" aria-label="댓글">
          <CommentSection postId={saga.anchor_post_id} />
        </section>
      </main>
    </div>
  )
}
