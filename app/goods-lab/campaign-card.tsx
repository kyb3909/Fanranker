"use client"

import Link from "@/components/ui/app-link"
import {
  FAN_NEXT_STEP,
  FAN_SCENE,
  FAN_STATE_LABEL,
  GOAL,
  demandFor,
  fanStateOf,
  itemOf,
  pieceOf,
  placementOf,
  won,
  type Campaign,
} from "./fixtures"
import { useInterests } from "./interest-provider"
import { Gauge, Mockup } from "./shared"

/** 갤러리와 작품 상세의 수치 · 상태 · 다음 행동을 함께 렌더한다. */
export function CampaignCard({ campaign, link = false }: { campaign: Campaign; link?: boolean }) {
  const { wanted } = useInterests()
  const piece = pieceOf(campaign.pieceId)
  const item = itemOf(campaign.itemId)
  const state = fanStateOf(campaign, FAN_SCENE, wanted)
  const count = demandFor(piece.id, item.id, FAN_SCENE, wanted)
  const pct = Math.round((count / GOAL) * 100)
  const content = (
    <>
      <div className="flex items-center gap-3">
        <div className="w-16 shrink-0">
          <Mockup
            piece={piece}
            item={item}
            placement={placementOf(piece.id, item.id)}
            caption={false}
          />
        </div>
        <div className="min-w-0">
          <span
            className="inline-block rounded px-2 py-1 text-xs font-semibold"
            style={{ background: "var(--wc-soft)", color: "var(--wc-burgundy)" }}
          >
            {FAN_STATE_LABEL[state]}
          </span>
          <h3 className="mt-2 text-sm font-bold">
            {piece.title} · {item.name}
          </h3>
          <p className="mt-1 text-xs" style={{ color: "var(--wc-mute)" }}>
            예상 {won(item.price)} · {piece.creator}
          </p>
        </div>
      </div>
      <div
        className="mt-3 flex flex-wrap items-center justify-between gap-1 text-xs"
        style={{ color: "var(--wc-mute)" }}
      >
        <span>
          관심 {count}명 · 검토 기준 {GOAL}명
        </span>
        <span>{pct}%</span>
      </div>
      <div className="mt-2">
        <Gauge pct={pct} color="var(--wc-burgundy)" />
      </div>
      <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--wc-ink-2)" }}>
        {FAN_NEXT_STEP[state]}
      </p>
      {(state === "revising" || state === "paused") && campaign.reasonNote && (
        <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--wc-mute)" }}>
          검토 의견: {campaign.reasonNote}
        </p>
      )}
    </>
  )
  const className = "block min-w-0 rounded-xl p-4"
  const style = {
    background: "var(--wc-card)",
    border: "1px solid var(--wc-line)",
    color: "var(--wc-ink)",
  }
  return link ? (
    <Link
      href={`/goods-lab/art/${piece.id}?item=${item.id}#progress`}
      className={className}
      style={style}
    >
      {content}
    </Link>
  ) : (
    <article className={className} style={style}>
      {content}
    </article>
  )
}
