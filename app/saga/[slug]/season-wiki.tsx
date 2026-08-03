import Link from "@/components/ui/app-link"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { CommentSection } from "@/components/post-detail/comment-section"
import { STAGE_LABEL } from "@/lib/saga/stages"
import {
  loadSquad,
  fetchStanding,
  fetchMatches,
  fetchTeamChronicle,
  seasonStartIso,
  type SeasonSubject,
  type ChronicleEvent,
} from "@/lib/saga/season"

/**
 * 팀 시즌 위키 (saga_type='season') — 실록 구조 (2026-08-04 운영자: "세종실록
 * 써 내려가듯이, 사료를 모아 시간순으로").
 *
 * 본문 = **연대기 하나**. 경기 결과·이적 사가 엔트리가 사료로서 날짜순 세로
 * 레일에 쌓여 내려간다. 순위·다음 경기는 헤더 요약, 스쿼드는 말미 부록.
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

function kstDateLabel(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000)
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`
}

const card: React.CSSProperties = {
  background: "var(--wc-card, #fff)",
  boxShadow: "var(--wc-shadow-1)",
}

const TIER_COLOR: Record<string, string> = {
  official: "#0E7A3C",
  tier1: "var(--wc-burgundy)",
  rumor: "#946A12",
}

export async function SeasonWiki({ saga }: { saga: SeasonSagaRow }) {
  const supabase = createServiceRoleClient()
  const subject = saga.subject
  const aliases = subject.aliases ?? [subject.team_kr]
  const teamNames = new Set(aliases)

  const [standing, matches] = await Promise.all([
    fetchStanding(supabase, subject.team_kr),
    fetchMatches(supabase, aliases, subject.season),
  ])
  const chronicle = await fetchTeamChronicle(supabase, saga.id, aliases, subject.season, matches)
  const upcoming = matches
    .filter((m) => m.status !== "completed")
    .sort((a, b) => a.matchTime.localeCompare(b.matchTime))[0]
  const standingIsLastSeason =
    !!standing && new Date(standing.fetchedAt) < new Date(seasonStartIso(subject.season))
  const squad = loadSquad(subject.team_fpl)

  return (
    <div className="worldcup-scope min-h-[100dvh]" style={{ background: "var(--wc-paper)" }}>
      <main className="mx-auto max-w-[760px] px-4 pt-6 pb-16 sm:px-6">
        {/* ── 헤더: 팀 + 시즌 + 순위·다음 경기 요약 ── */}
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
                {standingIsLastSeason
                  ? "지난 시즌 최종 — 개막 후 자동 갱신"
                  : `기준 ${fmtDate(standing.fetchedAt)}`}
              </span>
            </div>
          )}
          {upcoming && (
            <p className="mt-1.5 text-[13px]" style={{ color: "var(--wc-mute)" }}>
              다음 경기 · {fmtDate(upcoming.matchTime)} {upcoming.home} vs {upcoming.away}
              {upcoming.leagueCode ? ` (${upcoming.leagueCode})` : ""}
            </p>
          )}
        </header>

        {/* ── 연대기 — 실록: 사료(경기·이적 소식)가 시간순으로 쌓여 내려간다 ── */}
        <section className="mt-6" aria-label="연대기">
          <h2 className="mb-3 text-[15px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
            연대기 <span style={{ color: "var(--wc-mute)" }}>{chronicle.length}</span>
          </h2>

          {chronicle.length === 0 ? (
            <p
              className="rounded-xl px-5 py-8 text-center text-[13.5px]"
              style={{ ...card, color: "var(--wc-mute)" }}
            >
              아직 기록된 사료가 없습니다 — 경기가 열리고 이적 소식이 붙는 대로 이 연대기가 써
              내려갑니다. (EPL 개막 8월 22일)
            </p>
          ) : (
            <div className="relative">
              <span
                className="absolute top-2 bottom-2 left-[7px] w-0.5 rounded-full"
                style={{ background: "var(--wc-line)" }}
                aria-hidden
              />
              <div className="flex flex-col gap-3">
                {chronicle.map((ev, i) => {
                  const showDate =
                    i === 0 ||
                    kstDateLabel(chronicle[i - 1].occurredAt) !== kstDateLabel(ev.occurredAt)
                  return (
                    <div key={i} className="relative pl-7">
                      <span
                        className="absolute top-[26px] left-0 h-4 w-4 rounded-full border-2"
                        style={{
                          borderColor:
                            ev.kind === "match"
                              ? "var(--wc-ink-2, #494d56)"
                              : ev.kind === "transfer"
                                ? (TIER_COLOR[ev.tier] ?? "var(--wc-mute)")
                                : "var(--wc-mute)",
                          background:
                            ev.kind === "transfer" && ev.tier === "official"
                              ? TIER_COLOR.official
                              : "var(--wc-card, #fff)",
                        }}
                        aria-hidden
                      />
                      {showDate && (
                        <p
                          className="mb-1.5 text-[12px] font-extrabold tracking-wide"
                          style={{ color: "var(--wc-mute)" }}
                        >
                          {kstDateLabel(ev.occurredAt)}
                        </p>
                      )}

                      {ev.kind === "match" ? (
                        <MatchEvent ev={ev} teamNames={teamNames} />
                      ) : ev.kind === "transfer" ? (
                        <TransferEvent ev={ev} />
                      ) : (
                        <ArticleEvent ev={ev} />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </section>

        {/* ── 부록: 스쿼드 ── */}
        {squad.length > 0 && (
          <section className="mt-8 rounded-2xl px-5 py-4 sm:px-6" style={card} aria-label="스쿼드">
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

function MatchEvent({
  ev,
  teamNames,
}: {
  ev: Extract<ChronicleEvent, { kind: "match" }>
  teamNames: Set<string>
}) {
  const m = ev.match
  const isHome = teamNames.has(m.home)
  const our = isHome ? m.homeScore : m.awayScore
  const their = isHome ? m.awayScore : m.homeScore
  const wdl =
    our !== null && their !== null ? (our > their ? "승" : our < their ? "패" : "무") : null
  return (
    <article className="rounded-xl px-4 py-3" style={card}>
      <div className="flex items-center gap-2 text-[13.5px]">
        {wdl && (
          <span
            className="shrink-0 rounded px-1.5 py-0.5 text-[11.5px] font-extrabold"
            style={{
              background: "rgba(0,0,0,.05)",
              color:
                wdl === "승" ? "#0E7A3C" : wdl === "패" ? "var(--wc-burgundy)" : "var(--wc-mute)",
            }}
          >
            {wdl}
          </span>
        )}
        <span className="font-semibold" style={{ color: "var(--wc-ink)" }}>
          {m.home}{" "}
          <b className="tabular-nums">
            {m.homeScore} : {m.awayScore}
          </b>{" "}
          {m.away}
        </span>
        <span className="ml-auto shrink-0 text-[11.5px]" style={{ color: "var(--wc-mute)" }}>
          {m.leagueCode ?? ""}
        </span>
      </div>
    </article>
  )
}

function ArticleEvent({ ev }: { ev: Extract<ChronicleEvent, { kind: "article" }> }) {
  return (
    <Link href={`/post/${ev.postId}?utm_source=season_wiki`} className="block">
      <article className="rounded-xl px-4 py-3 transition-shadow hover:shadow-md" style={card}>
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-[12px]">📰</span>
          <p
            className="min-w-0 flex-1 text-[13.5px] font-semibold"
            style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
          >
            {ev.title}
          </p>
        </div>
      </article>
    </Link>
  )
}

function TransferEvent({ ev }: { ev: Extract<ChronicleEvent, { kind: "transfer" }> }) {
  return (
    <Link href={`/saga/${ev.sagaSlug}`} className="block">
      <article className="rounded-xl px-4 py-3 transition-shadow hover:shadow-md" style={card}>
        <div className="flex items-center gap-2 text-[11.5px] font-bold">
          <span style={{ color: TIER_COLOR[ev.tier] ?? "var(--wc-mute)" }}>
            {ev.tier === "official" ? "오피셜" : ev.tier === "tier1" ? "티어1" : "루머"}
          </span>
          {ev.stageAfter && (
            <span
              className="rounded px-1 py-px"
              style={{ background: "rgba(139,30,63,.07)", color: "var(--wc-burgundy)" }}
            >
              → {STAGE_LABEL[ev.stageAfter] ?? ev.stageAfter}
            </span>
          )}
          <span className="ml-auto truncate" style={{ color: "var(--wc-mute)" }}>
            {ev.sagaTitle}
          </span>
        </div>
        <p
          className="mt-1 text-[13.5px] font-semibold"
          style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
        >
          {ev.headline}
        </p>
      </article>
    </Link>
  )
}
