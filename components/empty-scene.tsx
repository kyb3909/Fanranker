import Image from "next/image"

/**
 * 빈 상태 일러스트 (2026-08-20 P2 — scripts/gen-polish-assets.mjs 산출물 전용).
 *
 * 2도 리소그래프 톤(웜페이퍼 + 잉크 + 버건디 한 점)이라 지면 위에 "사진"이 아니라
 * "삽화"로 앉는다. 규약:
 * - **장식이다** — alt 는 비우고 aria-hidden. 메시지는 항상 곁의 텍스트가 진다.
 * - `mix-blend-mode: multiply` — 일러스트의 아이보리 바탕이 카드 배경과 살짝 달라도
 *   곱하기 합성이 사각형 경계를 지운다 (이미지가 "붙인 스티커"로 보이지 않게).
 * - 빈 상태마다 다른 장면을 쓴다 (public/images/empty/) — 같은 그림이 두 화면에
 *   보이면 placeholder 로 읽힌다.
 */
export function EmptyScene({ src, size = 300 }: { src: string; size?: number }) {
  return (
    <Image
      src={src}
      alt=""
      width={720}
      height={480}
      aria-hidden
      className="pointer-events-none mx-auto h-auto w-full select-none"
      style={{ maxWidth: size, mixBlendMode: "multiply" }}
    />
  )
}
