"use client"

import { useState } from "react"
import Link from "@/components/ui/app-link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CampaignCard } from "../../campaign-card"
import {
  FAN_SCENE,
  GALLERY,
  GOAL,
  demandFor,
  effectiveDpi,
  fanCampaigns,
  interestItemsOf,
  placementOf,
  splitOf,
  won,
  wantsOf,
  type GalleryPiece,
} from "../../fixtures"
import { useInterests } from "../../interest-provider"
import { DemoBanner, Gauge, Mockup, PieceArt, TeamChip } from "../../shared"

const panel = { background: "var(--wc-card)", border: "1px solid var(--wc-line)" }

export function ArtClient({ piece, sharedItemId }: { piece: GalleryPiece; sharedItemId?: string }) {
  const { wanted, hydrated, persistent, toggle } = useInterests()
  const [choosing, setChoosing] = useState(false)
  const [shareStatus, setShareStatus] = useState("")
  const [manualUrl, setManualUrl] = useState("")
  const [sharing, setSharing] = useState(false)
  const options = interestItemsOf(piece)
  const sharedItem = options.find((item) => item.id === sharedItemId)
  const orderedOptions = [...options].sort(
    (a, b) => Number(b.id === sharedItem?.id) - Number(a.id === sharedItem?.id)
  )
  const mine = options.filter((item) => wanted[`${piece.id}:${item.id}`])
  const printItems = wantsOf(piece)
  const rankedItems = options
    .filter((item) => item.stage === "sell")
    .sort(
      (a, b) =>
        demandFor(piece.id, b.id, FAN_SCENE, wanted) - demandFor(piece.id, a.id, FAN_SCENE, wanted)
    )
  const campaigns = fanCampaigns(FAN_SCENE).filter((campaign) => campaign.pieceId === piece.id)
  const artistWorks = GALLERY.filter((art) => art.creator === piece.creator)

  async function share() {
    setSharing(true)
    setShareStatus("")
    setManualUrl("")
    const url = new URL(`/goods-lab/art/${piece.id}`, window.location.origin)
    if (sharedItem) url.searchParams.set("item", sharedItem.id)
    try {
      if (navigator.share) {
        try {
          await navigator.share({
            title: piece.title,
            text: `${piece.creator}의 팬아트${sharedItem ? ` · ${sharedItem.name}` : ""}`,
            url: url.href,
          })
          return
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") return
        }
      }
      try {
        await navigator.clipboard.writeText(url.href)
        setShareStatus("작품 링크를 복사했어요.")
      } catch {
        setManualUrl(url.href)
        setShareStatus("아래 작품 주소를 복사해 주세요.")
      }
    } finally {
      setSharing(false)
    }
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--wc-canvas)", color: "var(--wc-ink)" }}
    >
      <DemoBanner />
      <div className="mx-auto max-w-5xl px-4 pb-24">
        <nav className="py-4 text-sm" aria-label="작품 탐색">
          <Link href="/goods-lab" style={{ color: "var(--wc-mute)" }}>
            ← 팬아트 갤러리
          </Link>
        </nav>
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <section
            className="min-w-0 lg:col-start-1 lg:row-span-5 lg:row-start-1"
            aria-label="작품과 이야기"
          >
            <div
              className="relative h-[min(45svh,480px)] w-full lg:h-[640px]"
              data-testid="artwork-original"
            >
              <PieceArt piece={piece} fit="contain" priority />
            </div>
            <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl font-bold sm:text-[26px]">{piece.title}</h1>
                <p className="mt-2 text-sm" style={{ color: "var(--wc-mute)" }}>
                  by{" "}
                  <a href="#artist" className="underline">
                    {piece.creator}
                  </a>{" "}
                  · ♥ {piece.faves}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={share} disabled={sharing}>
                공유
              </Button>
            </div>
            <p role="status" className="mt-2 text-xs" style={{ color: "var(--wc-mute)" }}>
              {shareStatus}
            </p>
            {manualUrl && (
              <label className="mt-2 block text-xs">
                작품 주소
                <Input value={manualUrl} readOnly onFocus={(event) => event.target.select()} />
              </label>
            )}
            <div className="mt-3">
              <TeamChip teamId={piece.teamId} />
            </div>
            <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--wc-ink-2)" }}>
              {piece.description}
            </p>
            <nav className="mt-4 flex flex-wrap gap-2" aria-label="작품 태그">
              {piece.tags.map((tag) => (
                <Link
                  key={tag}
                  href={`/goods-lab?tag=${encodeURIComponent(tag)}`}
                  className="rounded px-2 py-1 text-xs"
                  style={{ background: "var(--wc-soft)", color: "var(--wc-ink-2)" }}
                >
                  #{tag}
                </Link>
              ))}
            </nav>
          </section>

          <section
            className="min-w-0 rounded-xl p-4 lg:col-start-2 lg:row-start-2"
            style={panel}
            aria-labelledby="interest-title"
          >
            <h2 id="interest-title" className="text-base font-bold">
              {piece.opened ? "어떤 굿즈로 갖고 싶나요?" : "지금은 작품을 전시하고 있어요"}
            </h2>
            {piece.opened ? (
              <>
                <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--wc-mute)" }}>
                  결제 없이 관심을 남겨요. 품목별 {GOAL}명이 모이면 제작 검토를 시작합니다.
                </p>
                {sharedItem && (
                  <p className="mt-3 rounded p-2 text-xs" style={{ background: "var(--wc-soft)" }}>
                    이 링크에서 함께 보고 있는 품목: <b>{sharedItem.name}</b>
                  </p>
                )}
                <ul className="my-4 space-y-4" aria-label="품목별 관심">
                  {rankedItems.map((item) => {
                    const count = demandFor(piece.id, item.id, FAN_SCENE, wanted)
                    return (
                      <li key={item.id}>
                        <div className="mb-2 flex flex-wrap justify-between gap-1 text-xs">
                          {/* 품목 이름에서 사양·크기·인쇄 기준으로 내려간다 (2026-09-08 카탈로그) */}
                          <Link
                            href={`/goods-lab/items/${item.id}`}
                            className="underline underline-offset-2"
                          >
                            {item.name}
                          </Link>
                          <span>
                            <b>{count}명</b> · {Math.round((count / GOAL) * 100)}%
                          </span>
                        </div>
                        <Gauge pct={(count / GOAL) * 100} color="var(--wc-burgundy)" />
                      </li>
                    )
                  })}
                </ul>
                <Button className="w-full" onClick={() => setChoosing(true)} disabled={!hydrated}>
                  {mine.length ? "선택 바꾸기" : "갖고 싶어요"}
                </Button>
                <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--wc-mute)" }}>
                  여러 품목을 고를 수 있어요. 관심 등록은 구매 약속이나 제작 확정이 아닙니다.
                </p>
                <div
                  role="status"
                  className="mt-4 rounded p-3 text-xs"
                  style={{ background: "var(--wc-soft)" }}
                >
                  <p className="font-bold">내가 요청한 품목</p>
                  <p className="mt-1 leading-relaxed">
                    {!hydrated
                      ? "선택을 불러오는 중이에요."
                      : mine.length
                        ? mine.map((item) => item.name).join(" · ")
                        : "아직 선택한 품목이 없어요."}
                  </p>
                  {mine.length > 0 && (
                    <a href="#progress" className="mt-2 inline-block underline">
                      진행 소식 확인하기
                    </a>
                  )}
                </div>
                <p className="mt-2 text-xs" style={{ color: "var(--wc-mute)" }}>
                  {persistent
                    ? "시연 선택은 이 브라우저에 저장됩니다. 알림은 발송되지 않습니다."
                    : "브라우저 저장이 제한되어 현재 화면에서만 선택이 유지됩니다."}
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--wc-mute)" }}>
                작가가 아직 굿즈 관심 수집을 열지 않았습니다. 작품과 작가의 다른 그림을 둘러보세요.
              </p>
            )}
          </section>

          <section
            id="progress"
            className="min-w-0 scroll-mt-24 lg:col-start-2 lg:row-start-3"
            aria-labelledby="progress-title"
          >
            <h2 id="progress-title" className="mb-3 text-base font-bold">
              이 작품의 진행
            </h2>
            <div className="space-y-3">
              {campaigns.map((campaign) => (
                <CampaignCard key={campaign.id} campaign={campaign} />
              ))}
              {campaigns.length === 0 && (
                <p className="rounded-xl p-4 text-sm leading-relaxed" style={panel}>
                  {piece.opened
                    ? "아직 검토를 시작한 굿즈가 없습니다. 관심이 모이면 제작 조건을 확인하고 이곳에 소식을 남깁니다."
                    : "현재 전시 중인 작품으로, 진행 중인 굿즈가 없습니다."}
                </p>
              )}
            </div>
          </section>

          {piece.opened && (
            <section
              className="min-w-0 lg:col-start-2 lg:row-start-4"
              aria-labelledby="preview-title"
            >
              <h2 id="preview-title" className="text-base font-bold">
                작가가 제안한 굿즈
              </h2>
              <p className="mt-1 text-xs" style={{ color: "var(--wc-mute)" }}>
                배치 미리보기 · 가격과 사양은 시연 예상값입니다.
              </p>
              <div className="mt-3 overflow-x-auto pb-2">
                <div className="flex w-max gap-3">
                  {printItems.map((item) => (
                    <div key={item.id} className="w-36">
                      <Mockup
                        piece={piece}
                        item={item}
                        placement={placementOf(piece.id, item.id)}
                      />
                      <p className="mt-2 text-center text-xs">예상 {won(item.price)}</p>
                      <p className="mt-1 text-center text-xs" style={{ color: "var(--wc-mute)" }}>
                        작가 몫 예상 {won(splitOf(item.price).creator)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          <section
            id="artist"
            className="min-w-0 scroll-mt-24 rounded-xl p-4 lg:col-start-2 lg:row-start-1"
            style={panel}
            aria-labelledby="artist-title"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="artist-title" className="text-base font-bold">
                {piece.creator}
              </h2>
              <TeamChip teamId={piece.teamId} size={16} />
            </div>
            <p className="mt-2 text-xs" style={{ color: "var(--wc-mute)" }}>
              공개 작품 {artistWorks.length}개 · 팬아트 작가
            </p>
            {artistWorks.some((art) => art.id !== piece.id) && (
              <div className="mt-3 space-y-2">
                {artistWorks
                  .filter((art) => art.id !== piece.id)
                  .map((art) => (
                    <Link
                      key={art.id}
                      href={`/goods-lab/art/${art.id}`}
                      className="block text-sm underline"
                    >
                      {art.title} →
                    </Link>
                  ))}
              </div>
            )}
          </section>

          {piece.opened && (
            <details className="min-w-0 rounded-xl p-4 lg:col-start-2 lg:row-start-5" style={panel}>
              <summary className="cursor-pointer text-sm font-bold">작가 작업 정보 (시연)</summary>
              <p className="my-3 text-xs leading-relaxed" style={{ color: "var(--wc-mute)" }}>
                품목별 배치와 인쇄 크기를 확인합니다. 해상도는 시연 원본을 가정한 참고값입니다.
              </p>
              <ul className="mb-4 space-y-2 text-xs">
                {printItems.map((item) => (
                  <li key={item.id}>
                    {item.name} · {effectiveDpi(item, placementOf(piece.id, item.id))}dpi
                  </li>
                ))}
              </ul>
              <Button asChild variant="outline" size="sm">
                <Link href={`/goods-lab/design/${piece.id}`}>작가 작업 화면 열기 →</Link>
              </Button>
            </details>
          )}
        </div>
      </div>

      <Dialog open={choosing && piece.opened} onOpenChange={setChoosing}>
        <DialogContent className="worldcup-scope max-h-[80svh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>갖고 싶은 품목 고르기</DialogTitle>
            <DialogDescription>
              결제 없이 관심을 남겨요. 여러 품목을 선택하거나 다시 눌러 취소할 수 있습니다.
            </DialogDescription>
          </DialogHeader>
          <fieldset className="min-w-0 space-y-3">
            <legend className="sr-only">관심 품목</legend>
            {orderedOptions.map((item) => {
              const selected = !!wanted[`${piece.id}:${item.id}`]
              return (
                <label
                  key={item.id}
                  className="flex cursor-pointer items-start gap-3 rounded p-3"
                  style={{
                    background: selected ? "var(--wc-tint)" : "var(--wc-soft)",
                    color: "var(--wc-ink)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={!hydrated}
                    onChange={() => toggle(piece.id, item.id)}
                    aria-label={item.name}
                    className="mt-1 size-4 shrink-0"
                    style={{ accentColor: "var(--wc-burgundy)" }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold">{item.name}</span>
                    <span className="mt-1 block text-xs">
                      {item.stage === "signal"
                        ? "입체 제작 가능성을 검토하기 위한 관심이에요."
                        : `예상 ${won(item.price)} · 작가 몫 예상 ${won(splitOf(item.price).creator)}`}
                    </span>
                    <span className="mt-1 block text-xs">
                      {demandFor(piece.id, item.id, FAN_SCENE, wanted)}명이 관심을 남겼어요.
                    </span>
                  </span>
                </label>
              )
            })}
          </fieldset>
          <p role="status" className="text-xs" style={{ color: "var(--wc-mute)" }}>
            {mine.length}개 품목 선택 · 즉시 반영됩니다.
          </p>
          <DialogFooter>
            <Button onClick={() => setChoosing(false)}>선택 완료</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
