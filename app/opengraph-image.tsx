import { ImageResponse } from "next/og"

export const alt = "공놀이 - 스포츠 팬 커뮤니티"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function OgImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%)",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <div
          style={{
            fontSize: "72px",
            fontWeight: 800,
            color: "#ffffff",
            letterSpacing: "-2px",
          }}
        >
          gongnori.fan
        </div>
      </div>
      <div
        style={{
          fontSize: "32px",
          color: "#a0a0b0",
          fontWeight: 500,
        }}
      >
        그깟 공놀이에 진심인 팬들의 놀이터
      </div>
      <div
        style={{
          display: "flex",
          gap: "12px",
          marginTop: "40px",
        }}
      >
        {["⚽", "⚾", "🏀", "🏐", "🎮"].map((emoji) => (
          <div
            key={emoji}
            style={{
              fontSize: "36px",
              background: "rgba(255,255,255,0.1)",
              borderRadius: "12px",
              padding: "8px 16px",
            }}
          >
            {emoji}
          </div>
        ))}
      </div>
    </div>,
    { ...size }
  )
}
