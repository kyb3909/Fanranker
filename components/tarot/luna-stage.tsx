"use client"

import { useState } from "react"
import { EXPRESSIONS, expressionSrc, type Expression } from "@/lib/tarot/expression"

/**
 * 루나 무대 배경 — 표정을 갈아끼우는 레이어 (원본 ReadingStage 의 연출을 이식).
 *
 * 평온 컷을 항상 깔아두고 그 위로 현재 표정을 페이드 인 시킨다. 여섯 컷이 같은 배치에서
 * 생성돼 구도가 맞으므로 **표정만 부드럽게 갈린다.** 이미지를 통째로 갈아끼우면 로드되는
 * 순간 화면이 한 번 비어 "툭" 끊긴다 — 그 끊김이 정지 일러스트를 더 정지해 보이게 만든다.
 *
 * 에셋이 없는 표정은 폴백으로 아래 평온 레이어가 그대로 남는다.
 */
export function LunaStage({
  expression,
  className = "",
  dim = false,
  raise = false,
}: {
  expression: Expression
  className?: string
  /** 카드/대화가 위에 올라올 때 배경을 눌러 글자 대비를 확보한다 */
  dim?: boolean
  /**
   * 테이블에 카드가 깔렸을 때 켠다. 프레이밍을 아래쪽으로 옮겨(=인물이 화면 위로 올라와)
   * **카드가 루나의 얼굴을 가리지 않게** 한다. 안 켜면 카드가 정확히 얼굴 자리에 앉는다.
   */
  raise?: boolean
}) {
  const objectPosition = `center ${raise ? 30 : 12}%`
  const [failed, setFailed] = useState<Partial<Record<Expression, boolean>>>({})

  // ⚠️ 루트에 position 유틸리티를 두지 않는다. 호출부가 `absolute inset-0` 을 넘기는데
  //    여기 `relative` 를 같이 두면 둘 다 position 이라 CSS 순서로 승패가 갈리고,
  //    relative 가 이기면 **루트 높이가 0 이 돼 루나가 통째로 사라진다**(실제로 그랬다).
  //    자식들은 이 루트(absolute)를 기준으로 잡히므로 별도 relative 가 필요 없다.
  return (
    <div className={`overflow-hidden ${className}`}>
      {/* 베이스 — 항상 깔려 있는 평온 컷 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={expressionSrc("neutral")}
        alt="타로 리더 루나"
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition, transition: "object-position 700ms cubic-bezier(.2,.8,.3,1)" }}
      />

      {/* 표정 레이어 — 전부 깔아두고 현재 것만 불투명하게. 미리 로드돼 있어 전환에 깜빡임이 없다 */}
      {EXPRESSIONS.filter((e) => e !== "neutral").map((e) =>
        failed[e] ? null : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={e}
            src={expressionSrc(e)}
            alt=""
            aria-hidden
            onError={() => setFailed((p) => ({ ...p, [e]: true }))}
            className="absolute inset-0 h-full w-full object-cover transition-opacity duration-700"
            style={{
              objectPosition,
              opacity: expression === e ? 1 : 0,
              transition: "opacity 700ms, object-position 700ms cubic-bezier(.2,.8,.3,1)",
            }}
          />
        )
      )}

      {/* 촛불/구슬 오버레이 — 정지 일러스트에 생기를 준다 (globals.css) */}
      <span aria-hidden className="tarot-orb-aura" />
      <span aria-hidden className="tarot-candle-glow" />

      {/* 아래로 갈수록 어두워지는 워시 — 카드와 대화가 앉을 자리 */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-500"
        style={{
          opacity: dim ? 1 : 0.55,
          background:
            "linear-gradient(180deg, rgba(12,8,16,0) 30%, rgba(12,8,16,.55) 62%, rgba(12,8,16,.92) 100%)",
        }}
      />
    </div>
  )
}
