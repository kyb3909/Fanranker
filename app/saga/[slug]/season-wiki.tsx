import Link from "@/components/ui/app-link"
import { PageBand, PageBandStat } from "@/components/page-band"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { CommentSection } from "@/components/post-detail/comment-section"
import { STAGE_LABEL } from "@/lib/saga/stages"
import {
  NEUTRAL_CHIP_STYLE,
  TIER_CHIP_BASE,
  tierChipStyle,
  type SagaTier,
} from "@/components/saga/tier-chip"
import { RAIL_BODY_BORDER, RAIL_GRID, RailDate, groupByDay } from "@/components/saga/rail"
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

const card: React.CSSProperties = {
  background: "var(--wc-card, #fff)",
  boxShadow: "var(--wc-shadow-1)",
}

/* TIER_COLOR(초록·버건디·금색)는 2026-08-18 리디자인이 버린 팔레트인데 선언만 남아
   있었다. 죽은 색표가 파일에 남아 있으면 다음 사람이 거기서 베낀다 — 실제로 이적 사가
   상세가 같은 색을 쓰고 있었다. 삭제. 등급 색은 components/saga/tier-chip 하나뿐이다. */

function EVENT_LABEL(ev: ChronicleEvent): string {
  if (ev.kind === "match" || ev.kind === "entry") return "경기"
  if (ev.kind === "article") return "기사"
  return ev.tier === "official" ? "오피셜" : ev.tier === "tier1" ? "유력" : "이적설"
}

/** 등급 사다리는 components/saga/tier-chip 이 정본 — 여기서 색을 새로 만들지 않는다 */
function EventChip({ ev }: { ev: ChronicleEvent }) {
  const style = ev.kind === "transfer" ? tierChipStyle(ev.tier as SagaTier) : NEUTRAL_CHIP_STYLE
  return (
    <span className={TIER_CHIP_BASE} style={style}>
      {EVENT_LABEL(ev)}
    </span>
  )
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

  // 헤더 요약 한 줄 — 밴드의 description 슬롯으로 들어간다
  const headline =
    !seasonOver && standing && standing.played === 0 && !standingIsLastSeason
      ? "개막 전 — 순위는 첫 라운드 후 표시됩니다"
      : !seasonOver && standing
        ? `리그 ${standing.rank}위 · ${standing.played}경기 ${standing.win}승 ${standing.draw}무 ${standing.loss}패 · 승점 ${standing.points}` +
          (standingIsLastSeason ? " (지난 시즌 최종 — 개막 후 자동 갱신)" : "")
        : null
  const upcomingLine = upcoming
    ? `다음 경기 · ${fmtDate(upcoming.matchTime)} ${upcoming.home} ${upcoming.away}`
    : null

  return (
    <div className="min-h-[100dvh]" style={{ background: "var(--wc-paper)" }}>
      {/* ── 페이지 선언: 공용 다크 밴드 (2026-08-18 리디자인 1단계).
          흰 헤더 카드로 시작하면 페이지가 "시작"하지 않는다 — 사이트에서 밴드를 쓰는
          페이지가 11곳인데 사가·매치만 빠져 있던 것이 불일치의 1순위 원인이었다.
          h1 은 페이지에 하나 — 밴드가 가져간다. */}
      <PageBand
        kicker={`Season Wiki ${subject.season}`}
        title={saga.title}
        description={[headline, upcomingLine].filter(Boolean).join("  ·  ") || undefined}
        aside={<PageBandStat value={chronicle.length} label="CHRONICLE" />}
      />

      <main className="mx-auto max-w-[720px] px-4 pt-8 pb-16 sm:px-6">
        {/* ── 연대기 — 실록: 사료(경기·이적 소식)가 시간순으로 쌓여 내려간다 ── */}
        <section aria-label="연대기">
          {chronicle.length === 0 ? (
            <p
              className="rounded-xl px-5 py-8 text-center text-[13px]"
              style={{ ...card, color: "var(--wc-mute)" }}
            >
              아직 기록된 사료가 없습니다 — 경기가 열리고 이적 소식이 붙는 대로 이 연대기가 써
              내려갑니다. (EPL 개막 8월 22일)
            </p>
          ) : (
            /* 날짜 레일 (2026-08-18 리디자인 2단계).
             *
             * 직전의 좌우 지그재그를 되돌린다 — 목적("일이 너무 많다")은 맞았지만 수단이
             * 역효과였다. 실측: 반폭이 되자 헤드라인이 3줄로 흘러 6항목 804px(항목당 134px),
             * 날짜 레일 단일 칼럼은 같은 6항목이 ~340px. 화면 절반이 비는데 세로는 그대로였다.
             *
             * 왼쪽 92px 레일에 날짜를 한 번만 찍고, 같은 날 사료는 오른쪽에 붙여 한 덩어리로
             * 읽게 한다. 유채 테두리·배경 틴트·도트는 전부 제거 — 등급은 칩 채움이 말한다. */
            <div className="flex flex-col">
              {groupByDay(chronicle, (ev) => ev.occurredAt).map((day, di) => {
                /* 같은 날 같은 사가가 연달아 나오면 사가명을 한 번만 찍는다.
                   "브루노 기마랑이스 이적 사가" 가 줄마다 똑같이 반복되던 것이 이 지면
                   잡음의 최대 원인이었다. 하루 안에서만 접는다 — 날이 바뀌면 다시
                   보여줘야 중간부터 읽는 사람이 맥락을 잃지 않는다. */
                let prevSaga: string | null = null
                return (
                  <div
                    key={day.key}
                    className={RAIL_GRID}
                    style={di > 0 ? { marginTop: 20 } : undefined}
                  >
                    <RailDate iso={day.iso} />

                    <div>
                      {day.items.map((ev, i) => {
                        // 경기 사료(경기 결과 + 우리가 쓴 경기 리포트)만 배경으로 띄운다
                        const isMatchLike = ev.kind === "match" || ev.kind === "entry"
                        const showSaga = ev.kind === "transfer" ? ev.sagaTitle !== prevSaga : true
                        prevSaga = ev.kind === "transfer" ? ev.sagaTitle : null
                        const chip = <EventChip ev={ev} />
                        return (
                          <div
                            key={i}
                            className="py-3 pl-4 sm:pl-6"
                            style={{
                              ...RAIL_BODY_BORDER,
                              /* 경기 사료만 옅은 와인 틴트로 띄운다 (2026-08-25 운영자:
                                 "경기 관련한 것만 하이라이트 — 아주 옅게, 룩앤필 살리는 방향").
                                 ⚠️ 한쪽 면 액센트 보더는 영구 금지 패턴이라 **배경 틴트**로만
                                    위계를 만든다 (app/a-tokens.css 상단 규약).
                                 ⚠️ --wc-wine-tint(#fbf2f4)는 사이트가 이미 쓰는 와인 faint fill
                                    이다. 새 색을 만들지 않고 그걸 그대로 쓴다.
                                 우측으로 살짝 넘겨 칠해 레일 옆 띠처럼 읽히게 한다. */
                              ...(isMatchLike
                                ? {
                                    background: "var(--wc-wine-tint)",
                                    marginRight: -8,
                                    paddingRight: 8,
                                  }
                                : null),
                            }}
                          >
                            {ev.kind === "match" ? (
                              <MatchEvent ev={ev} teamNames={teamNames} chip={chip} />
                            ) : ev.kind === "transfer" ? (
                              <TransferEvent ev={ev} chip={chip} showSaga={showSaga} />
                            ) : ev.kind === "entry" ? (
                              <EntryEvent ev={ev} chip={chip} />
                            ) : (
                              <ArticleEvent ev={ev} chip={chip} />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* ── 부록: 스쿼드 — 등번호 칩 + 포지션별 그리드 (2026-08-17 운영자:
            "스쿼드 피드를 활용해 선수단 명단을 제대로") ── */}
        {squad.length > 0 && (
          <section className="mt-8 rounded-2xl px-5 py-4 sm:px-6" style={card} aria-label="스쿼드">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[16px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
                스쿼드{" "}
                <span className="gn-num text-[12px]" style={{ color: "var(--wc-mute)" }}>
                  {squad.reduce((n, g) => n + g.players.length, 0)}
                </span>
              </h2>
              {dbSquad?.coach && (
                <span className="text-[12px]" style={{ color: "var(--wc-mute)" }}>
                  감독 <b style={{ color: "var(--wc-ink)" }}>{dbSquad.coach}</b>
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-col gap-4">
              {squad.map((group) => (
                <div key={group.position}>
                  <p
                    className="text-[12px] font-extrabold"
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
                          className="gn-num grid h-[19px] w-[19px] shrink-0 place-items-center rounded-full text-[12px] font-extrabold"
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

/**
 * 사료 하나 = 두 줄이 최대다.
 *
 * 종전엔 칩이 자기 줄을 통째로 먹어서 이적 사료 하나가 **세 줄**이었다
 * (칩 / 단계+사가명 / 헤드라인). 내용 한 줄에 껍데기 두 줄이다.
 * 칩을 첫 줄 맨 앞으로 넣어 한 줄을 없앤다 — 사료 89건이면 약 1,800px 이 줄어든다.
 */
function MatchEvent({
  ev,
  teamNames,
  chip,
}: {
  ev: Extract<ChronicleEvent, { kind: "match" }>
  teamNames: Set<string>
  chip: React.ReactNode
}) {
  const m = ev.match
  const isHome = teamNames.has(m.home)
  const our = isHome ? m.homeScore : m.awayScore
  const their = isHome ? m.awayScore : m.homeScore
  const wdl =
    our !== null && their !== null ? (our > their ? "승" : our < their ? "패" : "무") : null
  // 카드 껍데기 없음 — 레일이 이미 지면을 나눈다 (카드 안 카드 금지)
  return (
    <div className="flex items-center gap-2 text-[16px]">
      {chip}
      {wdl && (
        <span
          className="grid h-[17px] w-[17px] shrink-0 place-items-center rounded-full text-[12px] font-extrabold"
          style={{
            background: wdl === "승" ? "#2f7d5b1a" : wdl === "패" ? "#c2352f1a" : "var(--wc-soft)",
            color: wdl === "승" ? "#2f7d5b" : wdl === "패" ? "#c2352f" : "var(--wc-mute)",
          }}
        >
          {wdl}
        </span>
      )}
      <span className="min-w-0 font-bold" style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}>
        {m.home}
        <b className="gn-num mx-1.5">
          {m.homeScore}–{m.awayScore}
        </b>
        {m.away}
      </span>
      <span className="ml-auto shrink-0 text-[12px]" style={{ color: "var(--wc-mute-2)" }}>
        {m.leagueCode ?? ""}
      </span>
    </div>
  )
}

/**
 * 시즌 문서 자신의 엔트리 = 경기 카드 (D17 리뷰 카드).
 * "경기 리포트"를 누르면 카드 안에서 우리 리포트가 펼쳐진다 — 외부 링크로 내보내지
 * 않는다 (2026-08-07 오너: "원래 링크로 가는 것이 아니라 경기 리포트를 작성해줘야해").
 * 소커웨이는 하단 보조 출처 링크로만.
 */
function EntryEvent({
  ev,
  chip,
}: {
  ev: Extract<ChronicleEvent, { kind: "entry" }>
  chip: React.ReactNode
}) {
  const paragraphs = (ev.summary ?? "").split(/\n{2,}/).filter((p) => p.trim())
  // 엔트리 종류에 맞는 접힘 라벨 — 인터뷰 카드에 "경기 리포트"라고 적혀 있었다 (QA ISSUE-002)
  const label = ev.headline.startsWith("[인터뷰]") ? "인터뷰" : "경기 리포트"
  return (
    <div>
      <p
        className="text-[16px] leading-[1.45] font-bold"
        style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
      >
        {/* 붙일 메타가 없는 사료는 칩을 헤드라인 앞에 인라인으로 물린다 */}
        <span className="mr-1.5">{chip}</span>
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
                className="self-start text-[12px] underline underline-offset-2"
                style={{ color: "var(--wc-mute)" }}
              >
                원본 데이터 (Soccerway) ↗
              </a>
            )}
          </div>
        </details>
      )}
    </div>
  )
}

function ArticleEvent({
  ev,
  chip,
}: {
  ev: Extract<ChronicleEvent, { kind: "article" }>
  chip: React.ReactNode
}) {
  return (
    <Link href={`/post/${ev.postId}?utm_source=season_wiki`} className="block no-underline">
      <p
        className="text-[16px] leading-[1.45] font-bold"
        style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
      >
        <span className="mr-1.5">{chip}</span>
        {ev.title}
      </p>
    </Link>
  )
}

function TransferEvent({
  ev,
  chip,
  showSaga,
}: {
  ev: Extract<ChronicleEvent, { kind: "transfer" }>
  chip: React.ReactNode
  showSaga: boolean
}) {
  const stageLabel = ev.stageAfter ? (STAGE_LABEL[ev.stageAfter] ?? ev.stageAfter) : null
  /* 칩과 단계가 같은 말을 하는 경우가 있다 — 오피셜 사료는 칩도 "오피셜", 단계도
     "오피셜" 이라 같은 단어가 나란히 두 번 찍혔다. 다를 때만 단계를 쓴다. */
  const showStage = !!stageLabel && stageLabel !== EVENT_LABEL(ev)
  const hasMeta = showStage || showSaga
  return (
    <Link href={`/saga/${ev.sagaSlug}`} className="block no-underline">
      {/* 등급은 칩이 이미 말한다 — 여기선 사가명과 현재 단계만.
          "루머 → 제안" 처럼 전이를 병기하면 무엇이 지금인지 안 읽힌다 */}
      {hasMeta && (
        <div className="flex min-w-0 items-center gap-2 text-[12px]">
          {chip}
          {showStage && (
            <span className="shrink-0 font-bold" style={{ color: "var(--wc-burgundy)" }}>
              {stageLabel}
            </span>
          )}
          {showSaga && (
            <span className="min-w-0 truncate" style={{ color: "var(--wc-mute-2)" }}>
              {ev.sagaTitle}
            </span>
          )}
        </div>
      )}
      <p
        className="text-[16px] leading-[1.45] font-bold"
        style={{
          color: "var(--wc-ink)",
          wordBreak: "keep-all",
          ...(hasMeta ? { marginTop: 4 } : null),
        }}
      >
        {/* 앞줄과 같은 사가라 메타를 접은 줄 — 칩만 헤드라인 앞에 물린다 */}
        {!hasMeta && <span className="mr-1.5">{chip}</span>}
        {ev.headline}
      </p>
    </Link>
  )
}
