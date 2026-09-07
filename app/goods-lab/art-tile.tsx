import React from "react"
import type { ArtKind } from "./fixtures"

/**
 * 굿즈에 올릴 **원본 디자인 시안**을 코드로 그린다.
 *
 * 왜 그리는가: 외부에서 팬아트를 받아오지 않기 때문이다. 이 시연물은 권리자에게 보여지고
 * "무단 2차창작을 승인 절차 안으로 들여온다"가 제안의 논리다 — 화면이 무단 팬아트로
 * 채워져 있으면 그 자리에서 논리가 무너진다.
 *
 * 굿즈에 실제로 올라가는 그래픽은 상당수가 타이포·기하 디자인이라, 이쪽이 오히려 자연스럽다.
 * 색은 팀 컬러를 그대로 받는다 (lib/stadium/map-teams.ts 와 같은 값).
 */
export function ArtTile({
  kind,
  color,
  darkInk,
  word,
  teamName,
  fit = "cover",
  size,
}: {
  kind: ArtKind
  color: string
  darkInk: boolean
  word?: string
  teamName: string
  fit?: "cover" | "contain"
  size?: number
}) {
  const ink = darkInk ? "#1B1416" : "#FFFFFF"

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      fontFamily="Arial, sans-serif"
      preserveAspectRatio={fit === "contain" ? "xMidYMid meet" : "xMidYMid slice"}
      className={size ? undefined : "absolute inset-0 h-full w-full"}
      width={size}
      height={size}
      role="img"
      aria-label={`${teamName} 디자인 시안`}
    >
      <rect x="0" y="0" width="100" height="100" fill={color} />
      {kind === "stripes" && <Stripes ink={ink} />}
      {kind === "number" && <NumberMark ink={ink} word={word ?? "12"} />}
      {kind === "slogan" && <Slogan ink={ink} word={word ?? ""} />}
      {kind === "grid" && <PixelGrid ink={ink} />}
      {kind === "arc" && <Arcs ink={ink} />}
      {kind === "diag" && <Diagonals ink={ink} />}
      {kind === "scarf" && <Scarf ink={ink} />}
    </svg>
  )
}

/** 유니폼 세로 줄무늬 모티프 */
function Stripes({ ink }: { ink: string }) {
  return (
    <g fill={ink} opacity="0.9">
      <rect x="14" y="0" width="9" height="100" />
      <rect x="37" y="0" width="9" height="100" />
      <rect x="60" y="0" width="9" height="100" />
      <rect x="83" y="0" width="9" height="100" />
    </g>
  )
}

/** 등번호 — 12번째 선수 */
function NumberMark({ ink, word }: { ink: string; word: string }) {
  return (
    <>
      <circle cx="50" cy="50" r="34" fill="none" stroke={ink} strokeWidth="2.5" opacity="0.65" />
      <text
        x="50"
        y="50"
        textAnchor="middle"
        dominantBaseline="central"
        fill={ink}
        fontSize="46"
        fontWeight="700"
        letterSpacing="-2"
      >
        {word}
      </text>
    </>
  )
}

/** 슬로건 타이포 — 두 줄로 쌓는다 */
function Slogan({ ink, word }: { ink: string; word: string }) {
  const parts = word.split(" ")
  const top = parts.slice(0, Math.ceil(parts.length / 2)).join(" ")
  const bottom = parts.slice(Math.ceil(parts.length / 2)).join(" ")
  return (
    <>
      <rect x="10" y="30" width="80" height="2" fill={ink} opacity="0.55" />
      <text x="50" y="46" textAnchor="middle" fill={ink} fontSize="15" fontWeight="700">
        {top}
      </text>
      <text x="50" y="64" textAnchor="middle" fill={ink} fontSize="15" fontWeight="700">
        {bottom}
      </text>
      <rect x="10" y="70" width="80" height="2" fill={ink} opacity="0.55" />
    </>
  )
}

/** 픽셀 격자 — 사이트의 픽셀아트 정체성과 붙는다 */
function PixelGrid({ ink }: { ink: string }) {
  const cells: { x: number; y: number; o: number }[] = []
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      // 가운데로 갈수록 진하게 — 규칙이 보이는 패턴이 무작위보다 낫다
      const d = Math.abs(3.5 - r) + Math.abs(3.5 - c)
      if (d < 5) cells.push({ x: 10 + c * 10, y: 10 + r * 10, o: 0.9 - d * 0.13 })
    }
  }
  return (
    <g fill={ink}>
      {cells.map((c, i) => (
        <rect key={i} x={c.x} y={c.y} width="8" height="8" opacity={Math.max(0.12, c.o)} />
      ))}
    </g>
  )
}

/** 대각 사선 — 어웨이 유니폼 새시 모티프 */
function Diagonals({ ink }: { ink: string }) {
  return (
    <g stroke={ink} strokeWidth="11" strokeLinecap="square">
      <line x1="-20" y1="70" x2="70" y2="-20" opacity="0.9" />
      <line x1="10" y1="120" x2="120" y2="10" opacity="0.55" />
      <line x1="-40" y1="30" x2="30" y2="-40" opacity="0.3" />
    </g>
  )
}

/** 머플러 — 가로 띠와 술 */
function Scarf({ ink }: { ink: string }) {
  return (
    <g fill={ink}>
      <rect x="0" y="26" width="100" height="12" opacity="0.9" />
      <rect x="0" y="46" width="100" height="5" opacity="0.5" />
      <rect x="0" y="57" width="100" height="12" opacity="0.9" />
      {/* 술 — 규칙적으로 떨어뜨린다 */}
      {[6, 18, 30, 42, 54, 66, 78, 90].map((x) => (
        <rect key={x} x={x} y="69" width="4" height="9" opacity="0.7" />
      ))}
    </g>
  )
}

/** 동심 아치 */
function Arcs({ ink }: { ink: string }) {
  return (
    <g fill="none" stroke={ink} strokeWidth="3">
      <circle cx="50" cy="86" r="18" opacity="0.85" />
      <circle cx="50" cy="86" r="32" opacity="0.6" />
      <circle cx="50" cy="86" r="46" opacity="0.4" />
      <circle cx="50" cy="86" r="60" opacity="0.22" />
    </g>
  )
}
