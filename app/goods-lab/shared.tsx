"use client"

import Image from "next/image"
import Link from "@/components/ui/app-link"
import { ArtTile } from "./art-tile"
import {
  DEFAULT_PLACEMENT,
  teamOf,
  variantOf,
  type DemoItem,
  type GalleryPiece,
  type Placement,
  type PrintArea,
} from "./fixtures"

/**
 * 팬 지면(`/goods-lab`)과 파트너 지면(`/goods-lab/partner`)이 함께 쓰는 조각들.
 *
 * 두 지면을 가른 이유는 청중이 다르기 때문이다 — 팬은 벽을 훑고 품목을 고르고,
 * 파트너는 수요와 승인 절차를 본다. 한 화면에 두면 둘 다 흐려진다.
 * 다만 **팀 칩 · 게이지 · 작품 그래픽**은 같은 물건이어야 한다. 여기가 그 자리다.
 */

/** 시연물임을 상시 고지한다. 우리를 지키는 장치다 — 지우지 말 것 */
export function DemoBanner({ note }: { note?: string }) {
  return (
    <div
      className="sticky top-0 z-30 px-4 py-2 text-center font-semibold"
      style={{
        background: "var(--wc-burgundy)",
        color: "var(--wc-paper)",
        fontSize: "var(--wc-fs-eyebrow)",
      }}
    >
      {note ?? "시연 데이터 — 실제 이용자 수치가 아닙니다 · 주문 · 결제는 동작하지 않습니다"}
    </div>
  )
}

export function TeamChip({ teamId, size = 20 }: { teamId: string; size?: number }) {
  const t = teamOf(teamId)
  return (
    <span className="inline-flex items-center gap-1.5">
      {t.crest ? (
        <Image src={t.crest} alt="" width={size} height={size} className="shrink-0" />
      ) : (
        <span
          className="inline-block shrink-0 rounded"
          style={{ width: size - 6, height: size - 6, background: t.color }}
          aria-hidden
        />
      )}
      <span className="text-sm font-semibold">{t.name}</span>
    </span>
  )
}

export function SectionHead({ no, title, lead }: { no: string; title: string; lead: string }) {
  return (
    <div className="mb-5">
      <p
        className="mb-1 font-semibold tracking-widest"
        style={{ fontSize: "var(--wc-fs-eyebrow)", color: "var(--wc-burgundy)" }}
      >
        {no}
      </p>
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="mt-2 text-sm" style={{ color: "var(--wc-ink-2)" }}>
        {lead}
      </p>
    </div>
  )
}

export function Gauge({ pct, color }: { pct: number; color: string }) {
  return (
    <div
      className="h-3 w-full overflow-hidden rounded-full"
      style={{ background: "var(--wc-soft)" }}
    >
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }}
      />
    </div>
  )
}

/** 작품 그래픽 — 사이트 자산이면 이미지, 아니면 코드로 그린 원본 디자인 */
export function PieceArt({
  piece,
  fit = "cover",
  priority = false,
}: {
  piece: GalleryPiece
  fit?: "cover" | "contain"
  priority?: boolean
}) {
  const t = teamOf(piece.teamId)
  if (piece.kind === "asset" && piece.image) {
    return (
      <Image
        src={piece.image}
        alt={piece.title}
        fill
        className={fit === "contain" ? "object-contain" : "object-cover"}
        priority={priority}
        sizes={priority ? "(min-width:1024px) 648px, 100vw" : "(max-width:640px) 50vw, 33vw"}
      />
    )
  }
  return (
    <ArtTile
      kind={piece.kind}
      color={t.color}
      darkInk={t.darkInk}
      word={piece.word}
      teamName={t.name}
      fit={fit}
    />
  )
}

/**
 * 품목 목업 — 제품 실루엣 + **인쇄 영역** + 그 안에 배치된 그림.
 *
 * ⚠️ 팬 화면 · 작가 에디터 · 승인 카드가 **같은 컴포넌트, 같은 배치값**을 쓴다.
 *    승인은 "그림"이 아니라 "그 그림이 얹힌 물건"에 하는 것이라, 권리자가 본 물건과
 *    팬이 본 물건이 다르면 승인 자체가 의미를 잃는다.
 *
 * `showArea` 를 켜면 인쇄 가능 영역을 점선으로 드러낸다 — 에디터에서만 쓴다.
 */
export function Mockup({
  piece,
  item,
  placement = DEFAULT_PLACEMENT,
  caption = true,
  showArea = false,
}: {
  piece: GalleryPiece
  item: DemoItem
  placement?: Placement
  caption?: boolean
  showArea?: boolean
}) {
  const a = item.print

  return (
    <figure className="m-0">
      <div
        className="relative w-full overflow-hidden rounded"
        style={{ paddingBottom: `${(a?.aspect ?? 1.18) * 100}%`, background: "var(--wc-soft)" }}
      >
        {a && (
          <ProductBody template={a.template} body={variantOf(a.template, placement.variant).body} />
        )}

        {/* 인쇄 영역 — 그림은 이 안에서만 움직인다 */}
        {a && (
          <span
            className="absolute overflow-hidden"
            style={{
              left: `${a.x}%`,
              top: `${a.y}%`,
              width: `${a.w}%`,
              height: `${a.h}%`,
              borderRadius: a.template === "stand" ? "999px 999px 4px 4px" : "4px",
            }}
          >
            <span
              className="absolute inset-0 block"
              style={{
                transform: `translate(${placement.x}%, ${placement.y}%) scale(${placement.scale}) rotate(${placement.rot}deg)`,
                transformOrigin: "center",
              }}
            >
              <PieceArt piece={piece} />
            </span>
          </span>
        )}

        {a && showArea && (
          <span
            className="pointer-events-none absolute"
            style={{
              left: `${a.x}%`,
              top: `${a.y}%`,
              width: `${a.w}%`,
              height: `${a.h}%`,
              border: "1px dashed var(--wc-burgundy)",
              borderRadius: a.template === "stand" ? "999px 999px 4px 4px" : "4px",
            }}
            aria-hidden
          />
        )}
      </div>
      {caption && (
        <figcaption className="mt-1 text-center text-xs" style={{ color: "var(--wc-mute)" }}>
          {item.name}
        </figcaption>
      )}
    </figure>
  )
}

/** 제품 몸체 — 인쇄 영역 밖의 물리적 부분(받침 · 고리 · 다이컷 여백) */
function ProductBody({ template, body }: { template: PrintArea["template"]; body: string }) {
  if (template === "sticker") {
    return (
      <span
        className="absolute rounded"
        style={{
          inset: "6%",
          background: body,
          boxShadow: "var(--wc-shadow-1)",
        }}
        aria-hidden
      />
    )
  }

  if (template === "stand") {
    return (
      <>
        <span
          className="absolute"
          style={{
            left: "14%",
            right: "14%",
            top: "3%",
            bottom: "20%",
            background: body,
            borderRadius: "999px 999px 6px 6px",
            boxShadow: "var(--wc-shadow-1)",
          }}
          aria-hidden
        />
        {/* 받침 — 아크릴 스탠드를 스탠드로 읽히게 하는 유일한 단서 */}
        <span
          className="absolute rounded"
          style={{
            left: "26%",
            right: "26%",
            bottom: "11%",
            height: "6%",
            background: "var(--wc-line-2)",
          }}
          aria-hidden
        />
      </>
    )
  }

  return (
    <>
      <span
        className="absolute rounded"
        style={{
          inset: "12% 16% 14% 16%",
          background: body,
          boxShadow: "var(--wc-shadow-1)",
        }}
        aria-hidden
      />
      {/* 고리 구멍 — 이 위치 때문에 그림을 위로 못 올린다 */}
      <span
        className="absolute rounded-full"
        style={{
          left: "47.5%",
          top: "5%",
          width: "5%",
          paddingBottom: "5%",
          border: "2px solid var(--wc-mute-2)",
          background: "var(--wc-soft)",
        }}
        aria-hidden
      />
    </>
  )
}

/** 지면 사이를 오가는 링크 — 미팅에서 두 화면을 번갈아 보여줘야 한다 */
export function RouteSwitch({ here }: { here: "fan" | "partner" }) {
  const to = here === "fan" ? "/goods-lab/partner" : "/goods-lab"
  const label = here === "fan" ? "파트너 화면 보기" : "팬 화면 보기"
  return (
    <Link
      href={to}
      className="inline-flex items-center gap-1 rounded px-3 py-1.5 text-xs font-bold"
      style={{
        background: "var(--wc-soft)",
        color: "var(--wc-ink-2)",
        border: "1px solid var(--wc-line)",
      }}
    >
      {label} →
    </Link>
  )
}
