"use client"

import Image from "next/image"

export interface ReadingCard {
  position: number
  positionName: string
  arcana: number
  nameKo: string
  name: string
  reversed: boolean
  image: string
}

/**
 * 테이블 위의 카드 — 사용자가 한 장씩 탭해서 뒤집는다 (원본 ReadingStage 의식 이식).
 *
 * 왜 사용자가 뒤집나: 카드가 이미 다 뒤집힌 채 나오면 받는 사람은 **수령인**이지 참여자가
 * 아니다. 뒤집는 손짓 하나가 "내 점괘"라는 감각을 만든다.
 * ⚠️ 연출일 뿐이다 — 실제 카드는 서버가 이미 확정해 보냈다. 뒤집는 순서는 결과를 안 바꾼다.
 */
export function CardTable({
  cards,
  flipped,
  onFlip,
  compact = false,
}: {
  cards: ReadingCard[]
  /** 뒤집힌 카드의 position 집합 */
  flipped: Set<number>
  onFlip: (position: number) => void
  compact?: boolean
}) {
  const w = compact ? 62 : 84
  const h = Math.round(w * 1.5)
  const nextToFlip = cards.find((c) => !flipped.has(c.position))?.position

  return (
    <div className="flex items-end justify-center gap-2 sm:gap-3">
      {cards.map((c, i) => {
        const isFlipped = flipped.has(c.position)
        const isNext = c.position === nextToFlip
        return (
          <div key={c.position} className="flex flex-col items-center">
            <button
              type="button"
              onClick={() => !isFlipped && onFlip(c.position)}
              disabled={isFlipped}
              aria-label={
                isFlipped ? `${c.positionName} ${c.nameKo}` : `${c.positionName} 카드 뒤집기`
              }
              className="relative block cursor-pointer transition-transform duration-300 disabled:cursor-default"
              style={{
                width: w,
                height: h,
                perspective: 900,
                // 안 뒤집힌 카드는 살짝 기울여 둔다 — 반듯한 격자는 테이블이 아니라 목록이다
                transform: isFlipped
                  ? "translateY(-6px)"
                  : `rotate(${i % 2 ? 5 : -6}deg) translateY(${isNext ? -3 : 0}px)`,
              }}
            >
              <span
                className="absolute inset-0 rounded-[7px]"
                style={{
                  transformStyle: "preserve-3d",
                  transition: "transform 620ms cubic-bezier(.2,.8,.3,1)",
                  transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                }}
              >
                {/* 뒷면 */}
                <span
                  className="absolute inset-0 overflow-hidden rounded-[7px]"
                  style={{
                    backfaceVisibility: "hidden",
                    border: `1px solid ${isNext ? "rgba(224,189,126,.9)" : "rgba(201,165,106,.45)"}`,
                    background: "repeating-linear-gradient(45deg, #241a33 0 6px, #2c2040 6px 12px)",
                    boxShadow: isNext
                      ? "0 0 18px rgba(224,189,126,.35), 0 8px 18px rgba(0,0,0,.55)"
                      : "0 6px 14px rgba(0,0,0,.5)",
                  }}
                >
                  <span
                    className="absolute inset-0 flex items-center justify-center text-[15px]"
                    style={{ color: "rgba(224,189,126,.75)" }}
                    aria-hidden
                  >
                    ✶
                  </span>
                </span>
                {/* 앞면 */}
                <span
                  className="absolute inset-0 overflow-hidden rounded-[7px]"
                  style={{
                    backfaceVisibility: "hidden",
                    transform: "rotateY(180deg)",
                    border: "1.5px solid #e0bd7e",
                    boxShadow: "0 0 20px rgba(224,189,126,.3), 0 8px 20px rgba(0,0,0,.6)",
                    background: "#181129",
                  }}
                >
                  <Image
                    src={c.image}
                    alt={c.nameKo}
                    fill
                    sizes="120px"
                    // 역방향은 실제로 뒤집어 보여준다 — 글로만 말하면 안 와닿는다
                    className="object-cover"
                    style={c.reversed ? { transform: "rotate(180deg)" } : undefined}
                  />
                </span>
              </span>
            </button>

            <span className="mt-1.5 block text-center leading-tight">
              <span
                className="block text-[10px] font-bold"
                style={{ color: isFlipped ? "#e0bd7e" : "rgba(255,255,255,.45)" }}
              >
                {c.positionName}
              </span>
              <span
                className="block text-[11px] font-semibold transition-opacity duration-500"
                style={{ color: "rgba(255,255,255,.92)", opacity: isFlipped ? 1 : 0 }}
              >
                {c.nameKo}
                {c.reversed && (
                  <span className="ml-0.5 text-[10px]" style={{ color: "rgba(255,255,255,.6)" }}>
                    역
                  </span>
                )}
              </span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
