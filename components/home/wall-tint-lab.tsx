"use client"

import { useEffect, useState } from "react"

/**
 * 담벼락 카드 색 시안 전환기 — **개발 환경 전용** (home-client 가 NODE_ENV=development 에서만 렌더).
 *
 * 운영자(2026-09-03): "뉴스와 담벼락 글을 색깔로 약간 구분했으면. 연한 붉은색 계열, 우리 사이트가
 * 쓰는 것들로 여러 시안을 로컬에서 보여줘". 정지 화면 시안이 아니라 **실제 피드 안에서** 눌러 가며
 * 비교하려고 만들었다. 값은 전부 wc 토큰과 그 color-mix 다 — 원색 없음.
 *
 * 카드(wall-post-card.tsx)는 --wall-bg / --wall-border / --wall-head-bg / --wall-foot-bg /
 * --wall-shadow 를 읽고, 없으면 흰 카드 기본값으로 떨어진다. 시안이 확정되면 그 값을 카드에
 * 박고 이 파일과 home-client 의 렌더 한 줄을 지운다.
 */
const VARS = [
  "--wall-bg",
  "--wall-border",
  "--wall-head-bg",
  "--wall-foot-bg",
  "--wall-shadow",
] as const
type Vars = Partial<Record<(typeof VARS)[number], string>>

const VARIANTS: { id: string; label: string; note: string; vars: Vars }[] = [
  { id: "none", label: "흰색 (지금)", note: "구분은 크기와 키커만", vars: {} },
  {
    id: "a",
    label: "A 연한 와인 전면",
    note: "wine-tint 그대로 — 사이트의 필·칩과 같은 색",
    vars: { "--wall-bg": "var(--wc-wine-tint)" },
  },
  {
    id: "b",
    label: "B 연한 와인 + 와인 테두리",
    note: "A 에 테두리만 와인 30% — 윤곽이 잡힌다",
    vars: {
      "--wall-bg": "var(--wc-wine-tint)",
      "--wall-border": "color-mix(in srgb, var(--wc-burgundy) 30%, var(--wc-line))",
    },
  },
  {
    id: "c",
    label: "C 머리띠만",
    note: "작성자 줄만 와인, 본문·미디어는 흰색",
    vars: { "--wall-head-bg": "var(--wc-wine-tint)" },
  },
  {
    id: "d",
    label: "D 한 단계 진한 틴트",
    note: "burgundy 6% — A 보다 붉은 기가 분명",
    vars: {
      "--wall-bg": "color-mix(in srgb, var(--wc-burgundy) 6%, var(--wc-card))",
      "--wall-border": "color-mix(in srgb, var(--wc-burgundy) 18%, var(--wc-line))",
    },
  },
  {
    id: "e",
    label: "E 흰 카드 + 와인 아랫단",
    note: "본문은 흰색, 추천·댓글 단만 와인, 테두리·그림자에 와인 기",
    vars: {
      "--wall-border": "color-mix(in srgb, var(--wc-burgundy) 35%, var(--wc-line))",
      "--wall-foot-bg": "var(--wc-wine-tint)",
      "--wall-shadow": "var(--wc-shadow-3)",
    },
  },
]

export function WallTintLab() {
  const [id, setId] = useState("none")
  const [open, setOpen] = useState(true)

  useEffect(() => {
    try {
      const saved = localStorage.getItem("wall-tint-lab")
      if (saved && VARIANTS.some((v) => v.id === saved)) setId(saved)
    } catch {
      // 저장소 차단 — 기본값
    }
  }, [])

  useEffect(() => {
    // wc 토큰은 :root 가 아니라 .worldcup-scope 안에서만 정의된다 — <html> 에 걸면
    // var(--wc-*) 가 거기서 풀리지 않아 무효가 되고 카드는 기본값(흰색)으로 떨어진다.
    const scope =
      (document.querySelector(".worldcup-scope") as HTMLElement | null) ?? document.documentElement
    const root = scope.style
    const v = VARIANTS.find((x) => x.id === id) ?? VARIANTS[0]
    for (const k of VARS) {
      const val = v.vars[k]
      if (val) root.setProperty(k, val)
      else root.removeProperty(k)
    }
    try {
      localStorage.setItem("wall-tint-lab", id)
    } catch {
      // 무시
    }
  }, [id])

  return (
    <div
      className="fixed left-4 z-[60] flex flex-col gap-1"
      style={{
        bottom: 84,
        width: 248,
        padding: 10,
        borderRadius: 14,
        background: "var(--wc-card)",
        border: "1px solid var(--wc-line-2)",
        boxShadow: "var(--wc-shadow-2)",
        fontSize: 12,
        color: "var(--wc-ink)",
      }}
    >
      <div className="flex items-center justify-between px-1 pb-1">
        <b>담벼락 카드 색 시안 (로컬)</b>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="font-bold"
          style={{ color: "var(--wc-mute)" }}
        >
          {open ? "접기" : "펼치기"}
        </button>
      </div>
      {open &&
        VARIANTS.map((v) => {
          const on = v.id === id
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setId(v.id)}
              aria-pressed={on}
              className="flex flex-col items-start rounded-lg px-2.5 py-1.5 text-left"
              style={{
                background: on ? "var(--wc-wine-tint)" : "transparent",
                border: `1px solid ${on ? "var(--wc-burgundy)" : "var(--wc-line)"}`,
                color: on ? "var(--wc-burgundy)" : "var(--wc-ink)",
              }}
            >
              <span className="font-bold">{v.label}</span>
              <span style={{ color: "var(--wc-mute)" }}>{v.note}</span>
            </button>
          )
        })}
    </div>
  )
}
