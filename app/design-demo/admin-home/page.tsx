import Link from "next/link"
import { loadDashboardData } from "./data"
import { MiniNewsDeck, DictWidget, ReportsWidget, TodayStrip, Widget } from "./widgets"

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
          {/* 시스템 — 정상이면 접힌 초록 한 줄 (디자이너: 부재 ≠ 정상 증명) */}
          <p className="ml-auto text-xs">
            {d.betman.status === "ok" ? (
              <span className="text-emerald-700">✅ 전 시스템 정상 · betman 동기화 정상</span>
            ) : (
              <span className="font-bold text-red-600">
                ⚠️ betman 동기화 {d.betman.status === "stale" ? "지연" : "장애"}
              </span>
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
            <ReportsWidget count={d.reportsPending} />
            <DictWidget count={d.dictCandidates} />
            {d.sagaPending > 0 && (
              <Widget title="사가 검수" count={d.sagaPending}>
                <button className="self-start rounded border px-2.5 py-1 text-[11px]">열기</button>
              </Widget>
            )}
            {/* 오늘 0건인 위젯들이 접혀 이 레일이 짧다 — 그게 규칙이다 */}
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              신고 {d.reportsPending}건 · 사가 검수 {d.sagaPending}건 —{" "}
              <b>0건 위젯은 자동으로 사라집니다.</b> 빈 대시보드가 곧 퇴근 신호.
            </p>
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
