"use client"

import { useEffect, useState } from "react"

/**
 * 디자인 랩 스위처 (2026-08-21 운영자: "디자이너별 시안을 로컬 페이지에서 비교")
 *
 * **개발 환경 전용** — layout 에서 NODE_ENV 게이트로만 마운트되고, 프로덕션 번들에서는
 * 조건이 정적 false 라 제거된다. public/design-lab/<변형>.css 를 <link> 로 갈아끼워
 * 실제 페이지 위에서 시안을 입혔다 벗겼다 한다. 선택은 localStorage 에 남아
 * 페이지를 옮겨 다니며 비교할 수 있다.
 */

const VARIANTS = [
  { id: "", label: "현행" },
  { id: "29cm", label: "29CM" },
  { id: "maxim", label: "맥심" },
  { id: "musinsa", label: "무신사" },
  { id: "kream", label: "KREAM" },
]

const LINK_ID = "design-lab-css"
const LS_KEY = "design-lab-variant"

function apply(id: string) {
  document.getElementById(LINK_ID)?.remove()
  if (!id) return
  const link = document.createElement("link")
  link.id = LINK_ID
  link.rel = "stylesheet"
  link.href = `/design-lab/${id}.css`
  document.head.appendChild(link)
}

export function DesignLabSwitcher() {
  const [active, setActive] = useState("")
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY) ?? ""
    setActive(saved)
    apply(saved)
  }, [])

  const pick = (id: string) => {
    setActive(id)
    localStorage.setItem(LS_KEY, id)
    apply(id)
  }

  return (
    <div
      className="fixed right-3 bottom-24 z-[9999] flex flex-col items-end gap-1.5"
      style={{ fontFamily: "system-ui, sans-serif" }}
    >
      {open &&
        VARIANTS.map((v) => (
          <button
            key={v.id || "base"}
            type="button"
            onClick={() => pick(v.id)}
            className="rounded-full px-3 py-1.5 text-[12px] font-bold shadow-md"
            style={{
              background: active === v.id ? "#111" : "#fff",
              color: active === v.id ? "#fff" : "#333",
              border: "1px solid #ccc",
            }}
          >
            {v.label}
          </button>
        ))}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-full px-3 py-2 text-[12px] font-extrabold shadow-lg"
        style={{ background: "#111", color: "#fff" }}
        title="디자인 랩 (dev 전용)"
      >
        LAB{active ? ` · ${VARIANTS.find((v) => v.id === active)?.label}` : ""}
      </button>
    </div>
  )
}
