import { PageBand } from "@/components/page-band"
import { MatchHubTabs } from "@/components/match/hub-tabs"

/**
 * 일정 로딩 스켈레톤 (2026-08-20 UX 패널 A6) — GNB "경기"가 최상위 동선인데
 * loading.tsx 가 없어 클릭 후 화면이 멎어 보였다. 밴드·탭은 정적이라 실물을
 * 그대로 내고, 경기 행만 펄스로 채운다 → 착지 시 레이아웃 시프트 0.
 */
export default function MatchesLoading() {
  return (
    <div className="worldcup-scope min-h-[100dvh]">
      <PageBand
        kicker="Fixtures"
        title="경기 일정"
        description="챔피언스리그 · 유로파리그 · 유럽 5대 리그와 주요 컵대회"
      />
      <main className="mx-auto max-w-[760px] px-4 py-6 sm:px-6">
        <div className="-mx-4 mb-5 sm:-mx-6">
          <MatchHubTabs active="fixtures" />
        </div>
        <div className="animate-pulse space-y-5">
          {/* 날짜 칩 행 */}
          <div className="flex gap-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-12 w-16 rounded-lg"
                style={{ background: "var(--wc-soft)" }}
              />
            ))}
          </div>
          {/* 리그 섹션 × 2 */}
          {[0, 1].map((s) => (
            <div
              key={s}
              className="overflow-hidden rounded-xl"
              style={{ background: "var(--wc-card, #fff)", border: "1px solid var(--wc-line)" }}
            >
              <div className="px-4 py-3">
                <div className="h-4 w-28 rounded" style={{ background: "var(--wc-soft)" }} />
              </div>
              {[0, 1, 2].map((r) => (
                <div
                  key={r}
                  className="grid grid-cols-[56px_1fr] items-center gap-3 px-4 py-3"
                  style={{ borderTop: "1px solid var(--wc-line)" }}
                >
                  <div className="h-4 w-11 rounded" style={{ background: "var(--wc-soft)" }} />
                  <div className="h-4 w-3/5 rounded" style={{ background: "var(--wc-soft)" }} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
