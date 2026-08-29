import Link from "next/link"
import { loadDashboardData } from "./data"
import { MiniNewsDeck, TodayStrip, Widget, StatusBoard, type StatusRow } from "./widgets"

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
      label: "미정산 경기",
      value: `${d.betman.unsettled}건`,
      ok: d.betman.unsettled === 0,
      action: "정산",
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
      label: "표기 후보",
      value: `${d.dictCandidates}건`,
      ok: false, // 381건 — 실제 대기라 액션 노출
      action: "승인",
    },
  ]
  return (
    <div className="min-h-[100dvh] bg-neutral-50 dark:bg-neutral-950">
      <main className="mx-auto max-w-[1280px] p-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <p className="text-xs font-extrabold tracking-widest text-red-800">
            DESIGN PILOT · 시안 B 「벤토 그리드」 — 시연 (실제 발행 안 됨)
          </p>
          <Link
            href="/design-demo/admin-home/focus"
            className="ml-auto text-xs font-bold underline"
          >
            시안 A 「포커스 스테이션」 보기 →
          </Link>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-4">
          <h1 className="text-lg font-bold">관리자 홈</h1>
          <TodayStrip today={d.today} />
          {/* 시스템 — 전부 정상이면 접힌 초록 한 줄 (디자이너: 부재 ≠ 정상 증명).
              이상이 있으면 이 줄 대신 아래 베트맨 위젯이 나타난다 */}
          <p className="ml-auto text-xs">
            {d.betman.status === "ok" &&
            d.betman.unsettled === 0 &&
            d.betman.refundsPending === 0 ? (
              <span className="text-emerald-700">
                ✅ 전 시스템 정상 — 베트맨 동기화 · 미정산 0 · 환불 대기 0
              </span>
            ) : (
              <span className="font-bold text-red-600">⚠️ 베트맨 점검 필요 — 아래 위젯</span>
            )}
          </p>
        </div>

        {/* 12컬럼 벤토 — 부패 속도 × 파급 순 */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12">
          <Widget
            title="뉴스 검수"
            count={d.newsTotal}
            className="xl:col-span-6"
            tone={d.news.some((n) => n.breaking) ? "danger" : "default"}
          >
            <MiniNewsDeck items={d.news} variant="compact" />
          </Widget>

          <div className="flex flex-col gap-4 xl:col-span-3">
            {/* 전 항목 항상 표시 — "오류 있는지 없는지" 자체가 정보다 (운영자 확정) */}
            <StatusBoard rows={statusRows} />
          </div>

          <div className="flex flex-col gap-4 xl:col-span-3">
            <Widget title="바로가기">
              <ul className="space-y-1.5 text-xs">
                <li>
                  <span className="text-muted-foreground">스쿼드 검수 백로그</span>{" "}
                  <b className="tabular-nums">{d.squadBacklog.toLocaleString()}</b>건 — 마감
                  없음이라 위젯 금지, 링크만
                </li>
                <li className="text-muted-foreground">발행 후 교정 → 전용 페이지</li>
                <li className="text-muted-foreground">누적 KPI → 애널리틱스로 추방</li>
              </ul>
            </Widget>
          </div>
        </div>
      </main>
    </div>
  )
}
