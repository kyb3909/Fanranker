"use client"

import Link from "@/components/ui/app-link"
import { useInterests } from "../../interest-provider"
import { DemoBanner, Mockup, SectionHead } from "../../shared"
import {
  ART_PX,
  DPI_FAIL,
  DPI_WARN,
  FAN_SCENE,
  FORM_LABEL,
  GOAL,
  MODE_LABEL,
  STAGE_POLICY,
  VARIANTS,
  acceptsInterest,
  demandFor,
  itemDemand,
  piecesWanting,
  placementOf,
  splitOf,
  won,
  type DemoItem,
} from "../../fixtures"

/**
 * 품목 상세 — 크기 · 재질 · 예상가 · 인쇄 기준 · 이 품목을 여는 작품들.
 *
 * ⚠️ **팬이 보는 화면이다.** 배분은 "작가에게 얼마"만 적는다 — 권리자 로열티와 플랫폼 몫은
 *    승인 카드(파트너 지면)에만 있다. 소비자 화면에 로열티율이 새면 구단이 곤란해진다.
 */
export function ItemClient({ item }: { item: DemoItem }) {
  const { wanted } = useInterests()
  const policy = STAGE_POLICY[item.stage]
  const sells = item.stage === "sell"
  const takes = acceptsInterest(item)
  const pieces = piecesWanting(item.id)
  const split = splitOf(item.price)
  const print = item.print
  // 인쇄 폭이 이보다 커지면 300dpi 아래로 떨어진다 — 크기 상한의 진짜 근거
  const maxCmAt300 = print ? Math.floor(((ART_PX * 2.54) / DPI_WARN) * 10) / 10 : null

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--wc-canvas)", color: "var(--wc-ink)" }}
    >
      <DemoBanner note="시연 데이터 — 가격·치수는 제조 견적 기준의 예시입니다" />

      <div className="mx-auto max-w-5xl px-4 pb-24">
        <nav className="py-4 text-sm" aria-label="품목 탐색">
          <Link href="/goods-lab/items" style={{ color: "var(--wc-burgundy)" }}>
            ← 품목 전체
          </Link>
        </nav>

        <header className="pb-6">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span
              className="rounded px-2 py-0.5 text-xs font-semibold"
              style={{
                background: sells ? "var(--wc-tint)" : "var(--wc-soft)",
                color: sells ? "var(--wc-burgundy)" : "var(--wc-mute)",
              }}
            >
              {policy.label}
            </span>
            <span className="text-xs" style={{ color: "var(--wc-mute)" }}>
              {MODE_LABEL[item.mode]} · {FORM_LABEL[item.form]}
            </span>
          </div>
          <h1 className="leading-tight font-bold" style={{ fontSize: "var(--wc-fs-h2)" }}>
            {item.name}
          </h1>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--wc-ink-2)" }}>
            {item.note}
          </p>
          {!sells && (
            <p
              className="mt-3 rounded p-3 text-xs leading-relaxed"
              style={{ background: "var(--wc-soft)", color: "var(--wc-ink-2)" }}
            >
              {policy.why}
            </p>
          )}
        </header>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div>
            {/* ── 사양 ── */}
            <section className="mb-10" aria-label="품목 사양">
              <SectionHead
                no="사양"
                title="크기와 만드는 방식"
                lead="같은 그림이라도 품목마다 필요한 해상도가 다릅니다."
              />
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <Spec label="소비자가" value={sells ? won(item.price) : "아직 판매하지 않습니다"} />
                <Spec
                  label="구단 공식 상품 가격대"
                  value={
                    item.officialBand[1] > 0
                      ? `${won(item.officialBand[0])} ~ ${won(item.officialBand[1])}`
                      : "해당 없음"
                  }
                />
                <Spec label="제작 기간" value={item.leadTime} />
                <Spec
                  label="최소 수량"
                  value={item.moq > 0 ? `${item.moq}개부터` : "없음 — 한 개도 만듭니다"}
                />
                {print && (
                  <>
                    <Spec label="인쇄 크기" value={`${print.cmW} × ${print.cmH} cm`} />
                    <Spec
                      label="재질 선택"
                      value={VARIANTS[print.template].map((v) => v.label).join(" · ")}
                    />
                  </>
                )}
                {sells && <Spec label="작가에게" value={`${won(split.creator)} · 판매 1개당`} />}
              </dl>
            </section>

            {/* ── 인쇄 품질 ── */}
            {print && (
              <section className="mb-10" aria-label="인쇄 품질 기준">
                <SectionHead
                  no="인쇄"
                  title="이 크기로 뽑으려면"
                  lead="업로드한 그림의 긴 변이 얼마나 되는지가 인쇄 품질을 정합니다."
                />
                <ul className="space-y-2 text-sm" style={{ color: "var(--wc-ink-2)" }}>
                  <li>
                    지금 업로드는 긴 변 <b>{ART_PX.toLocaleString("ko-KR")}px</b>로 저장됩니다.
                  </li>
                  <li>
                    그 픽셀로 <b>{maxCmAt300}cm</b>까지는 인쇄 표준({DPI_WARN}dpi)을 지킵니다. 이
                    품목의 인쇄 폭은 {print.cmW}cm입니다.
                  </li>
                  <li>
                    {DPI_FAIL}dpi 아래로 떨어지면 접수하지 않습니다. 그림을 키워 배치하면 같은
                    픽셀로 더 넓은 면을 덮게 되어 수치가 내려갑니다.
                  </li>
                </ul>
              </section>
            )}

            {/* ── 이 품목을 여는 작품 ── */}
            <section aria-label="이 품목으로 요청할 수 있는 작품">
              <SectionHead
                no="작품"
                title={takes ? "이 품목으로 요청할 수 있는 작품" : "이 품목을 기다리는 작품"}
                lead={
                  takes
                    ? `작가가 이 품목을 열어 둔 작품입니다. 품목별로 ${GOAL}명이 모이면 제작 검토를 시작합니다.`
                    : "아직 요청을 받지 않는 품목이라 연결된 작품이 없습니다."
                }
              />
              {pieces.length === 0 ? (
                <p
                  className="rounded p-4 text-sm"
                  style={{ background: "var(--wc-soft)", color: "var(--wc-ink-2)" }}
                >
                  아직 이 품목을 연 작품이 없습니다.{" "}
                  <Link href="/goods-lab" style={{ color: "var(--wc-burgundy)" }}>
                    작품 전체 보기
                  </Link>
                </p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-3">
                  {pieces.map((piece) => (
                    <li key={piece.id}>
                      <Link
                        href={`/goods-lab/art/${piece.id}?item=${item.id}`}
                        className="block rounded-xl p-3"
                        style={{
                          background: "var(--wc-card)",
                          border: "1px solid var(--wc-line)",
                        }}
                      >
                        {print ? (
                          <Mockup
                            piece={piece}
                            item={item}
                            placement={placementOf(piece.id, item.id)}
                            caption={false}
                          />
                        ) : null}
                        <p className="mt-2 truncate text-sm font-bold">{piece.title}</p>
                        <p className="truncate text-xs" style={{ color: "var(--wc-mute)" }}>
                          {piece.creator} · 요청 {demandFor(piece.id, item.id, FAN_SCENE, wanted)}건
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* ── 요약 패널 ── */}
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div
              className="rounded-xl p-4"
              style={{ background: "var(--wc-card)", border: "1px solid var(--wc-line)" }}
            >
              <p className="mb-1 text-xs font-semibold" style={{ color: "var(--wc-mute)" }}>
                지금까지 모인 요청
              </p>
              <p className="text-2xl font-bold tabular-nums">
                {takes ? itemDemand(item.id, FAN_SCENE, wanted) : "—"}
                {takes && <span className="ml-1 text-sm font-normal">건</span>}
              </p>
              <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--wc-ink-2)" }}>
                {takes
                  ? "모든 작품을 합친 수입니다. 요청은 구매 약속이 아니며 주문량을 예측하지 않습니다."
                  : "이 품목은 아직 요청을 받지 않습니다."}
              </p>
              <Link
                href="/goods-lab"
                className="mt-4 block rounded px-3 py-2 text-center text-sm font-bold"
                style={{ background: "var(--wc-tint)", color: "var(--wc-burgundy)" }}
              >
                작품 고르러 가기
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex justify-between gap-3 border-b pb-2"
      style={{ borderColor: "var(--wc-line)" }}
    >
      <dt className="text-sm" style={{ color: "var(--wc-mute)" }}>
        {label}
      </dt>
      <dd className="text-right text-sm font-semibold">{value}</dd>
    </div>
  )
}
