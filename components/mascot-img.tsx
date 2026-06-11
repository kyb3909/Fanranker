"use client"

import { useState } from "react"

export function MascotImg() {
  const [error, setError] = useState(false)

  if (error) {
    return <div style={{ fontSize: 64, marginBottom: 20, textAlign: "center" as const }}>⚽</div>
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/mascot/bet-slip.png"
      alt="⚽"
      width={96}
      height={96}
      style={{ margin: "0 auto 20px", display: "block" }}
      onError={() => setError(true)}
    />
  )
}
