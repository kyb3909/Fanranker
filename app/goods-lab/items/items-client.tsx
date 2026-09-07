"use client"

import Link from "@/components/ui/app-link"
import { useInterests } from "../interest-provider"
import { DemoBanner, SectionHead } from "../shared"
import {
  FAN_SCENE,
  FORM_LABEL,
  ITEMS,
  MODE_LABEL,
  STAGE_POLICY,
  acceptsInterest,
  itemDemand,
  itemsOfStage,
  piecesWanting,
  splitOf,
  won,
  type DemoItem,
  type Stage,
} from "../fixtures"

/**
 * 품목 카탈로그.
 *
 * 순서가 논리다: 파는 것 → 아직 못 파는 것(이유와 함께) → 세기만 하는 것.
 * 판매 여부와 요청 접수 여부를 **따로** 적는다 — 둘을 하나로 합치면 "요청은 받는데 안 판다"인
 * 신호 품목을 설명할 수 없다.
 */

const ORDER: Stage[] = ["sell", "phase2", "signal"]

export function ItemsClient() {
  const { wanted } = useInterests()

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--wc-canvas)", color: "var(--wc-ink)" }}
    >
      <DemoBanner note="시연 데이터 — 가격·리드타임은 제조 견적 기준의 예시입니다" />

      <div className="mx-auto max-w-5xl px-4 pb-24">
        <header className="pt-8 pb-6">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <p
              className="text-xs font-semibold tracking-widest"
              style={{ color: "var(--wc-burgundy)" }}
            >
              Catalog · What we can make
            </p>
            <Link
              href="/goods-lab"
              className="inline-flex items-center gap-1 rounded px-3 py-1.5 text-xs font-bold"
              style={{
                background: "var(--wc-soft)",
                color: "var(--wc-ink-2)",
                border: "1px solid var(--wc-line)",
              }}
            >
              작품 보러 가기 →
            </Link>
          </div>
          <h1 className="leading-tight font-bold" style={{ fontSize: "var(--wc-fs-h2)" }}>
            지금 만들 수 있는 것과, 아직 못 만드는 것
          </h1>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--wc-ink-2)" }}>
            같은 그림이라도 품목마다 필요한 해상도와 권리가 다릅니다. 판매하지 않는 품목도 숨기지
            않고, 왜 아직인지를 함께 적었습니다.
          </p>
        </header>

        {ORDER.map((stage) => {
          const policy = STAGE_POLICY[stage]
          const list = itemsOfStage(stage)
          return (
            <section key={stage} className="mb-12" aria-label={policy.label}>
              <SectionHead no={policy.short} title={policy.label} lead={policy.why} />
              <ul className="grid gap-3 sm:grid-cols-2">
                {list.map((item) => (
                  <li key={item.id}>
                    <ItemRow item={item} demand={itemDemand(item.id, FAN_SCENE, wanted)} />
                  </li>
                ))}
              </ul>
            </section>
          )
        })}

        <p className="text-xs leading-relaxed" style={{ color: "var(--wc-mute)" }}>
          요청 수는 이 화면에서 고른 관심을 포함한 시연 값입니다. 요청은 구매 약속이 아니며,
          주문량을 예측하지 않습니다.
        </p>
      </div>
    </div>
  )
}

function ItemRow({ item, demand }: { item: DemoItem; demand: number }) {
  const sells = item.stage === "sell"
  const takes = acceptsInterest(item)
  const pieces = piecesWanting(item.id).length
  const split = splitOf(item.price)

  return (
    <Link
      href={`/goods-lab/items/${item.id}`}
      className="block h-full rounded-xl p-4 transition-colors"
      style={{ background: "var(--wc-card)", border: "1px solid var(--wc-line)" }}
    >
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold">{item.name}</h3>
        <span className="shrink-0 text-sm font-bold" style={{ color: "var(--wc-burgundy)" }}>
          {sells ? won(item.price) : "—"}
        </span>
      </div>

      {/* 판매 여부와 요청 접수 여부를 따로 적는다 — 신호 품목은 "안 파는데 요청은 받는다" */}
      <div className="mb-2 flex flex-wrap gap-1">
        <Tag on={sells}>{sells ? "판매 중" : "판매 안 함"}</Tag>
        <Tag on={takes}>{takes ? "요청 받는 중" : "요청도 아직"}</Tag>
        <Tag on={false}>
          {MODE_LABEL[item.mode]} · {FORM_LABEL[item.form]}
        </Tag>
      </div>

      <p className="mb-3 text-xs leading-relaxed" style={{ color: "var(--wc-ink-2)" }}>
        {item.note}
      </p>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs" style={{ color: "var(--wc-mute)" }}>
        <div className="flex justify-between">
          <dt>제작 기간</dt>
          <dd style={{ color: "var(--wc-ink-2)" }}>{item.leadTime}</dd>
        </div>
        <div className="flex justify-between">
          <dt>최소 수량</dt>
          <dd style={{ color: "var(--wc-ink-2)" }}>{item.moq > 0 ? `${item.moq}개` : "없음"}</dd>
        </div>
        <div className="flex justify-between">
          <dt>{takes ? "지금 요청" : "요청"}</dt>
          <dd style={{ color: "var(--wc-ink-2)" }} className="tabular-nums">
            {takes ? `${demand}건` : "—"}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt>{sells ? "작가 몫" : "받는 작품"}</dt>
          <dd style={{ color: "var(--wc-ink-2)" }}>{sells ? won(split.creator) : `${pieces}점`}</dd>
        </div>
      </dl>
    </Link>
  )
}

/** 색만으로 구분하지 않는다 — 글자가 상태를 말한다 */
function Tag({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span
      className="rounded px-2 py-0.5 text-xs font-semibold"
      style={{
        background: on ? "var(--wc-tint)" : "var(--wc-soft)",
        color: on ? "var(--wc-burgundy)" : "var(--wc-mute)",
      }}
    >
      {children}
    </span>
  )
}
