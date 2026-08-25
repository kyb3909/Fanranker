"use client"

import { useState } from "react"
import { SAMPLES } from "./samples"
import { VARIANTS } from "./variants"

/**
 * 변주 비교 화면 — 같은 기사 4종을 각 안으로 렌더해 나란히 놓는다.
 *
 * 폭 토글이 있는 이유: 이 카드는 데스크탑 600px 컬럼과 모바일 360px 전체폭에서
 * 둘 다 성립해야 한다. 인터랙션 패널이 "360px 에서 투표 라벨이 87px(한글 5자)로
 * 무너진다"고 지적했는데, 말로는 안 보이고 폭을 줄여야 보인다.
 */
/**
 * 썸네일 비율 비교 — 편집 패널은 정사각, 정보구조 패널은 16:9 를 주장했다.
 * 말로는 안 끝나서 같은 원본(1200×630, 1.90:1)을 세 비율로 잘라 나란히 둔다.
 *
 * 산수: object-cover 는 짧은 축을 채우므로 남는 폭 비율 = (박스 비율 / 원본 비율).
 *   현행 1.37:1 → 71.8% · 1:1 → 52.5% · 16:9 → 93.3%
 * 즉 정사각은 지금보다 **더** 잘린다. 원본을 안 바꾸면 16:9 가 유일한 개선이다.
 */
function ThumbRatioStrip() {
  const src = "/images/news-team/bundesliga_dortmund.webp"
  const opts = [
    { label: "현행 104×76 (1.37:1)", w: 104, h: 76, keep: "71.8%" },
    { label: "정사각 92×92 (편집안)", w: 92, h: 92, keep: "52.5%" },
    { label: "16:9 128×72 (정보구조안)", w: 128, h: 72, keep: "93.3%" },
    { label: "원본 그대로 1200×630", w: 190, h: 100, keep: "100%" },
  ]
  return (
    <section
      style={{
        marginTop: 24,
        padding: 18,
        background: "var(--wc-card, #fff)",
        borderRadius: 12,
        boxShadow: "var(--wc-shadow-1, 0 1px 3px rgba(0,0,0,.06))",
      }}
    >
      <h2 style={{ fontSize: 15, fontWeight: 800, color: "var(--wc-ink)" }}>
        먼저 정할 것 — 썸네일 비율
      </h2>
      <p style={{ fontSize: 12, color: "var(--wc-mute)", marginTop: 4, wordBreak: "keep-all" }}>
        지금 구단 이미지는 1200×630(1.90:1)이라 좁은 박스에 넣으면 좌우가 잘립니다. 정사각은
        지금보다 <b>더</b> 잘리고(52.5%), 16:9 는 거의 안 잘립니다(93.3%). 구워진 팀명 글자 크기는
        현행 7.6px → 16:9 에서 9.4px 로, 읽히긴 하지만 <b>겨우</b> 읽히는 수준입니다. 아래 네 장을
        직접 비교해 보세요.
      </p>
      <div style={{ display: "flex", gap: 20, marginTop: 14, flexWrap: "wrap" }}>
        {opts.map((o) => (
          <figure key={o.label} style={{ margin: 0 }}>
            <img
              src={src}
              alt=""
              style={{
                width: o.w,
                height: o.h,
                objectFit: "cover",
                borderRadius: 8,
                display: "block",
              }}
            />
            <figcaption
              style={{ fontSize: 10, color: "var(--wc-mute)", marginTop: 5, lineHeight: 1.4 }}
            >
              {o.label}
              <br />
              가로 보존 {o.keep}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}

export function FeedLab() {
  const [width, setWidth] = useState(600)
  const [only, setOnly] = useState<string | null>(null)

  const shown = only ? VARIANTS.filter((v) => v.meta.id === only) : VARIANTS

  return (
    <div
      style={{
        background: "var(--wc-paper, #ffffff)",
        minHeight: "100dvh",
        padding: "24px 16px 80px",
      }}
    >
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--wc-ink)" }}>떡밥 카드 실험실</h1>
        <p style={{ fontSize: 13, color: "var(--wc-mute)", marginTop: 4 }}>
          디자인 패널 4인의 안을 같은 기사로 렌더했습니다. 마음에 드는 안의 이름을 알려주세요.
        </p>

        {/* 폭 토글 — 모바일 파열점을 눈으로 확인하는 장치 */}
        <div
          style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap", alignItems: "center" }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--wc-mute)" }}>폭</span>
          {[360, 480, 600].map((w) => (
            <button
              key={w}
              onClick={() => setWidth(w)}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: `1px solid ${width === w ? "var(--wc-burgundy)" : "var(--wc-line)"}`,
                background: width === w ? "var(--wc-burgundy)" : "#fff",
                color: width === w ? "#fff" : "var(--wc-mute)",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {w}px{w === 360 ? " (모바일)" : w === 600 ? " (데스크탑)" : ""}
            </button>
          ))}
          <span style={{ width: 12 }} />
          <button
            onClick={() => setOnly(null)}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              border: `1px solid ${!only ? "var(--wc-burgundy)" : "var(--wc-line)"}`,
              background: !only ? "var(--wc-burgundy)" : "#fff",
              color: !only ? "#fff" : "var(--wc-mute)",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            전체 보기
          </button>
        </div>

        <ThumbRatioStrip />

        {/* 변주 목록 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(auto-fill, minmax(${width + 40}px, 1fr))`,
            gap: 28,
            marginTop: 28,
            alignItems: "start",
          }}
        >
          {shown.map(({ meta, Comp }) => (
            <section key={meta.id} style={{ minWidth: 0 }}>
              <header style={{ marginBottom: 10 }}>
                <button
                  onClick={() => setOnly(meta.id)}
                  style={{
                    border: "none",
                    background: "none",
                    padding: 0,
                    fontSize: 15,
                    fontWeight: 800,
                    color: "var(--wc-ink)",
                    cursor: "pointer",
                  }}
                >
                  {meta.name}
                  <span
                    style={{
                      marginLeft: 8,
                      padding: "2px 7px",
                      borderRadius: 999,
                      background: "color-mix(in srgb, var(--wc-burgundy) 8%, transparent)",
                      color: "var(--wc-burgundy)",
                      fontSize: 10,
                      fontWeight: 700,
                      verticalAlign: "middle",
                    }}
                  >
                    {meta.author}
                  </span>
                </button>
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--wc-mute)",
                    marginTop: 4,
                    wordBreak: "keep-all",
                  }}
                >
                  {meta.intent}
                </p>
                {meta.dropped.length > 0 ? (
                  <p style={{ fontSize: 11, color: "var(--wc-mute)", marginTop: 3 }}>
                    버린 것: {meta.dropped.join(" · ")}
                  </p>
                ) : (
                  <p
                    style={{
                      fontSize: 11,
                      color: "var(--wc-burgundy)",
                      marginTop: 3,
                      fontWeight: 700,
                    }}
                  >
                    버린 것 없음 (비교 기준)
                  </p>
                )}
              </header>
              <div
                style={{
                  width,
                  maxWidth: "100%",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {SAMPLES.map((s) => (
                  <Comp key={s.id} s={s} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
