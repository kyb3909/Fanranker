import Link from "next/link"
import { loadDashboardData } from "./data"
import {
  MiniNewsDeck,
  Widget,
  StatusBoard,
  PreviewList,
  SquadReviewList,
  ParticipationPanel,
  TickerModPanel,
  WINE,
  type StatusRow,
} from "./widgets"

/**
 * 시안 B — 「벤토 그리드」 (디자이너 추천안)
 *
 * 동급 위젯 그리드. 뉴스 미니 덱(요약만) + 나머지 큐 위젯. 펼치면 모달.
 * 트레이드오프: 어떤 큐가 불타는지 한눈에 ↔ 뉴스 깊이 판단은 클릭 한 번 더.
 *
 * 2인 합의 규칙이 그대로 적용돼 있다:
 *  · 0건 위젯(신고·사가)은 렌더링 자체를 안 한다 — 오늘 실데이터가 0이라 안 보인다
 *  · 시스템 상태는 정상이면 접힌 한 줄 (디자이너) — A안은 아예 숨김 (PM)
 *  · 스쿼드 백로그는 링크 한 줄만
 *  · KPI 는 압축 스트립으로 강등
 */

export const dynamic = "force-dynamic"

export default async function AdminHomeBento() {
  const d = await loadDashboardData()
  const syncAgo = d.betman.lastCheckedAt
    ? `${Math.max(1, Math.round((Date.now() - new Date(d.betman.lastCheckedAt).getTime()) / 60000))}분 전`
    : "기록 없음"
  // 전황판 — 전 항목 항상 표시. 정상=초록 흐림, 이상=빨강 굵음+액션
  const statusRows: StatusRow[] = [
    { label: "신고", value: `${d.reportsPending}건`, ok: d.reportsPending === 0, action: "처리" },
    {
      label: "문의",
      value: `${d.inquiriesOpen}건`,
      ok: d.inquiriesOpen === 0,
      action: "답변",
      note: "접수 경로 미배선",
    },
    {
      label: "뉴스 오류 제보",
      value: `${d.newsErrorReports}건`,
      ok: d.newsErrorReports === 0,
      action: "확인",
    },
    {
      label: "베트맨 동기화",
      value: d.betman.status === "ok" ? `정상 (${syncAgo})` : `지연 (${syncAgo})`,
      ok: d.betman.status === "ok",
      action: "재동기화",
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
      detail: d.betman.unsettledMatches,
    },
    {
      label: "환불 대기",
      value: `${d.betman.refundsPending}건`,
      ok: d.betman.refundsPending === 0,
      action: "환불",
    },
    {
      label: "사가 검수",
      value: `${d.sagaPending}건`,
      ok: d.sagaPending === 0,
      action: "검수",
    },
    {
      label: "메타버스 신고",
      value: `${d.metaverseReports}건`,
      ok: d.metaverseReports === 0,
      action: "처리",
    },
    {
      label: "선수 이름 등록 대기",
      value: `${d.dictCandidates}건`,
      ok: false, // 381건 — 실제 대기라 액션 노출
      action: "승인",
    },
    // 원본 대시보드 대조(2026-08-30)에서 회수 — 시스템 건강 2종
    {
      label: "크롤러 실패 (오늘)",
      value: `${d.crawlerFailsToday}건`,
      ok: d.crawlerFailsToday === 0,
      action: "로그",
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
    },
  ]
  return (
    <div className="min-h-[100dvh] bg-neutral-100 dark:bg-neutral-950">
      {/* 풀폭 관제실 (운영자: "내 컴퓨터 화면 전체를 활용") — max-width 없음 */}
      <main className="w-full px-6 py-5 2xl:px-8">
        <div className="mb-1 flex flex-wrap items-center gap-3">
          <p className="text-[11px] font-extrabold tracking-widest" style={{ color: WINE }}>
            DESIGN PILOT — 시연 (실제 발행 안 됨)
          </p>
          <Link
            href="/design-demo/admin-home/focus"
            className="text-muted-foreground ml-auto text-[11px] underline"
          >
            구 시안 A 보기
          </Link>
        </div>

        {/* 헤더 정보줄 — 참여도 패널과 겹치던 TodayStrip 을 빼고, 회수한 베팅 운영
            정보(진행 경기·회차·마감)를 넣는다. 스크롤 비용 0 으로 ③④ 해결 */}
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
        </div>

        {/* ── 1행 (첫 화면): 운영 전황 + 참여도 + 신고·문의 — 운영자: "이게 가장 중요" ── */}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
          <div className="flex flex-col gap-5 xl:col-span-4">
            {/* 전 항목 항상 표시 — "오류 있는지 없는지" 자체가 정보 (운영자 확정) */}
            <StatusBoard rows={statusRows} />
            {/* 전황판 아래 빈 공간 활용 — 스크롤 비용 0 으로 ⑤(티커 즉시 삭제) 회수 */}
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

        {/* ── 2행: 뉴스 검수 ── */}
        <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-12">
          <Widget
            kicker="NEWS DESK"
            title="뉴스 검수"
            count={d.newsTotal}
            className="xl:col-span-12"
            tone={d.news.some((n) => n.breaking) ? "danger" : "default"}
          >
            {/* 화면이 넓으니 원문·초안 2열을 바로 편다 — 모달 왕복 제거 */}
            <MiniNewsDeck items={d.news} variant="full" />
          </Widget>
        </div>

        {/* ── 3행: 선수 이름 등록 대기 → 스쿼드 검수 백로그 (운영자 지정 순서) ── */}
        <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-12">
          <Widget
            kicker="NOTATION"
            title="선수 이름 등록 대기"
            count={d.dictCandidates}
            className="xl:col-span-6"
            tone="danger"
          >
            {/* 무엇을 하라는 패널인지 첫 줄에 못박는다 (운영자: "뭘 어쩌라는 건지 모르겠어") */}
            <p className="text-muted-foreground mb-2 text-xs leading-relaxed">
              사전에 없는 선수 이름에 걸려 <b>사가로 못 들어간 소식</b>들입니다. 선수 표기를
              등록하면 그 선수의 소식이 전부 자동으로 풀립니다.
            </p>
            <PreviewList
              rows={d.blockedPlayers.map((p) => ({
                primary: p.name,
                secondary: `소식 ${p.count}건 잠김`,
                actionLabel: "표기 등록",
              }))}
              empty="대기 없음"
            />
            {d.blockedUnparsed > 0 && (
              <p className="mt-2 rounded bg-amber-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-800">
                ⚠️ 그 외 <b className="tabular-nums">{d.blockedUnparsed}</b>건은 이름 추출 자체가
                실패한 잔여물 — 표기 등록으로는 안 풀립니다. 일괄 정리가 따로 필요합니다.
              </p>
            )}
            <button
              className="mt-2 self-start text-[11px] font-bold underline"
              style={{ color: WINE }}
            >
              등록 화면 열기 →
            </button>
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
            <button
              className="mt-2 self-start text-[11px] font-bold underline"
              style={{ color: WINE }}
            >
              선수단 사전 전체 열기 →
            </button>
          </Widget>
        </div>
      </main>
    </div>
  )
}
