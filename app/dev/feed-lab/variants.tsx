"use client"

import type { Sample } from "./samples"

/**
 * 카드 변주 구현 — 디자인 패널 4인의 안을 실제 마크업으로.
 *
 * 규칙(브리프 하드 제약):
 *  · 다크 금지(목록·카드·액션) · 좌측 액센트 보더 금지 · --wc-* 토큰만
 *  · 각 변주는 **무언가를 버려야** 한다. 버린 것을 meta.dropped 에 명시한다.
 */

interface VariantMeta {
  id: string
  name: string
  author: "편집" | "인터랙션" | "정보구조" | "회의론" | "현행"
  intent: string
  dropped: string[]
}

const L = "var(--wc-line, #e8e5e0)"
const INK = "var(--wc-ink, #1a1714)"
const MUTE = "var(--wc-mute, #5c6470)"
const BUR = "var(--wc-burgundy, #961e37)"
const CARD = "var(--wc-card, #fff)"

const card: React.CSSProperties = {
  background: CARD,
  boxShadow: "var(--wc-shadow-1, 0 1px 3px rgba(0,0,0,.06))",
  borderRadius: 12,
  overflow: "hidden",
}

/* ─────────────── 현행 (비교 기준) ─────────────── */

const CURRENT: VariantMeta = {
  id: "current",
  name: "현행",
  author: "현행",
  intent: "지금 프로덕션. 정보 11종이 한 카드에 있다.",
  dropped: [],
}

function Current({ s }: { s: Sample }) {
  return (
    <article
      style={{ ...card, display: "flex", gap: 12, alignItems: "center", padding: "12px 16px" }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: MUTE, marginBottom: 4 }}>
          {s.source} <span style={{ color: BUR }}>● {s.flair}</span>
        </p>
        <h2
          style={{
            fontSize: 14,
            fontWeight: 650,
            lineHeight: 1.38,
            color: INK,
            wordBreak: "keep-all",
          }}
        >
          {s.title}
        </h2>
        <div style={{ display: "flex", gap: 14, marginTop: 6, fontSize: 11, color: MUTE }}>
          <span>공놀이봇</span>
          <span>♡ {s.votes || ""}</span>
          <span>💬 {s.comments || ""}</span>
          <span>{s.ago}</span>
        </div>
        {s.vs && (
          <div
            style={{
              marginTop: 8,
              padding: 8,
              borderRadius: 8,
              background: "var(--wc-paper)",
              border: `1px solid ${L}`,
            }}
          >
            <p style={{ fontSize: 11, fontWeight: 700, color: INK, marginBottom: 6 }}>
              🗳️ {s.vs.question}
            </p>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: `1.5px solid ${L}`,
                  background: CARD,
                  fontSize: 11,
                  fontWeight: 700,
                  color: INK,
                  textAlign: "left",
                }}
              >
                {s.vs.a}
              </button>
              <button
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: `1.5px solid ${L}`,
                  background: CARD,
                  fontSize: 11,
                  fontWeight: 700,
                  color: INK,
                  textAlign: "left",
                }}
              >
                {s.vs.b}
              </button>
            </div>
            <p style={{ fontSize: 10, color: MUTE, marginTop: 4 }}>
              첫 표를 던져보세요 · 투표는 로그인 후
            </p>
          </div>
        )}
        {s.tarot && (
          <span
            style={{
              display: "inline-flex",
              marginTop: 8,
              padding: "4px 10px",
              borderRadius: 999,
              background: "color-mix(in srgb, var(--wc-burgundy) 7%, transparent)",
              color: BUR,
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            🔮 {s.tarot}
          </span>
        )}
      </div>
      <img
        src={s.image}
        alt=""
        style={{ width: 104, height: 76, objectFit: "cover", borderRadius: 8, flexShrink: 0 }}
      />
    </article>
  )
}

/* ─────────────── I-1 하단 액션 띠 (인터랙션 본안) ─────────────── */

const I1: VariantMeta = {
  id: "i1",
  name: "I-1 하단 액션 띠",
  author: "인터랙션",
  intent: "액션을 전폭 44px 띠로. 타겟은 커지고 카드는 짧아진다. 모든 카드 높이 동일.",
  dropped: ["작성자", "좋아요", "투표 질문", "안내문 2줄", "투표 박스 테두리"],
}

function I1Card({ s }: { s: Sample }) {
  return (
    <article style={card}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 16px" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: MUTE, marginBottom: 4 }}>
            {s.source} · {s.ago}
            {s.comments > 0 && ` · 💬${s.comments}`}
          </p>
          <h2
            style={{
              fontSize: 15,
              fontWeight: 700,
              lineHeight: 1.35,
              color: INK,
              wordBreak: "keep-all",
            }}
          >
            {s.title}
          </h2>
        </div>
        <img
          src={s.image}
          alt=""
          style={{ width: 78, height: 78, objectFit: "cover", borderRadius: 8, flexShrink: 0 }}
        />
      </div>
      <div
        style={{
          display: "flex",
          borderTop: `1px solid ${L}`,
          background: "color-mix(in srgb, var(--wc-burgundy) 3%, transparent)",
        }}
      >
        {s.vs ? (
          <>
            <button
              style={{
                flex: 1,
                height: 44,
                border: "none",
                background: "transparent",
                fontSize: 12,
                fontWeight: 700,
                color: INK,
                cursor: "pointer",
              }}
            >
              {s.vs.a}
            </button>
            <span style={{ width: 1, background: L }} />
            <button
              style={{
                flex: 1,
                height: 44,
                border: "none",
                background: "transparent",
                fontSize: 12,
                fontWeight: 700,
                color: INK,
                cursor: "pointer",
              }}
            >
              {s.vs.b}
            </button>
          </>
        ) : s.tarot ? (
          <button
            style={{
              flex: 1,
              height: 44,
              border: "none",
              background: "transparent",
              fontSize: 12,
              fontWeight: 700,
              color: BUR,
              cursor: "pointer",
            }}
          >
            🔮 이 이적, 타로로 봐볼까 →
          </button>
        ) : (
          <button
            style={{
              flex: 1,
              height: 44,
              border: "none",
              background: "transparent",
              fontSize: 12,
              fontWeight: 600,
              color: MUTE,
              cursor: "pointer",
            }}
          >
            댓글 {s.comments}개 보기 →
          </button>
        )}
      </div>
    </article>
  )
}

/* ─────────────── I-2 투표가 곧 게이지 ─────────────── */

const I2: VariantMeta = {
  id: "i2",
  name: "I-2 투표가 곧 게이지",
  author: "인터랙션",
  intent: "게이지 자체가 버튼. 결과를 보는 자리와 참여하는 자리가 하나.",
  dropped: ["작성자", "좋아요", "투표 질문", "안내문", "투표 박스"],
}

function I2Card({ s }: { s: Sample }) {
  return (
    <article style={card}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 16px" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: MUTE, marginBottom: 4 }}>
            {s.source} · {s.ago}
          </p>
          <h2
            style={{
              fontSize: 15,
              fontWeight: 700,
              lineHeight: 1.35,
              color: INK,
              wordBreak: "keep-all",
            }}
          >
            {s.title}
          </h2>
          {s.vs && (
            <div
              style={{
                display: "flex",
                marginTop: 10,
                height: 34,
                borderRadius: 8,
                overflow: "hidden",
                border: `1px solid ${L}`,
              }}
            >
              <button
                style={{
                  width: `${s.vs.aPct}%`,
                  border: "none",
                  background: "color-mix(in srgb, var(--wc-burgundy) 12%, white)",
                  color: BUR,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {s.vs.a}
              </button>
              <button
                style={{
                  flex: 1,
                  border: "none",
                  borderLeft: `1px solid ${L}`,
                  background: "color-mix(in srgb, #2c4a6e 10%, white)",
                  color: "#2c4a6e",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {s.vs.b}
              </button>
            </div>
          )}
          {s.tarot && (
            <div
              style={{
                marginTop: 10,
                height: 34,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 8,
                border: `1px dashed ${L}`,
                color: BUR,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              🔮 이 이적, 타로로 봐볼까
            </div>
          )}
        </div>
        <img
          src={s.image}
          alt=""
          style={{ width: 92, height: 92, objectFit: "cover", borderRadius: 8, flexShrink: 0 }}
        />
      </div>
    </article>
  )
}

/* ─────────────── E-1 인덱스 (편집: 조용한 목록형) ─────────────── */

const E1: VariantMeta = {
  id: "e1",
  name: "E-1 인덱스",
  author: "편집",
  intent: "타이포 3단 고정 + 여백만으로 그룹핑. 선·박스를 쓰지 않는다.",
  dropped: ["작성자", "좋아요", "투표 박스", "안내문", "투표 질문"],
}

function E1Card({ s }: { s: Sample }) {
  return (
    <article
      style={{ ...card, padding: "18px 20px", display: "flex", gap: 16, alignItems: "flex-start" }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <p
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.08em",
            color: MUTE,
            textTransform: "uppercase",
          }}
        >
          {s.source}
        </p>
        <h2
          style={{
            fontSize: 16,
            fontWeight: 700,
            lineHeight: 1.4,
            color: INK,
            marginTop: 8,
            wordBreak: "keep-all",
          }}
        >
          {s.title}
        </h2>
        {s.vs && (
          <div style={{ display: "flex", gap: 20, marginTop: 20 }}>
            <button
              style={{
                border: "none",
                background: "none",
                padding: 0,
                fontSize: 13,
                fontWeight: 500,
                color: INK,
                cursor: "pointer",
                borderBottom: `2px solid ${BUR}`,
                paddingBottom: 2,
              }}
            >
              {s.vs.a}
            </button>
            <button
              style={{
                border: "none",
                background: "none",
                padding: 0,
                fontSize: 13,
                fontWeight: 500,
                color: MUTE,
                cursor: "pointer",
                borderBottom: `2px solid ${L}`,
                paddingBottom: 2,
              }}
            >
              {s.vs.b}
            </button>
          </div>
        )}
        {s.tarot && (
          <button
            style={{
              border: "none",
              background: "none",
              padding: 0,
              marginTop: 20,
              fontSize: 13,
              fontWeight: 500,
              color: BUR,
              cursor: "pointer",
            }}
          >
            🔮 타로로 보기
          </button>
        )}
      </div>
      <img
        src={s.image}
        alt=""
        style={{ width: 116, height: 116, objectFit: "cover", borderRadius: 4, flexShrink: 0 }}
      />
    </article>
  )
}

/* ─────────────── E-3 판(plate)형 ─────────────── */

const E3: VariantMeta = {
  id: "e3",
  name: "E-3 판형",
  author: "편집",
  intent: "큰 정사각 이미지 + 투표는 3px 결과 바로 축약(62px → 13px).",
  dropped: ["작성자", "좋아요", "투표 버튼(결과만)", "안내문", "투표 질문"],
}

function E3Card({ s }: { s: Sample }) {
  return (
    <article style={{ ...card, display: "flex", gap: 16, padding: 16, alignItems: "center" }}>
      <img
        src={s.image}
        alt=""
        style={{ width: 132, height: 132, objectFit: "cover", borderRadius: 6, flexShrink: 0 }}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: BUR }}>
          {s.flair}
        </p>
        <h2
          style={{
            fontSize: 16,
            fontWeight: 700,
            lineHeight: 1.36,
            color: INK,
            marginTop: 6,
            wordBreak: "keep-all",
          }}
        >
          {s.title}
        </h2>
        <p style={{ fontSize: 11, color: MUTE, marginTop: 8 }}>
          {s.source} · {s.ago}
        </p>
        {s.vs && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", height: 3, borderRadius: 2, overflow: "hidden" }}>
              <span style={{ width: `${s.vs.aPct}%`, background: BUR }} />
              <span style={{ flex: 1, background: "#2c4a6e" }} />
            </div>
            <p style={{ fontSize: 11, color: MUTE, marginTop: 6 }}>
              <button
                style={{
                  border: "none",
                  background: "none",
                  padding: 0,
                  color: INK,
                  fontWeight: 600,
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                {s.vs.a}
              </button>
              {" · "}
              <button
                style={{
                  border: "none",
                  background: "none",
                  padding: 0,
                  color: INK,
                  fontWeight: 600,
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                {s.vs.b}
              </button>
            </p>
          </div>
        )}
      </div>
    </article>
  )
}

/* ─────────────── A-7 액션 한 슬롯 (정보구조) ─────────────── */

const A7: VariantMeta = {
  id: "a7",
  name: "A-7 액션 한 슬롯",
  author: "정보구조",
  intent: "액션 슬롯을 32px로 고정 — 투표든 타로든 없든 같은 높이. 높이 분산 0.",
  dropped: ["작성자", "좋아요", "시간", "안내문", "투표 박스"],
}

function A7Card({ s }: { s: Sample }) {
  return (
    <article
      style={{ ...card, display: "flex", gap: 12, alignItems: "flex-start", padding: "14px 16px" }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: MUTE, marginBottom: 5 }}>
          <span style={{ color: BUR }}>{s.flair}</span> · {s.source}
        </p>
        <h2
          style={{
            fontSize: 15,
            fontWeight: 700,
            lineHeight: 1.36,
            color: INK,
            wordBreak: "keep-all",
          }}
        >
          {s.title}
        </h2>
        <div style={{ height: 32, display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
          {s.vs ? (
            <>
              <button
                style={{
                  height: 30,
                  padding: "0 12px",
                  borderRadius: 6,
                  border: `1px solid ${L}`,
                  background: CARD,
                  fontSize: 12,
                  fontWeight: 700,
                  color: INK,
                  cursor: "pointer",
                }}
              >
                {s.vs.a}
              </button>
              <button
                style={{
                  height: 30,
                  padding: "0 12px",
                  borderRadius: 6,
                  border: `1px solid ${L}`,
                  background: CARD,
                  fontSize: 12,
                  fontWeight: 700,
                  color: INK,
                  cursor: "pointer",
                }}
              >
                {s.vs.b}
              </button>
            </>
          ) : (
            <button
              style={{
                height: 30,
                padding: "0 12px",
                borderRadius: 6,
                border: `1px solid ${L}`,
                background: CARD,
                fontSize: 12,
                fontWeight: 700,
                color: BUR,
                cursor: "pointer",
              }}
            >
              🔮 타로로 보기
            </button>
          )}
        </div>
      </div>
      <img
        src={s.image}
        alt=""
        style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 8, flexShrink: 0 }}
      />
    </article>
  )
}

/* ─────────────── C-1 투표 추방형 (회의론) ─────────────── */

const C1: VariantMeta = {
  id: "c1",
  name: "C-1 투표 추방",
  author: "회의론",
  intent: "참여 1.3%짜리 기능을 피드에서 뺀다. 카드는 기사만 말한다.",
  dropped: ["투표 전체", "작성자", "좋아요", "안내문", "타로 버튼"],
}

function C1Card({ s }: { s: Sample }) {
  return (
    <article
      style={{ ...card, display: "flex", gap: 12, alignItems: "center", padding: "13px 16px" }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: MUTE, marginBottom: 4 }}>
          <span style={{ color: BUR }}>{s.flair}</span> · {s.source} · {s.ago}
        </p>
        <h2
          style={{
            fontSize: 15,
            fontWeight: 700,
            lineHeight: 1.36,
            color: INK,
            wordBreak: "keep-all",
          }}
        >
          {s.title}
        </h2>
        {s.comments > 0 && (
          <p style={{ fontSize: 11, color: MUTE, marginTop: 6 }}>💬 {s.comments}</p>
        )}
      </div>
      <img
        src={s.image}
        alt=""
        style={{ width: 88, height: 88, objectFit: "cover", borderRadius: 8, flexShrink: 0 }}
      />
    </article>
  )
}

/* ─────────────── C-2 텍스트 전용 (플레이스홀더 폐기) ─────────────── */

const C2: VariantMeta = {
  id: "c2",
  name: "C-2 텍스트 전용",
  author: "회의론",
  intent: "가짜 썸네일을 버린다. 이미지 없는 기사는 텍스트로 당당하게.",
  dropped: ["구단 플레이스홀더", "작성자", "좋아요", "안내문", "투표 박스"],
}

function C2Card({ s }: { s: Sample }) {
  return (
    <article style={{ ...card, padding: "16px 18px" }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: MUTE, marginBottom: 6 }}>
        <span style={{ color: BUR }}>{s.flair}</span> · {s.source} · {s.ago}
      </p>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <h2
          style={{
            flex: 1,
            fontSize: 16,
            fontWeight: 700,
            lineHeight: 1.38,
            color: INK,
            wordBreak: "keep-all",
          }}
        >
          {s.title}
        </h2>
        {s.photo && (
          <img
            src={s.image}
            alt=""
            style={{ width: 104, height: 68, objectFit: "cover", borderRadius: 6, flexShrink: 0 }}
          />
        )}
      </div>
      {s.vs && (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button
            style={{
              flex: 1,
              height: 36,
              borderRadius: 6,
              border: `1px solid ${L}`,
              background: CARD,
              fontSize: 12,
              fontWeight: 700,
              color: INK,
              cursor: "pointer",
            }}
          >
            {s.vs.a}
          </button>
          <button
            style={{
              flex: 1,
              height: 36,
              borderRadius: 6,
              border: `1px solid ${L}`,
              background: CARD,
              fontSize: 12,
              fontWeight: 700,
              color: INK,
              cursor: "pointer",
            }}
          >
            {s.vs.b}
          </button>
        </div>
      )}
    </article>
  )
}

/* ─────────────── C-3 구단 배지형 ─────────────── */

const C3: VariantMeta = {
  id: "c3",
  name: "C-3 구단 배지",
  author: "회의론",
  intent: "1200×630 이미지 대신 팀 컬러 배지 하나. 썸네일 크롭 문제가 원천 소멸.",
  dropped: ["구단 플레이스홀더 이미지", "작성자", "좋아요", "안내문"],
}

const TEAM_COLOR: Record<string, string> = {
  토트넘: "#132257",
  뉴스: "#5c6470",
  이적: "#961e37",
  첼시: "#034694",
}

function C3Card({ s }: { s: Sample }) {
  const color = TEAM_COLOR[s.flair] ?? BUR
  return (
    <article
      style={{ ...card, display: "flex", gap: 12, alignItems: "center", padding: "13px 16px" }}
    >
      {s.photo ? (
        <img
          src={s.image}
          alt=""
          style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 10, flexShrink: 0 }}
        />
      ) : (
        <span
          style={{
            width: 56,
            height: 56,
            borderRadius: 10,
            background: color,
            color: "#fff",
            display: "grid",
            placeItems: "center",
            fontSize: 13,
            fontWeight: 800,
            flexShrink: 0,
            textAlign: "center",
            lineHeight: 1.15,
            padding: 4,
          }}
        >
          {s.flair.slice(0, 3)}
        </span>
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: MUTE, marginBottom: 3 }}>
          {s.source} · {s.ago}
        </p>
        <h2
          style={{
            fontSize: 15,
            fontWeight: 700,
            lineHeight: 1.36,
            color: INK,
            wordBreak: "keep-all",
          }}
        >
          {s.title}
        </h2>
        {s.vs && (
          <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
            <button
              style={{
                padding: "5px 11px",
                borderRadius: 999,
                border: `1px solid ${L}`,
                background: CARD,
                fontSize: 11,
                fontWeight: 700,
                color: INK,
                cursor: "pointer",
              }}
            >
              {s.vs.a}
            </button>
            <button
              style={{
                padding: "5px 11px",
                borderRadius: 999,
                border: `1px solid ${L}`,
                background: CARD,
                fontSize: 11,
                fontWeight: 700,
                color: INK,
                cursor: "pointer",
              }}
            >
              {s.vs.b}
            </button>
          </div>
        )}
      </div>
    </article>
  )
}

/* ─────────────── A-2 제목 목록 (썸네일 없음) ─────────────── */

const A2: VariantMeta = {
  id: "a2",
  name: "A-2 제목 목록",
  author: "정보구조",
  intent: "가장 급진. 제목과 액션만. 스크롤당 기사 수 최대.",
  dropped: ["썸네일", "작성자", "좋아요", "시간", "안내문", "투표 질문"],
}

function A2Card({ s }: { s: Sample }) {
  return (
    <article style={{ background: CARD, padding: "14px 18px", borderBottom: `1px solid ${L}` }}>
      <h2
        style={{
          fontSize: 15,
          fontWeight: 650,
          lineHeight: 1.4,
          color: INK,
          wordBreak: "keep-all",
        }}
      >
        <span style={{ color: BUR, fontWeight: 700, fontSize: 12, marginRight: 6 }}>{s.flair}</span>
        {s.title}
      </h2>
      {s.vs && (
        <p style={{ marginTop: 8, fontSize: 12 }}>
          <button
            style={{
              border: "none",
              background: "none",
              padding: 0,
              color: INK,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {s.vs.a}
          </button>
          <span style={{ color: MUTE, margin: "0 8px" }}>vs</span>
          <button
            style={{
              border: "none",
              background: "none",
              padding: 0,
              color: INK,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {s.vs.b}
          </button>
        </p>
      )}
    </article>
  )
}

export const VARIANTS: { meta: VariantMeta; Comp: (p: { s: Sample }) => React.ReactElement }[] = [
  { meta: CURRENT, Comp: Current },
  { meta: I1, Comp: I1Card },
  { meta: I2, Comp: I2Card },
  { meta: E1, Comp: E1Card },
  { meta: E3, Comp: E3Card },
  { meta: A7, Comp: A7Card },
  { meta: A2, Comp: A2Card },
  { meta: C1, Comp: C1Card },
  { meta: C2, Comp: C2Card },
  { meta: C3, Comp: C3Card },
]
