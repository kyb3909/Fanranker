"use client"

import Link from "@/components/ui/app-link"
import { Button } from "@/components/ui/button"
import { CampaignCard } from "./campaign-card"
import { FAN_SCENE, GALLERY, GOAL, TAGS, fanCampaigns, pieceDemand } from "./fixtures"
import { useInterests } from "./interest-provider"
import { DemoBanner, PieceArt, RouteSwitch, SectionHead } from "./shared"

export function FanClient({ tag = "전체" }: { tag?: string }) {
  const { wanted, persistent } = useInterests()
  const pieces = tag === "전체" ? GALLERY : GALLERY.filter((piece) => piece.tags.includes(tag))

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--wc-canvas)", color: "var(--wc-ink)" }}
    >
      <DemoBanner />
      <div className="mx-auto max-w-5xl px-4 pb-24">
        <header className="pt-8 pb-6">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <p
              className="text-xs font-semibold tracking-widest"
              style={{ color: "var(--wc-burgundy)" }}
            >
              Fan Art · Co-creation
            </p>
            <RouteSwitch here="fan" />
          </div>
          <h1 className="leading-tight font-bold" style={{ fontSize: "var(--wc-fs-h2)" }}>
            팬이 그리고, 팬이 고르고, 함께 만든다
          </h1>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--wc-ink-2)" }}>
            마음에 드는 작품에서 갖고 싶은 굿즈를 골라 보세요. 품목별로 {GOAL}명이 관심을 남기면
            제작 검토를 시작합니다.{" "}
            <Link href="/goods-lab/items" className="font-bold underline underline-offset-2">
              어떤 굿즈를 만들 수 있나요?
            </Link>
          </p>

          {/* 저장이 막히면 새로고침에 선택이 사라진다 — 작품 페이지에만 있던 안내를 여기도 (2026-09-08) */}
          {!persistent && (
            <p
              role="status"
              className="mt-3 rounded px-3 py-2 text-xs leading-relaxed"
              style={{ background: "var(--wc-soft)", color: "var(--wc-ink-2)" }}
            >
              브라우저 저장이 막혀 있어 고른 관심이 이 화면에서만 유지됩니다. 새로고침하면
              사라집니다.
            </p>
          )}
        </header>

        <section className="mb-14" aria-label="팬아트 갤러리">
          <SectionHead
            no="팬아트"
            title="어떤 그림을 곁에 두고 싶나요?"
            lead="작품을 크게 보고, 굿즈 미리보기와 작가의 이야기를 만나 보세요."
          />
          <nav className="mb-4 overflow-x-auto" aria-label="작품 태그">
            <div className="flex w-max gap-2 pb-2">
              {TAGS.map((value) => (
                <Link
                  key={value}
                  href={
                    value === "전체" ? "/goods-lab" : `/goods-lab?tag=${encodeURIComponent(value)}`
                  }
                  scroll={false}
                  aria-current={tag === value ? "page" : undefined}
                  className="shrink-0 rounded px-3 py-2 text-sm font-semibold"
                  style={{
                    background: tag === value ? "var(--wc-burgundy)" : "var(--wc-soft)",
                    color: tag === value ? "var(--wc-paper)" : "var(--wc-ink-2)",
                  }}
                >
                  {value === "전체" ? value : `#${value}`}
                </Link>
              ))}
            </div>
          </nav>

          <div className="columns-2 gap-3 sm:columns-3">
            {pieces.map((piece) => {
              const href = `/goods-lab/art/${piece.id}`
              const count = pieceDemand(piece, FAN_SCENE, wanted)
              return (
                <article
                  key={piece.id}
                  className="mb-3 break-inside-avoid overflow-hidden rounded-xl"
                  style={{ background: "var(--wc-card)", border: "1px solid var(--wc-line)" }}
                >
                  <Link
                    href={href}
                    className="relative block w-full"
                    style={{
                      paddingBottom: `${piece.aspect * 100}%`,
                      background: "var(--wc-soft)",
                    }}
                    aria-label={`${piece.title} — 작품 상세 보기`}
                  >
                    <PieceArt piece={piece} />
                    {!piece.opened && (
                      <span
                        className="absolute top-2 right-2 rounded px-2 py-1 text-xs font-bold"
                        style={{ background: "var(--wc-soft)", color: "var(--wc-mute)" }}
                      >
                        전시만
                      </span>
                    )}
                  </Link>
                  <div className="p-3">
                    <h2 className="mb-1 truncate text-sm font-bold">
                      <Link href={href}>{piece.title}</Link>
                    </h2>
                    <div
                      className="mb-2 flex justify-between gap-2 text-xs"
                      style={{ color: "var(--wc-mute)" }}
                    >
                      <span className="truncate">{piece.creator}</span>
                      <span className="shrink-0">♥ {piece.faves}</span>
                    </div>
                    <div className="mb-3 flex flex-wrap gap-1">
                      {piece.tags.slice(0, 3).map((value) => (
                        <Link
                          key={value}
                          href={`/goods-lab?tag=${encodeURIComponent(value)}`}
                          scroll={false}
                          className="rounded px-2 py-1 text-xs"
                          style={{ background: "var(--wc-soft)", color: "var(--wc-mute)" }}
                        >
                          #{value}
                        </Link>
                      ))}
                    </div>
                    <Link
                      href={href}
                      className="block rounded px-2 py-2 text-center text-xs font-bold"
                      style={{ background: "var(--wc-tint)", color: "var(--wc-burgundy)" }}
                    >
                      {piece.opened ? `갖고 싶어요 · 요청 ${count}건` : "작품 감상하기"}
                    </Link>
                  </div>
                </article>
              )
            })}
          </div>
          {pieces.length === 0 && (
            <div className="py-8 text-center">
              <p className="mb-4 text-sm">이 태그의 작품이 아직 없습니다.</p>
              <Button asChild variant="outline">
                <Link href="/goods-lab">전체 작품 보기</Link>
              </Button>
            </div>
          )}
        </section>

        <section aria-label="굿즈 진행 상황">
          <SectionHead
            no="진행 소식"
            title="우리가 기다리는 굿즈"
            lead="관심을 모으고, 시안을 다듬고, 제작 조건을 확인합니다. 각 작품에서 다음 소식을 확인해 보세요."
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {fanCampaigns(FAN_SCENE).map((campaign) => (
              <CampaignCard key={campaign.id} campaign={campaign} link />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
