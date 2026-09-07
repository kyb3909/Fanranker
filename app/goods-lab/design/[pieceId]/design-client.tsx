"use client"

import { useState } from "react"
import { CANVAS_MAX, MiniBtn, Slider, Stage, round2 } from "../../place-editor"
import { DemoBanner, Mockup, TeamChip } from "../../shared"
import {
  ART_PX,
  CONSENT_LINES,
  CONSENT_SOLID,
  DEFAULT_PLACEMENT,
  DPI_FAIL,
  DPI_WARN,
  SIGNAL_ITEM,
  VARIANTS,
  dpiVerdict,
  effectiveDpi,
  placementOf,
  splitOf,
  variantOf,
  wantsOf,
  won,
  type GalleryPiece,
  type Placement,
} from "../../fixtures"

/**
 * 작가 작업 화면 — 마플 · 레드버블 제품 에디터의 자리.
 *
 * ## 왜 별도 라우트인가 (2026-09-05 실측)
 *
 * 처음에는 팬 다이얼로그 안에 3열로 넣었는데 "짜부됐다"는 지적을 받았다. 두 곳을 직접
 * 재보니 원인이 분명했다 — 뷰포트 1440 에서
 *
 *   마플     캔버스 **740 × 740**, 에디터 전체 1345 (뷰포트의 93%), 우측 패널 ~460
 *   레드버블 프리뷰 **685 × 911**, 좌측 썸네일 64, 우측 패널 ~575
 *
 * 둘 다 **캔버스만으로 뷰포트의 절반**이고, 에디터는 전용 전체 화면이다.
 * 우리 다이얼로그는 672px 이라 캔버스 하나(740)보다 좁았다. 그래서 라우트로 뺐다.
 *
 * ## 크기를 %가 아니라 cm 로 다룬다
 *
 * 두 곳 다 배율(%)을 주 조작으로 쓰지 않는다 — 마플은 가로 · 세로 **mm 숫자 입력**,
 * 레드버블은 **S/M/L 에 실제 치수를 적어** 둔다. 사는 사람도 만드는 사람도 "몇 %"가 아니라
 * "몇 cm"로 생각하기 때문이다. 배율 슬라이더는 미세 조정으로 내렸다.
 */
export function DesignClient({ piece }: { piece: GalleryPiece }) {
  const items = wantsOf(piece)
  const [active, setActive] = useState(items[0].id)
  const [place, setPlace] = useState<Record<string, Placement>>(() => {
    const init: Record<string, Placement> = {}
    for (const it of items) init[it.id] = placementOf(piece.id, it.id)
    return init
  })

  const item = items.find((i) => i.id === active) ?? items[0]
  const p = place[item.id] ?? DEFAULT_PLACEMENT
  const set = (patch: Partial<Placement>) =>
    setPlace((prev) => ({ ...prev, [item.id]: { ...p, ...patch } }))

  const area = item.print
  const dpi = effectiveDpi(item, p)
  const verdict = dpiVerdict(dpi)
  const variants = area ? VARIANTS[area.template] : []
  const variant = area ? variantOf(area.template, p.variant) : null
  const split = splitOf(item.price)

  /** 인쇄 폭(cm) ↔ 배율. 작가는 cm 로 생각하고, 저장은 배율로 한다 */
  const cmW = area ? area.cmW * p.scale : 0
  const setCm = (cm: number) => {
    if (!area) return
    set({ scale: round2(Math.max(0.4, Math.min(2, cm / area.cmW))) })
  }

  const blocked = items.filter(
    (it) => dpiVerdict(effectiveDpi(it, place[it.id] ?? DEFAULT_PLACEMENT)) === "fail"
  )

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--wc-canvas)", color: "var(--wc-ink)" }}
    >
      <DemoBanner note="시연 데이터 — 작가 작업 화면입니다 · 실제 주문은 동작하지 않습니다" />

      <div className="mx-auto max-w-[1240px] px-4 pb-28">
        <header className="flex flex-wrap items-center justify-between gap-3 pt-6 pb-5">
          <div className="min-w-0">
            <a href="/goods-lab" className="text-xs font-bold" style={{ color: "var(--wc-mute)" }}>
              ← 굿즈랩
            </a>
            <h1 className="mt-1 truncate text-xl font-bold">{piece.title}</h1>
            <div className="mt-1 flex items-center gap-2">
              <TeamChip teamId={piece.teamId} size={16} />
              <span className="text-xs" style={{ color: "var(--wc-mute)" }}>
                by {piece.creator}
              </span>
            </div>
          </div>
          <span className="text-xs" style={{ color: "var(--wc-mute)" }}>
            작가 작업 화면 — 여기서 정한 배치를 팬 화면과 구단 승인 카드가 그대로 봅니다
          </span>
        </header>

        {/* 마플 · 레드버블 비율: 썸네일 72 · 캔버스 1fr · 패널 400 */}
        <div className="grid gap-6 lg:grid-cols-[72px_1fr_400px]">
          {/* ① 품목 스트립 */}
          <div className="flex gap-2 lg:flex-col">
            {items.map((it) => {
              const on = it.id === active
              return (
                <button
                  key={it.id}
                  onClick={() => setActive(it.id)}
                  className="shrink-0 overflow-hidden rounded"
                  style={{
                    width: 72,
                    border: on ? "2px solid var(--wc-burgundy)" : "1px solid var(--wc-line)",
                    background: "var(--wc-paper)",
                  }}
                  aria-pressed={on}
                  title={it.name}
                >
                  <Mockup
                    piece={piece}
                    item={it}
                    placement={place[it.id] ?? DEFAULT_PLACEMENT}
                    caption={false}
                  />
                </button>
              )
            })}
          </div>

          {/* ② 캔버스 — 카드 테두리 없이 바닥 위에 둔다 (마플과 같다) */}
          <div className="min-w-0">
            {/*
              ⚠️ 캔버스는 **뷰포트 높이에도** 묶는다. 폭만 잡아두면 목업 비율(118%) 때문에
                 세로가 화면을 넘어 크기 손잡이가 잘린다(2026-09-05 실측). 마플도 캔버스를
                 뷰포트에 맞춰 잡는다 — 900 높이에서 740 정사각.
                 320px = 헤더 + 배너 + 하단 고정 바 + 버튼 줄.
            */}
            <div
              className="mx-auto w-full"
              style={{
                maxWidth: `min(${CANVAS_MAX}px, calc((100vh - 300px) / ${area?.aspect ?? 1.18}))`,
              }}
            >
              <Stage piece={piece} item={item} placement={p} onSet={set} />
            </div>

            <div
              className="mx-auto mt-3 flex w-full flex-wrap justify-center gap-1.5"
              style={{ maxWidth: CANVAS_MAX }}
            >
              {/* 정렬 버튼은 캔버스가 줄어도 폭을 유지한다 */}
              <MiniBtn onClick={() => set({ x: 0, y: 0, scale: 1, rot: 0 })}>영역에 맞추기</MiniBtn>
              <MiniBtn onClick={() => set({ x: 0, y: 0, scale: 1.25, rot: 0 })}>
                가득 채우기
              </MiniBtn>
              <MiniBtn onClick={() => set({ x: 0, y: 0 })}>가운데</MiniBtn>
              <MiniBtn onClick={() => set({ rot: 0 })}>회전 0°</MiniBtn>
            </div>
            <p className="mt-2 text-center text-xs" style={{ color: "var(--wc-mute)" }}>
              점선이 인쇄 가능 영역입니다. 그림을 끌어 옮기고, 모서리 손잡이로 크기를, 위 손잡이로
              각도를 바꿉니다.
            </p>
          </div>

          {/* ③ 옵션 패널 — 한 장의 카드 (마플 · 레드버블 공통) */}
          <aside>
            <div
              className="rounded-xl p-5"
              style={{ background: "var(--wc-card)", border: "1px solid var(--wc-line)" }}
            >
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <h2 className="text-base font-bold">{item.name}</h2>
                <span className="text-xl font-bold" style={{ color: "var(--wc-burgundy)" }}>
                  {won(item.price)}
                </span>
              </div>
              <p className="mb-4 text-xs" style={{ color: "var(--wc-mute)" }}>
                작가 몫 {won(split.creator)} · 제작 {item.leadTime}
              </p>

              {/* 크기 — 실치수가 주 조작이다 */}
              {area && (
                <section className="mb-4">
                  <h3 className="mb-1.5 text-xs font-bold">크기</h3>
                  <div className="mb-2 flex gap-1">
                    {[
                      { k: "S", s: 0.7 },
                      { k: "M", s: 1 },
                      { k: "L", s: 1.3 },
                    ].map((o) => {
                      const on = Math.abs(p.scale - o.s) < 0.02
                      return (
                        <button
                          key={o.k}
                          onClick={() => set({ scale: o.s })}
                          className="flex-1 rounded px-2 py-2 text-xs font-bold"
                          style={{
                            background: on ? "var(--wc-ink)" : "var(--wc-paper)",
                            color: on ? "var(--wc-paper)" : "var(--wc-ink-2)",
                            border: "1px solid var(--wc-line)",
                          }}
                          aria-pressed={on}
                        >
                          {o.k}
                          <span className="block font-normal">
                            {(area.cmW * o.s).toFixed(1)}×{(area.cmH * o.s).toFixed(1)}cm
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  <label className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: "var(--wc-mute)" }}>
                      가로
                    </span>
                    <input
                      type="number"
                      step={0.1}
                      min={(area.cmW * 0.4).toFixed(1)}
                      max={(area.cmW * 2).toFixed(1)}
                      value={cmW.toFixed(1)}
                      onChange={(e) => setCm(Number(e.target.value))}
                      className="w-20 rounded px-2 py-1 text-sm font-semibold"
                      style={{ background: "var(--wc-paper)", border: "1px solid var(--wc-line)" }}
                    />
                    <span className="text-xs" style={{ color: "var(--wc-mute)" }}>
                      cm · 세로 {(area.cmH * p.scale).toFixed(1)}cm (비율 고정)
                    </span>
                  </label>
                </section>
              )}

              {/* 제품 변형 — 레드버블의 Finish 와 같은 자리 */}
              {area && (
                <section className="mb-4">
                  <h3 className="mb-1.5 text-xs font-bold">재질 · 마감</h3>
                  <div className="flex flex-wrap gap-1">
                    {variants.map((v) => {
                      const on = v.id === (p.variant ?? variants[0].id)
                      return (
                        <button
                          key={v.id}
                          onClick={() => set({ variant: v.id })}
                          className="rounded px-3 py-2 text-xs font-bold"
                          style={{
                            background: on ? "var(--wc-ink)" : "var(--wc-paper)",
                            color: on ? "var(--wc-paper)" : "var(--wc-ink-2)",
                            border: "1px solid var(--wc-line)",
                          }}
                          aria-pressed={on}
                        >
                          {v.label}
                        </button>
                      )
                    })}
                  </div>
                  {variant && (
                    <p className="mt-1.5 text-xs" style={{ color: "var(--wc-mute)" }}>
                      {variant.note}
                    </p>
                  )}
                </section>
              )}

              {/* 미세 조정 */}
              <section className="mb-4">
                <h3 className="mb-1.5 text-xs font-bold">미세 조정</h3>
                <Slider
                  label="배율"
                  value={p.scale}
                  min={0.4}
                  max={2}
                  step={0.02}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(scale) => set({ scale: round2(scale) })}
                />
                <Slider
                  label="회전"
                  value={p.rot}
                  min={-45}
                  max={45}
                  step={1}
                  format={(v) => `${Math.round(v)}°`}
                  onChange={(rot) => set({ rot: Math.round(rot) })}
                />
              </section>

              {/* 인쇄 품질 — 우리가 두 곳보다 더 하는 것 */}
              <div
                className="rounded p-3"
                style={{
                  background:
                    verdict === "ok"
                      ? "var(--wc-soft)"
                      : verdict === "warn"
                        ? "var(--wc-gold)"
                        : "var(--wc-wine-tint)",
                }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-bold">인쇄 품질</span>
                  <span
                    className="text-xl font-bold"
                    style={{ color: verdict === "fail" ? "var(--wc-burgundy)" : "var(--wc-ink)" }}
                  >
                    {dpi} dpi
                  </span>
                </div>
                <p className="mt-1 text-xs" style={{ color: "var(--wc-ink-2)" }}>
                  {verdict === "ok" && `인쇄 가능합니다 (기준 ${DPI_WARN}dpi 이상)`}
                  {verdict === "warn" &&
                    `${DPI_WARN}dpi 아래입니다. 크기를 줄이면 선명해집니다 — 지금 그대로면 인쇄가 흐릴 수 있습니다`}
                  {verdict === "fail" &&
                    `${DPI_FAIL}dpi 아래는 접수되지 않습니다 (반려 사유 ⑧ 인쇄 품질 미달)`}
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--wc-mute)" }}>
                  원본 {ART_PX}px · 인쇄 폭 {cmW.toFixed(1)}cm
                </p>
              </div>
            </div>

            {/* 동의 + 입체 — 캔버스 옆에 붙여둔다 */}
            <div
              className="mt-4 rounded-xl p-5"
              style={{ background: "var(--wc-card)", border: "1px solid var(--wc-line)" }}
            >
              <h2 className="mb-2 text-sm font-bold">굿즈로 열기 — 동의 4줄</h2>
              <ol className="space-y-1 text-xs" style={{ color: "var(--wc-ink-2)" }}>
                {CONSENT_LINES.map((l, i) => (
                  <li key={l}>
                    {i + 1}. {l}
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs" style={{ color: "var(--wc-mute)" }}>
                입체(2단계) — {CONSENT_SOLID}. 「{SIGNAL_ITEM.name}」 요청이 쌓이면 그때 엽니다.
              </p>
            </div>
          </aside>
        </div>
      </div>

      {/* 하단 고정 바 — 마플 · 레드버블 둘 다 여기에 결정 버튼을 둔다 */}
      <div
        className="fixed inset-x-0 bottom-0 z-20 px-4 py-3"
        style={{ background: "var(--wc-paper)", borderTop: "1px solid var(--wc-line)" }}
      >
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3">
          <p className="text-xs" style={{ color: "var(--wc-mute)" }}>
            {items
              .map((it) => `${it.name} ${effectiveDpi(it, place[it.id] ?? DEFAULT_PLACEMENT)}dpi`)
              .join(" · ")}
          </p>
          <div className="flex items-center gap-2">
            {blocked.length > 0 && (
              <span className="text-xs font-semibold" style={{ color: "var(--wc-burgundy)" }}>
                {blocked.map((b) => b.name).join(" · ")} 인쇄 기준 아래
              </span>
            )}
            <button
              disabled={blocked.length > 0}
              className="rounded px-5 py-2.5 text-sm font-bold"
              style={{
                background: blocked.length > 0 ? "var(--wc-soft)" : "var(--wc-burgundy)",
                color: blocked.length > 0 ? "var(--wc-mute)" : "var(--wc-paper)",
                cursor: blocked.length > 0 ? "not-allowed" : "pointer",
              }}
            >
              동의하고 굿즈로 열기
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
