"use client"

import { useState } from "react"
import Image from "next/image"
import { SPREADS, SPREAD_IDS, type SpreadId } from "@/lib/tarot/spreads"
import { expressionSrc, type Expression } from "@/lib/tarot/expression"

/**
 * 축구 타로 — 질문 → 스프레드 선택 → 카드 → 루나의 해석.
 *
 * 비로그인도 전부 쓸 수 있다 (유입 표면 기준: 유저 0명 성립 + 비로그인 가치).
 * 오락 목적 고지는 화면 하단에 **상시** 노출 — 카카오 심사 소명과 같은 선상이다.
 */

interface ReadingCard {
  position: number
  positionName: string
  arcana: number
  nameKo: string
  name: string
  reversed: boolean
  image: string
}

interface ReadingResult {
  question: string
  spread: { id: string; name: string }
  cards: ReadingCard[]
  reading: string
  expression: Expression
}

interface BlockedResult {
  blocked: "crisis" | "gambling"
  message: string
  resources?: readonly { name: string; contact: string }[]
  expression: Expression
}

/** 질문 프리셋 — 빈 입력창은 콜드스타트에서 가장 큰 마찰이다 */
const PRESETS = [
  "오늘 우리 팀 이길 수 있을까요?",
  "이번 이적설, 진짜 성사될까요?",
  "우리 팀 이번 시즌 어디까지 갈까요?",
  "감독 계속 믿어도 될까요?",
  "이 선수 영입하는 게 맞을까요?",
]

export function TarotClient() {
  const [question, setQuestion] = useState("")
  const [spreadId, setSpreadId] = useState<SpreadId>("three")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ReadingResult | null>(null)
  const [blocked, setBlocked] = useState<BlockedResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const q = question.trim()
    if (q.length < 2 || loading) return
    setLoading(true)
    setError(null)
    setResult(null)
    setBlocked(null)
    try {
      const res = await fetch("/api/tarot/reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, spreadId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? "리딩에 실패했어요.")
      } else if (data.blocked) {
        setBlocked(data as BlockedResult)
      } else {
        setResult(data as ReadingResult)
      }
    } catch {
      setError("연결이 불안정해요. 다시 시도해주세요.")
    } finally {
      setLoading(false)
    }
  }

  const expression: Expression = blocked?.expression ?? result?.expression ?? "neutral"

  return (
    <div className="mx-auto max-w-[680px] px-4 pt-5 pb-16 sm:px-6">
      {/* 루나 */}
      <div className="flex flex-col items-center">
        <div
          className="relative aspect-square w-full max-w-[340px] overflow-hidden rounded-2xl"
          style={{ boxShadow: "var(--wc-shadow-1)" }}
        >
          <Image
            src={expressionSrc(loading ? "focused" : expression)}
            alt="타로 리더 루나"
            fill
            sizes="340px"
            className="object-cover"
            priority
          />
          {/* 정지 일러스트에 생기를 주는 오버레이 (globals.css).
              이미지에 빛을 구워 넣지 않는 이유: 표정 6종을 매번 다시 뽑아야 하고
              그때마다 빛의 세기가 달라진다. 좌표는 생성 프롬프트가 구도를 고정해 유효하다. */}
          <span aria-hidden className="tarot-orb-aura" />
          <span aria-hidden className="tarot-candle-glow" />
        </div>
        <h1 className="mt-4 text-[22px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
          루나의 축구 점집
        </h1>
        <p className="mt-1 text-center text-[13.5px]" style={{ color: "var(--wc-mute)" }}>
          {loading ? "카드를 펼치는 중이에요…" : "궁금한 걸 물어보세요. 카드가 흐름을 비춰줄게요."}
        </p>
      </div>

      {/* 질문 */}
      <div className="mt-6">
        <label
          htmlFor="tarot-q"
          className="mb-1.5 block text-[12px] font-bold"
          style={{ color: "var(--wc-mute)" }}
        >
          무엇이 궁금한가요?
        </label>
        <textarea
          id="tarot-q"
          value={question}
          onChange={(e) => setQuestion(e.target.value.slice(0, 200))}
          placeholder="예: 오늘 아스날 이길 수 있을까요?"
          rows={2}
          className="w-full resize-none rounded-xl px-3.5 py-3 text-[14px] outline-none"
          style={{
            background: "var(--wc-card)",
            border: "1px solid var(--wc-line)",
            color: "var(--wc-ink)",
          }}
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setQuestion(p)}
              className="rounded-full px-2.5 py-1.5 text-[12px] font-semibold transition-colors"
              style={{
                background: "var(--wc-card)",
                border: "1px solid var(--wc-line-2)",
                color: "var(--wc-mute)",
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* 스프레드 */}
      <div className="mt-5">
        <p className="mb-1.5 text-[12px] font-bold" style={{ color: "var(--wc-mute)" }}>
          몇 장으로 볼까요?
        </p>
        <div className="grid grid-cols-2 gap-2">
          {SPREAD_IDS.map((id) => {
            const s = SPREADS[id]
            const active = spreadId === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSpreadId(id)}
                aria-pressed={active}
                className="rounded-xl px-3 py-2.5 text-left transition-all"
                style={{
                  background: active
                    ? "color-mix(in srgb, var(--wc-burgundy) 7%, white)"
                    : "var(--wc-card)",
                  border: `1.5px solid ${active ? "var(--wc-burgundy)" : "var(--wc-line)"}`,
                }}
              >
                <span
                  className="block text-[13.5px] font-bold"
                  style={{ color: active ? "var(--wc-burgundy)" : "var(--wc-ink)" }}
                >
                  {s.name}
                </span>
                <span className="mt-0.5 block text-[11.5px]" style={{ color: "var(--wc-mute)" }}>
                  {s.hint}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={loading || question.trim().length < 2}
        className="mt-4 w-full rounded-xl py-3 text-[14px] font-bold transition-opacity disabled:opacity-45"
        style={{ background: "var(--wc-burgundy)", color: "#fff" }}
      >
        {loading ? "루나가 카드를 읽는 중…" : "카드 뽑기"}
      </button>

      {error && (
        <p className="mt-3 text-center text-[13px]" style={{ color: "var(--wc-burgundy)" }}>
          {error}
        </p>
      )}

      {/* 안전 가드 응답 */}
      {blocked && (
        <div
          className="mt-6 rounded-xl p-4"
          style={{ background: "var(--wc-soft)", border: "1px solid var(--wc-line)" }}
        >
          <p className="text-[14px] leading-relaxed" style={{ color: "var(--wc-ink)" }}>
            {blocked.message}
          </p>
          {blocked.resources && (
            <ul className="mt-3 space-y-1">
              {blocked.resources.map((r) => (
                <li key={r.name} className="text-[13px]" style={{ color: "var(--wc-ink-2)" }}>
                  <span className="font-bold">{r.name}</span> · {r.contact}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 결과 */}
      {result && (
        <div className="mt-7">
          <div
            className={`grid gap-2.5 ${result.cards.length === 1 ? "grid-cols-1 justify-items-center" : "grid-cols-3"}`}
          >
            {result.cards.map((c) => (
              <figure key={c.position} className="min-w-0">
                <div
                  className="relative overflow-hidden rounded-lg"
                  style={{
                    aspectRatio: "2 / 3",
                    maxWidth: result.cards.length === 1 ? 200 : undefined,
                    margin: "0 auto",
                    border: "1px solid var(--wc-line)",
                  }}
                >
                  <Image
                    src={c.image}
                    alt={c.nameKo}
                    fill
                    sizes="(max-width: 640px) 33vw, 200px"
                    // 역방향은 실제로 뒤집어 보여준다 — 카드가 뒤집혔다는 걸 글로만 말하면 안 와닿는다
                    className="object-cover"
                    style={c.reversed ? { transform: "rotate(180deg)" } : undefined}
                  />
                </div>
                <figcaption className="mt-1.5 text-center">
                  <span
                    className="block text-[11px] font-bold"
                    style={{ color: "var(--wc-burgundy)" }}
                  >
                    {c.positionName}
                  </span>
                  <span
                    className="block text-[12.5px] font-semibold"
                    style={{ color: "var(--wc-ink)" }}
                  >
                    {c.nameKo}
                    {c.reversed && (
                      <span className="ml-1 text-[11px]" style={{ color: "var(--wc-mute)" }}>
                        역
                      </span>
                    )}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>

          <div
            className="mt-5 rounded-xl p-4"
            style={{ background: "var(--wc-card)", border: "1px solid var(--wc-line)" }}
          >
            {result.reading.split("\n").map((line, i) => {
              const t = line.trim()
              if (!t) return null
              if (t.startsWith("###")) {
                return (
                  <p
                    key={i}
                    className="mt-3 mb-1 text-[13.5px] font-extrabold first:mt-0"
                    style={{ color: "var(--wc-burgundy)" }}
                  >
                    {t.replace(/^#+\s*/, "")}
                  </p>
                )
              }
              return (
                <p
                  key={i}
                  className="text-[14px] leading-relaxed"
                  style={{ color: "var(--wc-ink-2)", wordBreak: "keep-all" }}
                >
                  {t}
                </p>
              )
            })}
          </div>

          <button
            type="button"
            onClick={submit}
            className="mt-3 w-full rounded-xl py-2.5 text-[13px] font-bold"
            style={{
              background: "var(--wc-card)",
              border: "1px solid var(--wc-line)",
              color: "var(--wc-ink-2)",
            }}
          >
            같은 질문으로 다시 뽑기
          </button>
        </div>
      )}

      {/* 오락 목적 고지 — 상시 노출 */}
      <p className="mt-8 text-center text-[11.5px]" style={{ color: "var(--wc-mute)" }}>
        타로 리딩은 오락 목적의 콘텐츠예요. 경기 결과나 이적을 예측하지 않으며,
        <br />
        어떤 형태의 금전적 판단에도 사용할 수 없어요.
      </p>
    </div>
  )
}
