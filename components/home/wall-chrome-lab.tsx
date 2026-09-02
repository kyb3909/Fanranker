"use client"

import type { WallChrome } from "@/components/home/wall-post-card"

/**
 * 담벼락 포스트 크롬 전환기 — **개발 환경 전용** (home-client 가 NODE_ENV=development 에서만 렌더).
 *
 * 2026-09-03 디자인 리뷰 최종 후보 1(타임라인 포스트, 평판)과 2(카드 유지)를 실제 피드에서 눌러
 * 비교한다. 둘은 데스크톱(sm+) 크롬만 다르다 — 모바일은 같다. 운영자가 고르면 기본값을 박고 이
 * 파일과 home-client 의 렌더·Provider 를 걷어낸다.
 */
const OPTIONS: { id: WallChrome; label: string; note: string }[] = [
  {
    id: "flat",
    label: "후보 1 타임라인 포스트",
    note: "데스크톱도 평판 — 위아래 괘선만, 모서리·그림자 없음 (디렉터 추천)",
  },
  {
    id: "card",
    label: "후보 2 카드 유지",
    note: "데스크톱은 둥근 카드 그대로, 속만 교체 (안전판)",
  },
]

export function WallChromeLab({
  chrome,
  onChange,
}: {
  chrome: WallChrome
  onChange: (c: WallChrome) => void
}) {
  return (
    <div
      className="fixed left-4 z-[60] flex flex-col gap-1"
      style={{
        bottom: 84,
        width: 248,
        padding: 10,
        borderRadius: 12,
        background: "var(--wc-card)",
        border: "1px solid var(--wc-line-2)",
        boxShadow: "var(--wc-shadow-2)",
        fontSize: 12,
        color: "var(--wc-ink)",
      }}
    >
      <b className="px-1 pb-1">담벼락 포스트 시안 (로컬)</b>
      {OPTIONS.map((o) => {
        const on = o.id === chrome
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-pressed={on}
            className="flex flex-col items-start rounded-lg px-2.5 py-1.5 text-left"
            style={{
              background: on ? "var(--wc-wine-tint)" : "transparent",
              border: `1px solid ${on ? "var(--wc-burgundy)" : "var(--wc-line)"}`,
              color: on ? "var(--wc-burgundy)" : "var(--wc-ink)",
            }}
          >
            <span className="font-bold">{o.label}</span>
            <span style={{ color: "var(--wc-mute)" }}>{o.note}</span>
          </button>
        )
      })}
      <span className="px-1 pt-1" style={{ color: "var(--wc-mute)" }}>
        모바일(폭 640 미만)은 두 후보가 같습니다 — 창을 좁혀 보세요.
      </span>
    </div>
  )
}
