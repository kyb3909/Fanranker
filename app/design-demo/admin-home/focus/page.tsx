import Link from "next/link"
import { loadDashboardData } from "../data"
import { MiniNewsDeck, StatusBoard, TodayStrip, type StatusRow } from "../widgets"

/**
 * 시안 A — 「포커스 스테이션」 (PM 성향안)
 *
 * 좌측 8col 에 뉴스 덱을 크게 — 원문·초안 2열 대조까지 **인라인**이라 모달이 필요
 * 없다. 우측 4col 은 나머지 큐 레일. PM 논리: 물량의 90%가 뉴스이므로 1주차는
 * 이 위젯 하나가 대시보드 가치의 대부분이다.
 *
 * 트레이드오프: 뉴스 처리 속도 최상 ↔ 뉴스 0건이면 화면 2/3 이 죽는다.
 * (디자이너: B의 뉴스 위젯 헤더에 "집중 모드" 토글로 흡수 가능 — B ⊃ A)
 *
 * PM 쪽 갈림 반영: 시스템 상태는 정상일 때 **아예 안 보인다** (장애 때만 한 줄).
 */

export const dynamic = "force-dynamic"

export default async function AdminHomeFocus() {
  const d = await loadDashboardData()
  // 전황판 — B안과 같은 규칙 (전 항목 항상 표시, 운영자 확정)
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
      value: d.betman.status === "ok" ? "정상" : "지연",
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
    { label: "사가 검수", value: `${d.sagaPending}건`, ok: d.sagaPending === 0, action: "검수" },
    { label: "표기 후보", value: `${d.dictCandidates}건`, ok: false, action: "승인" },
  ]
  return (
    <div className="min-h-[100dvh] bg-neutral-50 dark:bg-neutral-950">
      <main className="mx-auto max-w-[1280px] p-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <p className="text-xs font-extrabold tracking-widest text-red-800">
            DESIGN PILOT · 시안 A 「포커스 스테이션」 — 시연 (실제 발행 안 됨)
          </p>
          <Link href="/design-demo/admin-home" className="ml-auto text-xs font-bold underline">
            ← 시안 B 「벤토 그리드」 보기
          </Link>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-4">
          <h1 className="text-lg font-bold">관리자 홈</h1>
          <TodayStrip today={d.today} />
          {/* PM안: 정상이면 시스템 줄 자체가 없다 — "없는 게 정상 신호" */}
          {d.betman.status !== "ok" && (
            <p className="ml-auto text-xs font-bold text-red-600">
              ⚠️ betman 동기화 {d.betman.status === "stale" ? "지연" : "장애"} — 재시도
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          {/* 좌측 — 큰 덱 (원문 대조 인라인) */}
          <section className="bg-background rounded-xl border p-4 xl:col-span-8">
            <h2 className="mb-2 text-sm font-bold">
              뉴스 검수 <span className="text-muted-foreground tabular-nums">{d.newsTotal}</span>
            </h2>
            <MiniNewsDeck items={d.news} variant="full" />
          </section>

          {/* 우측 — 전황판 (전 항목 항상 표시) */}
          <div className="flex flex-col gap-4 xl:col-span-4">
            <StatusBoard rows={statusRows} />
            <div className="bg-background rounded-xl border p-4">
              <h2 className="mb-2 text-sm font-bold">바로가기</h2>
              <ul className="text-muted-foreground space-y-1.5 text-xs">
                <li>
                  스쿼드 백로그 <b className="tabular-nums">{d.squadBacklog.toLocaleString()}</b>건
                  (마감 없음 — 링크만)
                </li>
                <li>발행 후 교정</li>
                <li>사가 검수 {d.sagaPending}건</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
