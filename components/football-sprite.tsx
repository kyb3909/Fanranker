import type { FootballSpriteId } from "@/lib/football-easter-eggs"

/** Transparent sprite artwork for the idle visitor and the development gallery. */
export function FootballSprite({
  character,
  animated = false,
  playbackId,
  onLoad,
  onError,
}: {
  character: FootballSpriteId
  animated?: boolean
  playbackId?: number
  onLoad?: () => void
  onError?: () => void
}) {
  const base = `/easter-eggs/${character}`
  // Give each finite GIF visit its own playback, even if this character was already cached.
  const replay = animated && playbackId !== undefined ? `?visit=${playbackId}` : ""
  return (
    <picture className="block h-full w-full">
      {animated && <source media="(prefers-reduced-motion: reduce)" srcSet={`${base}.png`} />}
      {/* Keep GIF playback and crisp sprite pixels out of the image optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${base}.${animated ? "gif" : "png"}${replay}`}
        alt=""
        aria-hidden
        width={128}
        height={128}
        draggable={false}
        decoding="async"
        loading={animated ? "eager" : "lazy"}
        onLoad={onLoad}
        onError={onError}
        className="pointer-events-none block h-full w-full select-none"
        style={{ imageRendering: "pixelated" }}
      />
    </picture>
  )
}
