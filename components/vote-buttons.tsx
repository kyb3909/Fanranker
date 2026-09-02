"use client"

import { ThumbsUp, ThumbsDown } from "lucide-react"

interface VoteButtonsProps {
  voteCount: number
  myVote: "up" | "down" | null
  onVote: (type: "up" | "down") => void
  size?: "sm" | "md"
  /**
   * 0 이고 내 표도 없을 때 숫자 대신 보여줄 동사 (예: "추천"). 홈 담벼락 포스트가 쓴다 —
   * "👍 0" 은 콜드스타트에서 "아무도 없다"를 가장 크게 말하는 글자다 (2026-09-03 디자인 리뷰).
   * 안 넘기면 종전과 똑같이 숫자를 찍는다 (글 상세 등 무변경).
   */
  emptyLabel?: string
}

export function VoteButtons({
  voteCount,
  myVote,
  onVote,
  size = "sm",
  emptyLabel,
}: VoteButtonsProps) {
  const h = size === "md" ? 34 : 26
  const fs = size === "md" ? 13.5 : 12
  const iconSize = size === "md" ? 17 : 14
  const showLabel = !!emptyLabel && voteCount === 0 && myVote === null

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: h,
        borderRadius: h / 2,
        border: "1px solid var(--wc-line-2)",
        background: "var(--wc-card)",
        overflow: "hidden",
      }}
    >
      <button
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: h,
          height: "100%",
          border: "none",
          background: myVote === "up" ? "var(--wc-soft)" : "transparent",
          color: myVote === "up" ? "var(--wc-burgundy)" : "var(--wc-mute)",
          fontSize: fs,
          fontWeight: 700,
          cursor: "pointer",
        }}
        onClick={() => onVote("up")}
        aria-label="추천"
        aria-pressed={myVote === "up"}
      >
        <ThumbsUp size={iconSize} style={{ fill: myVote === "up" ? "currentColor" : "none" }} />
      </button>
      <span
        key={voteCount}
        className="tnum animate-vote-bump"
        style={{
          minWidth: showLabel ? "auto" : 26,
          padding: showLabel ? "0 6px" : 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          textAlign: "center",
          fontSize: showLabel ? 13 : fs,
          fontWeight: showLabel ? 600 : 800,
          color: showLabel
            ? "var(--wc-mute)"
            : myVote === "up"
              ? "var(--wc-burgundy)"
              : "var(--wc-ink)",
        }}
      >
        {showLabel ? emptyLabel : voteCount}
      </span>
      <button
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: h,
          height: "100%",
          border: "none",
          background: myVote === "down" ? "var(--wc-soft)" : "transparent",
          color: myVote === "down" ? "var(--wc-blue, #4B96E6)" : "var(--wc-mute)",
          fontSize: fs,
          fontWeight: 700,
          cursor: "pointer",
        }}
        onClick={() => onVote("down")}
        aria-label="비추천"
        aria-pressed={myVote === "down"}
      >
        <ThumbsDown size={iconSize} style={{ fill: myVote === "down" ? "currentColor" : "none" }} />
      </button>
    </span>
  )
}
