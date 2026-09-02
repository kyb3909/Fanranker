import type { Metadata } from "next"
import Link from "next/link"
import { loadDashboardData } from "./_dashboard/data"
import {
  MiniNewsDeck,
  Widget,
  StatusBoard,
  PreviewList,
  SquadReviewList,
  BlockedPlayerRegisterList,
  ParticipationPanel,
  TickerModPanel,
  RefreshButton,
  WINE,
  type StatusRow,
} from "./_dashboard/widgets"

/**
 * 관제실 — 관리자 홈 (2026-08-30 벤토 그리드 시안 이식).
 *
 * 운영자 요구가 그대로 배치 순서다:
 *  1행 운영 전황(전 항목 상시 표시) + 오늘의 참여 + 신고·문의 미리보기 — "이게 가장 중요"
 *  2행 뉴스 검수 풀폭 — 좌우 키 스킵, P/R 5초 유예 커밋
 *  3행 선수 이름 등록 대기 → 스쿼드 검수 백로그 (운영자 지정 순서)
 * 화면 전체 활용(max-width 없음), 0건도 숨기지 않는다 — "오류 있는지 없는지 자체가 정보".
 */

export const metadata: Metadata = { title: "관리자 대시보드" }
export const dynamic = "force-dynamic"

export default async function AdminDashboardPage() {
  const d = await loadDashboardData()
  const syncAgo = d.betman.lastCheckedAt
    ? `${Math.max(1, Math.round((Date.now() - new Date(d.betman.lastCheckedAt).getTime()) / 60000))}분 전`
    : "기록 없음"
  // 전황판 — 전 항목 항상 표시. 정상=초록 흐림, 이상=빨강 굵음+이동 링크
  const statusRows: StatusRow[] = [
    {
      label: "신고",
      value: `${d.reportsPending}건`,
      ok: d.reportsPending === 0,
      action: "처리",
      href: "/admin/content/reports",
    },
    {
      label: "문의",
      value: `${d.inquiriesOpen}건`,
      ok: d.inquiriesOpen === 0,
      note: "접수 경로 미배선",
    },
    {
      label: "뉴스 오류 제보",
      value: `${d.newsErrorReports}건`,
      ok: d.newsErrorReports === 0,
      action: "확인",
      href: "/admin/news-review",
    },
    {
      label: "베트맨 동기화",
      value: d.betman.status === "ok" ? `정상 (${syncAgo})` : `지연 (${syncAgo})`,
      ok: d.betman.status === "ok",
      action: "점검",
      href: "/admin/operations",
    },
    {
      /* "미정산"은 운영자도 못 알아들은 내부어 — 풀어쓴다. 경기 수 + 걸린 예측 수가
         진짜 심각도다 (예측 0건이면 유저 피해 없음 = 동기화 지연 관찰 중) */
      label: "경기 결과 대기",
      value:
        d.betman.unsettled === 0
          ? "0경기"
          : `${d.betman.unsettled}경기 · 걸린 예측 ${d.betman.waitingPredictions}건`,
      ok: d.betman.unsettled === 0,
      action: "결과 확인",
      href: "/admin/matches",
      detail: d.betman.unsettledMatches,
    },
    {
      label: "환불 대기",
      value: `${d.betman.refundsPending}건`,
      ok: d.betman.refundsPending === 0,
      action: "환불",
      href: "/admin/refunds",
    },
    {
      label: "사가 검수",
      value: `${d.sagaPending}건`,
      ok: d.sagaPending === 0,
      action: "검수",
      href: "/admin/saga-review",
    },
    {
      label: "메타버스 신고",
      value: `${d.metaverseReports}건`,
      ok: d.metaverseReports === 0,
      action: "처리",
      href: "/admin/content/metaverse-reports",
    },
    {
      label: "선수 이름 등록 대기",
      value: `${d.dictCandidates}건`,
      ok: d.dictCandidates === 0,
      action: "승인",
      href: "/admin/news-review",
    },
    {
      /* 2026-08-30 신설 → 2026-09-02 역할 변경. 베트맨×LFA 스코어가 다르면 여기 빨간불 +
         디스코드 알림. **정산은 막지 않는다** — 지급 기준은 betman 이고, 어긋남이 진짜면
         사람이 사후 정정한다 (운영자: "결과가 다르게 나온 것 같다는 것만 어드민에서 표시만"). */
      label: "결과 교차검증",
      value:
        d.resultMismatches === 0
          ? "최근 48h 불일치 0건"
          : `최근 48h 불일치 ${d.resultMismatches}건 · 확인 필요`,
      ok: d.resultMismatches === 0,
      action: "확인",
      href: "/admin/matches",
    },
    {
      /* 2026-09-02 신설 — 리포트 파이프라인은 fail-closed 라(틀린 리포트 < 없는 리포트) 실패가
         조용하다. 7일간 대상 23경기 중 10개만 리포트였고 나머지는 이유가 어디에도 없었다.
         이제 게이트마다 실패 원장(match_report_attempts)에 사유가 남고, 여기 사유별로 센다.
         빨간불 = 최근 48h 대상 경기 중 리포트가 안 나온 게 있다. 검증 강도는 그대로다. */
      label: "경기 리포트",
      value:
        d.reportGaps.games === 0
          ? "미생성 0건"
          : `미생성 ${d.reportGaps.games}건 · ${d.reportGaps.reasons
              .slice(0, 3)
              .map((r) => `${r.stage} ${r.n}`)
              .join(" · ")}`,
      ok: d.reportGaps.games === 0,
      action: "확인",
      href: "/admin/matches",
    },
    {
      label: "크롤러 실패 (오늘)",
      value: `${d.crawlerFailsToday}건`,
      ok: d.crawlerFailsToday === 0,
      action: "로그",
      href: "/admin/operations",
    },
    {
      label: "티커 수집",
      value:
        d.ticker.count24h > 0
          ? `24h ${d.ticker.count24h}건 · ${
              d.ticker.lastAt
                ? `${Math.max(1, Math.round((Date.now() - new Date(d.ticker.lastAt).getTime()) / 60000))}분 전`
                : ""
            }`
          : "24시간째 수집 없음",
      ok: d.ticker.count24h > 0, // VPS 크롤러가 유일 공급로 — 마르면 담벼락 티커가 죽는다
      action: "점검",
      href: "/admin/content/ticker",
    },
  ]
  return (
    <main id="main-content" tabIndex={-1} className="w-full px-6 py-5 2xl:px-8">
      {/* 헤더 정보줄 — 진행 경기·회차·마감 + 베트맨 동기화 상태. 스크롤 비용 0 */}
      <div className="mb-5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-xl font-extrabold tracking-tight">관제실</h1>
        <p className="text-muted-foreground text-xs">
          진행 중 경기 <b className="text-foreground tabular-nums">{d.activeGames}</b>
          {d.dailyRound.roundNum != null && (
            <>
              {" · "}회차 <b className="text-foreground tabular-nums">{d.dailyRound.roundNum}</b>
              {d.dailyRound.closeAt && (
                <>
                  {" "}
                  (마감{" "}
                  {new Date(d.dailyRound.closeAt).toLocaleTimeString("ko-KR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  )
                </>
              )}
            </>
          )}
        </p>
        <p className="text-muted-foreground ml-auto text-xs">
          베트맨 동기화 {d.betman.status === "ok" ? `정상 · ${syncAgo}` : "⚠️ 점검 필요"}
        </p>
        <RefreshButton />
      </div>

      {/* ── 1행 (첫 화면): 운영 전황 + 참여도 + 신고·문의 — 운영자: "이게 가장 중요" ── */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="flex flex-col gap-5 xl:col-span-4">
          <StatusBoard rows={statusRows} />
          <TickerModPanel items={d.ticker.recent} />
        </div>

        <div className="flex flex-col gap-5 xl:col-span-8">
          <ParticipationPanel rows={d.participation} />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Widget kicker="REPORTS" title="신고" count={d.reportsPending}>
              <PreviewList
                rows={d.reportsPreview.map((r) => ({
                  primary: `[${r.targetType}] ${r.reason}`,
                  secondary: new Date(r.createdAt).toLocaleDateString("ko-KR"),
                }))}
                empty="미처리 신고 0건 — 들어오면 최신 5건이 여기 보입니다"
                action="처리"
                actionHref="/admin/content/reports"
              />
            </Widget>
            <Widget kicker="INQUIRIES" title="문의" count={d.inquiriesOpen}>
              <PreviewList
                rows={[]}
                empty="문의 0건 — ⚠️ 접수 경로가 아직 미배선입니다 (inquiries 테이블만 존재)"
              />
            </Widget>
          </div>
        </div>
      </div>

      {/* ── 2행: 뉴스 검수 — 원문·초안 2열, P/R 5초 유예 커밋, 좌우 키 스킵 ── */}
      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-12">
        <Widget
          kicker="NEWS DESK"
          title="뉴스 검수"
          count={d.newsTotal}
          className="xl:col-span-12"
          tone={d.news.some((n) => n.breaking) ? "danger" : "default"}
          headerRight={
            <Link href="/admin/news-review" className="text-muted-foreground text-[11px] underline">
              검수 페이지 (편집·사가 연결) →
            </Link>
          }
        >
          <MiniNewsDeck items={d.news} />
        </Widget>
      </div>

      {/* ── 3행: 선수 이름 등록 대기 → 스쿼드 검수 백로그 (운영자 지정 순서) ── */}
      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-12">
        <Widget
          kicker="NOTATION"
          title="선수 이름 등록 대기"
          count={d.dictCandidates}
          className="xl:col-span-6"
          tone={d.dictCandidates > 0 ? "danger" : "default"}
        >
          {/* 무엇을 하라는 패널인지 첫 줄에 못박는다 (운영자: "뭘 어쩌라는 건지 모르겠어") */}
          <p className="text-muted-foreground mb-2 text-xs leading-relaxed">
            사전에 없는 선수 이름에 걸려 <b>사가로 못 들어간 소식</b>들입니다. 한글 표기를 확인하고{" "}
            <b>등재</b>를 누르면 그 선수의 소식이 15분 안에 자동으로 풀립니다. 행에 마우스를 올리면
            근거 기사 제목이 보입니다.
          </p>
          <BlockedPlayerRegisterList rows={d.blockedPlayers} />
          {d.blockedUnparsed > 0 && (
            <p className="mt-2 rounded bg-amber-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              ⚠️ 그 외 <b className="tabular-nums">{d.blockedUnparsed}</b>건은 이름 추출 자체가
              실패한 잔여물 — 표기 등록으로는 안 풀립니다. 일괄 정리가 따로 필요합니다.
            </p>
          )}
          <Link
            href="/admin/news-review"
            className="mt-2 self-start text-[11px] font-bold underline"
            style={{ color: WINE }}
          >
            등록 화면 열기 →
          </Link>
        </Widget>

        <Widget
          kicker="SQUAD"
          title="스쿼드 검수 백로그"
          count={d.squadBacklog}
          className="xl:col-span-6"
          headerRight={
            <span className="text-muted-foreground text-[11px]">마감 없음 — 틈날 때 한 줄씩</span>
          }
        >
          {/* 초안이 입력칸 — 고치고 싶으면 그 자리에서 고친 뒤 승인 (Enter = 승인) */}
          <SquadReviewList rows={d.squadPreview} />
          <Link
            href="/admin/team-squads"
            className="mt-2 self-start text-[11px] font-bold underline"
            style={{ color: WINE }}
          >
            선수단 사전 전체 열기 →
          </Link>
        </Widget>
      </div>
    </main>
  )
}
