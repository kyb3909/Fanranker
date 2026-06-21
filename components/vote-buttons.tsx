"use client"

import { ThumbsUp, ThumbsDown } from "lucide-react"

interface VoteButtonsProps {
  voteCount: number
  myVote: "up" | "down" | null
  onVote: (type: "up" | "down") => void
  size?: "sm" | "md"
}

export function VoteButtons({ voteCount, myVote, onVote, size = "sm" }: VoteButtonsProps) {
  const h = size === "md" ? 34 : 26
  const fs = size === "md" ? 13.5 : 12
  const iconSize = size === "md" ? 17 : 14

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
          minWidth: 26,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          textAlign: "center",
          fontSize: fs,
          fontWeight: 800,
          color: myVote === "up" ? "var(--wc-burgundy)" : "var(--wc-ink)",
        }}
      >
        {voteCount}
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
