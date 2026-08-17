import Link from "@/components/ui/app-link"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { CommentSection } from "@/components/post-detail/comment-section"
import { STAGE_LABEL } from "@/lib/saga/stages"
import {
  loadSquad,
  loadSquadFromDb,
  fetchStanding,
  fetchMatches,
  fetchTeamChronicle,
  seasonStartIso,
  seasonEndIso,
  type SeasonSubject,
  type ChronicleEvent,
  type SquadGroup,
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

/**
 * 사료 종류별 색 — 테두리·배지가 같은 색을 쓴다 (2026-08-17 운영자: "박스 테두리로
 * 무슨 뉴스인지 표시"). 이적은 티어별로 갈라 오피셜/유력/루머가 한눈에 구분된다.
 * ⚠️ 좌측 액센트 바(border-left 3px)는 영구 금지 규칙이라 **사방 테두리**로 구현한다.
 */
function EVENT_COLOR(ev: ChronicleEvent): string {
  if (ev.kind === "match") return "#3B5BA5" // 경기 = 블루
  if (ev.kind === "entry") return "#3B5BA5" // 경기 리뷰 카드도 경기 계열
  if (ev.kind === "transfer") return TIER_COLOR[ev.tier] ?? "var(--wc-mute)"
  return "#6B5B8A" // 기사 = 퍼플
}

function EVENT_LABEL(ev: ChronicleEvent): string {
  if (ev.kind === "match" || ev.kind === "entry") return "경기"
  if (ev.kind === "article") return "기사"
  return ev.tier === "official" ? "오피셜" : ev.tier === "tier1" ? "유력" : "이적설"
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
  // 지난 시즌 문서(완결)에는 현재 순위·다음 경기가 무의미 — 헤더 요약 숨김
  const seasonOver = Date.now() >= new Date(seasonEndIso(subject.season)).getTime()
  const upcoming = seasonOver
    ? undefined
    : matches
        .filter((m) => m.status !== "completed")
        .sort((a, b) => a.matchTime.localeCompare(b.matchTime))[0]
  const standingIsLastSeason =
    !!standing && new Date(standing.fetchedAt) < new Date(seasonStartIso(subject.season))
  // team_squads(등번호·감독 보유) 우선, 없으면 fpl 이름 목록으로 폴백
  const dbSquad = await loadSquadFromDb(supabase, subject.team_kr).catch(() => null)
  const squad: SquadGroup[] =
    dbSquad?.groups ??
    loadSquad(subject.team_fpl).map((g) => ({
      position: g.position,
      label: g.label,
      players: g.players.map((p) => ({ name: p.nameKo, number: null })),
    }))

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
          {/* 0경기 현 시즌 테이블의 순위는 순번일 뿐이다 — "리그 14위"로 읽히면 오보 (QA ISSUE-003) */}
          {!seasonOver && standing && standing.played === 0 && !standingIsLastSeason ? (
            <p className="mt-3 text-[13.5px] font-bold" style={{ color: "var(--wc-mute)" }}>
              개막 전 — 순위는 첫 라운드 후 표시됩니다
            </p>
          ) : !seasonOver && standing ? (
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
          ) : null}
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
            /* 좌우 2단 실록 (2026-08-17 운영자: "일이 너무 많으니 좌우로, 칸도 두껍게").
               가운데 레일을 두고 사료가 번갈아 좌우로 붙는다 — 세로 길이가 절반이 되고
               한 칸이 넓어져 요약이 읽힌다. 모바일(<lg)은 단이 하나라 기존과 같다. */
            <div className="relative">
              <span
                className="absolute top-2 bottom-2 left-[7px] w-0.5 rounded-full lg:left-1/2 lg:-translate-x-1/2"
                style={{ background: "var(--wc-line)" }}
                aria-hidden
              />
              <div className="flex flex-col gap-3">
                {chronicle.map((ev, i) => {
                  const showDate =
                    i === 0 ||
                    kstDateLabel(chronicle[i - 1].occurredAt) !== kstDateLabel(ev.occurredAt)
                  const right = i % 2 === 1
                  return (
                    <div
                      key={i}
                      className={`relative pl-7 lg:w-1/2 lg:pl-0 ${
                        right ? "lg:ml-auto lg:pl-8" : "lg:pr-8 lg:text-left"
                      }`}
                    >
                      <span
                        className={`absolute top-[26px] left-0 h-4 w-4 rounded-full border-2 ${
                          right
                            ? "lg:left-0 lg:-translate-x-1/2"
                            : "lg:right-0 lg:left-auto lg:translate-x-1/2"
                        }`}
                        style={{
                          borderColor: EVENT_COLOR(ev),
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

                      {/* 종류를 테두리로 구분 (2026-08-17 운영자) — 좌측 액센트 바가 아니라
                          사방 테두리 + 배지다 (좌측 3px 액센트는 영구 금지 규칙) */}
                      <div
                        className="rounded-xl"
                        style={{
                          border: `1px solid ${EVENT_COLOR(ev)}55`,
                          background: `${EVENT_COLOR(ev)}0a`,
                        }}
                      >
                        <div className="px-3 pt-2">
                          <span
                            className="inline-block rounded-full px-2 py-[1px] text-[10.5px] font-extrabold"
                            style={{ background: `${EVENT_COLOR(ev)}1f`, color: EVENT_COLOR(ev) }}
                          >
                            {EVENT_LABEL(ev)}
                          </span>
                        </div>
                        <div className="px-1 pb-1">
                          {ev.kind === "match" ? (
                            <MatchEvent ev={ev} teamNames={teamNames} />
                          ) : ev.kind === "transfer" ? (
                            <TransferEvent ev={ev} />
                          ) : ev.kind === "entry" ? (
                            <EntryEvent ev={ev} />
                          ) : (
                            <ArticleEvent ev={ev} />
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </section>

        {/* ── 부록: 스쿼드 — 등번호 칩 + 포지션별 그리드 (2026-08-17 운영자:
            "스쿼드 피드를 활용해 선수단 명단을 제대로") ── */}
        {squad.length > 0 && (
          <section className="mt-8 rounded-2xl px-5 py-4 sm:px-6" style={card} aria-label="스쿼드">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[15px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
                스쿼드{" "}
                <span className="gn-num text-[12.5px]" style={{ color: "var(--wc-mute)" }}>
                  {squad.reduce((n, g) => n + g.players.length, 0)}
                </span>
              </h2>
              {dbSquad?.coach && (
                <span className="text-[12.5px]" style={{ color: "var(--wc-mute)" }}>
                  감독 <b style={{ color: "var(--wc-ink)" }}>{dbSquad.coach}</b>
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-col gap-4">
              {squad.map((group) => (
                <div key={group.position}>
                  <p
                    className="text-[11.5px] font-extrabold"
                    style={{ color: "var(--wc-burgundy)", letterSpacing: "0.04em" }}
                  >
                    {group.label}{" "}
                    <span className="gn-num" style={{ color: "var(--wc-mute-2)" }}>
                      {group.players.length}
                    </span>
                  </p>
                  <ul className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
                    {group.players.map((p, i) => (
                      <li key={i} className="flex items-center gap-1.5 text-[13px]">
                        <span
                          className="gn-num grid h-[19px] w-[19px] shrink-0 place-items-center rounded-full text-[10px] font-extrabold"
                          style={{
                            background: "var(--wc-wine-tint)",
                            color: "var(--wc-burgundy)",
                          }}
                        >
                          {p.number ?? "·"}
                        </span>
                        <span
                          className="truncate"
                          style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
                        >
                          {p.name}
                        </span>
                      </li>
                    ))}
                  </ul>
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

/**
 * 시즌 문서 자신의 엔트리 = 경기 카드 (D17 리뷰 카드).
 * "경기 리포트"를 누르면 카드 안에서 우리 리포트가 펼쳐진다 — 외부 링크로 내보내지
 * 않는다 (2026-08-07 오너: "원래 링크로 가는 것이 아니라 경기 리포트를 작성해줘야해").
 * 소커웨이는 하단 보조 출처 링크로만.
 */
function EntryEvent({ ev }: { ev: Extract<ChronicleEvent, { kind: "entry" }> }) {
  const paragraphs = (ev.summary ?? "").split(/\n{2,}/).filter((p) => p.trim())
  // 엔트리 종류에 맞는 접힘 라벨 — 인터뷰 카드에 "경기 리포트"라고 적혀 있었다 (QA ISSUE-002)
  const label = ev.headline.startsWith("[인터뷰]") ? "인터뷰" : "경기 리포트"
  return (
    <article className="rounded-xl px-4 py-3" style={card}>
      <p
        className="text-[13.5px] font-semibold"
        style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
      >
        {ev.headline}
      </p>
      {paragraphs.length > 0 && (
        <details className="group mt-1.5">
          <summary
            className="cursor-pointer list-none text-[12px] font-bold select-none"
            style={{ color: "var(--wc-burgundy)" }}
          >
            <span className="group-open:hidden">{label} 펼치기</span>
            <span className="hidden group-open:inline">{label} 접기</span>
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {paragraphs.map((p, i) => (
              <p
                key={i}
                className="text-[13px] leading-relaxed"
                style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
              >
                {p.trim()}
              </p>
            ))}
            {ev.url && (
              <a
                href={ev.url}
                target="_blank"
                rel="noreferrer nofollow"
                className="self-start text-[11px] underline underline-offset-2"
                style={{ color: "var(--wc-mute)" }}
              >
                원본 데이터 (Soccerway) ↗
              </a>
            )}
          </div>
        </details>
      )}
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
            {ev.tier === "official" ? "오피셜" : ev.tier === "tier1" ? "유력" : "루머"}
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
