/**
 * 매치센터 로딩 스켈레톤 (2026-08-20 UX 패널 A6) — 일정·홈 밴드에서 경기를
 * 눌렀을 때 화면이 멎어 보이던 구간. 스코어 헤더는 다크 밴드(gn-band) 실루엣,
 * 본문은 카드 펄스로 채워 착지 시 레이아웃 시프트를 줄인다.
 */
export default function MatchLoading() {
  return (
    <div className="min-h-[80vh]" style={{ background: "var(--wc-paper)" }}>
      {/* 스코어 밴드 자리 */}
      <section className="gn-band">
        <div className="mx-auto max-w-[1080px] px-4 pt-8 pb-8 sm:px-6">
          <div className="animate-pulse space-y-4">
            <div className="h-3.5 w-24 rounded" style={{ background: "rgba(255,255,255,.12)" }} />
            <div className="flex items-center justify-center gap-6 py-2">
              <div className="h-7 w-32 rounded" style={{ background: "rgba(255,255,255,.14)" }} />
              <div className="h-9 w-16 rounded" style={{ background: "rgba(255,255,255,.18)" }} />
              <div className="h-7 w-32 rounded" style={{ background: "rgba(255,255,255,.14)" }} />
            </div>
          </div>
        </div>
      </section>
      <main className="mx-auto max-w-[1080px] px-4 pt-6 pb-16 sm:px-6">
        <div className="animate-pulse space-y-4 lg:max-w-[720px]">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="space-y-3 rounded-xl p-5"
              style={{ background: "var(--wc-card, #fff)", border: "1px solid var(--wc-line)" }}
            >
              <div className="h-4 w-24 rounded" style={{ background: "var(--wc-soft)" }} />
              <div className="h-4 w-full rounded" style={{ background: "var(--wc-soft)" }} />
              <div className="h-4 w-2/3 rounded" style={{ background: "var(--wc-soft)" }} />
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
