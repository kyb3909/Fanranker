"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { SPREADS, SPREAD_IDS, type SpreadId } from "@/lib/tarot/spreads"
import { DEFAULT_EXPRESSION, expressionSrc, type Expression } from "@/lib/tarot/expression"
import { StagePanel } from "@/components/tarot/stage-panel"
import type { ReadingCard } from "@/components/tarot/card-table"

/**
 * 축구 타로 리더 — 루나의 점집 (2026-08-15 전면 개편).
 *
 * ## 왜 다시 썼나
 * 종전 화면은 폼 → 스피너 → 결과 덤프였다. 원본 서비스(D:/Projects/tarot)와 나란히 놓고
 * 보니 로직(lib/tarot/*)만 이식되고 **연출이 통째로 빠져 있었다.** 운영자 평: "삭막하다".
 * 원본에서 리딩은 조회가 아니라 **사건**이다 — 질문에 반응하고, 카드를 깔고, 사용자가
 * 한 장씩 뒤집고, 말이 흘러나오고, 끝나면 더 물어볼 수 있다.
 *
 * ## 단계
 *   intro   질문·스프레드 고르기
 *   dealing 카드를 까는 중 (스트림이 카드를 먼저 보낸다)
 *   stage   사용자가 한 장씩 뒤집는 의식. 그동안 해석은 뒤에서 흐르고 있다
 *   chat    다 뒤집으면 해석이 타이핑되듯 드러나고, 이어서 후속 질문
 *
 * ⚠️ 뒤집기는 **연출일 뿐** 결과를 바꾸지 않는다. 카드는 서버가 이미 확정했다.
 * ⚠️ 스트림이 먼저 끝나도 뒤집기가 끝날 때까지 무대를 지킨다 — 의식을 건너뛰면
 *    다시 "결과 덤프"가 된다.
 *
 * 모달/페이지 두 표면이 이 컴포넌트를 공유한다 (질문의 출처만 다르다).
 * 비로그인도 전부 쓸 수 있고, 오락 목적 고지는 상시 노출한다.
 */

type Phase = "intro" | "dealing" | "stage" | "chat"

interface BlockedResult {
  message: string
  resources?: readonly { name: string; contact: string }[]
}

interface Turn {
  role: "user" | "luna"
  text: string
}

/** 질문 프리셋 — 빈 입력창은 콜드스타트에서 가장 큰 마찰이다 */
const PRESETS = [
  "오늘 우리 팀 이길 수 있을까요?",
  "이번 이적설, 진짜 성사될까요?",
  "우리 팀 이번 시즌 어디까지 갈까요?",
  "감독 계속 믿어도 될까요?",
]

interface TarotReaderProps {
  /** 프리필될 질문 — 페이지는 ?q=, 모달은 기사 제목에서 만든 질문을 넘긴다 */
  initialQuestion?: string
  /** 모달 안에서 쓰이는가 — 세로 예산이 페이지의 절반도 안 돼 무대를 낮춘다 */
  inModal?: boolean
}

/** NDJSON 스트림을 한 줄씩 넘겨준다 */
async function readNdjson(res: Response, onLine: (o: Record<string, unknown>) => void) {
  const reader = res.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  let buf = ""
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split("\n")
    buf = lines.pop() ?? ""
    for (const l of lines) {
      const t = l.trim()
      if (!t) continue
      try {
        onLine(JSON.parse(t))
      } catch {
        /* 깨진 줄은 버린다 */
      }
    }
  }
}

export function TarotReader({ initialQuestion = "", inModal = false }: TarotReaderProps) {
  const [phase, setPhase] = useState<Phase>("intro")
  const [question, setQuestion] = useState(() => initialQuestion.slice(0, 200))
  const [askedQuestion, setAskedQuestion] = useState("")
  const [spreadId, setSpreadId] = useState<SpreadId>("three")

  const [cards, setCards] = useState<ReadingCard[]>([])
  const [flipped, setFlipped] = useState<Set<number>>(new Set())
  const [expression, setExpression] = useState<Expression>(DEFAULT_EXPRESSION)

  const [reading, setReading] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [shownLen, setShownLen] = useState(0)

  const [blocked, setBlocked] = useState<BlockedResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [turns, setTurns] = useState<Turn[]>([])
  const [followup, setFollowup] = useState("")
  const [followupBusy, setFollowupBusy] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const allFlipped = cards.length > 0 && flipped.size === cards.length

  // 다 뒤집으면 무대를 대화로 넘긴다
  useEffect(() => {
    if (allFlipped && phase === "stage") setPhase("chat")
  }, [allFlipped, phase])

  // 해석을 타이핑하듯 드러낸다 — 이미 다 받아둔 텍스트라도 한 번에 떨구지 않는다.
  // 뒤집기가 끝나기 전엔 시작하지 않는다(의식이 먼저).
  useEffect(() => {
    if (!allFlipped || shownLen >= reading.length) return
    const step = Math.max(2, Math.ceil((reading.length - shownLen) / 60))
    const id = setTimeout(() => setShownLen((l) => Math.min(reading.length, l + step)), 16)
    return () => clearTimeout(id)
  }, [allFlipped, shownLen, reading])

  // 말이 늘어나면 아래를 따라간다
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [shownLen, turns])

  const flip = useCallback((position: number) => {
    setFlipped((prev) => {
      const next = new Set(prev)
      next.add(position)
      return next
    })
  }, [])

  async function submit() {
    const q = question.trim()
    if (q.length < 2 || phase === "dealing") return
    setPhase("dealing")
    setError(null)
    setBlocked(null)
    setCards([])
    setFlipped(new Set())
    setReading("")
    setShownLen(0)
    setTurns([])
    setAskedQuestion(q)
    setExpression("focused")
    setStreaming(true)
    try {
      const res = await fetch("/api/tarot/reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, spreadId }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j?.error ?? "리딩에 실패했어요.")
        setPhase("intro")
        return
      }
      await readNdjson(res, (o) => {
        switch (o.type) {
          case "blocked":
            setBlocked({
              message: String(o.message ?? ""),
              resources: o.resources as BlockedResult["resources"],
            })
            setExpression((o.expression as Expression) ?? "worried")
            setPhase("intro")
            break
          case "cards":
            setCards((o.cards as ReadingCard[]) ?? [])
            setPhase("stage")
            break
          case "expression":
            setExpression(o.value as Expression)
            break
          case "delta":
            setReading((t) => t + String(o.t ?? ""))
            break
          case "error":
            setError(String(o.message ?? "리딩에 실패했어요."))
            break
        }
      })
    } catch {
      setError("연결이 불안정해요. 다시 시도해주세요.")
      setPhase((p) => (p === "dealing" ? "intro" : p))
    } finally {
      setStreaming(false)
    }
  }

  async function askFollowup() {
    const q = followup.trim()
    if (q.length < 2 || followupBusy) return
    setFollowup("")
    setFollowupBusy(true)
    setTurns((t) => [...t, { role: "user", text: q }, { role: "luna", text: "" }])
    try {
      const res = await fetch("/api/tarot/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: askedQuestion,
          reading,
          cards: cards.map((c) => ({
            positionName: c.positionName,
            nameKo: c.nameKo,
            reversed: c.reversed,
          })),
          followup: q,
          history: turns.slice(-6),
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setTurns((t) => {
          const n = [...t]
          n[n.length - 1] = { role: "luna", text: j?.error ?? "대답을 받지 못했어요." }
          return n
        })
        return
      }
      await readNdjson(res, (o) => {
        if (o.type === "delta" || o.type === "blocked" || o.type === "error") {
          const piece = String(o.t ?? o.message ?? "")
          setTurns((t) => {
            const n = [...t]
            const last = n[n.length - 1]
            n[n.length - 1] = {
              role: "luna",
              text: o.type === "delta" ? last.text + piece : piece,
            }
            return n
          })
        }
      })
    } catch {
      setTurns((t) => {
        const n = [...t]
        n[n.length - 1] = { role: "luna", text: "연결이 불안정해요." }
        return n
      })
    } finally {
      setFollowupBusy(false)
    }
  }

  /** 판을 접고 처음으로 — 질문은 지운다(같은 질문 재리딩은 다시 입력하면 된다) */
  function reset() {
    setPhase("intro")
    setCards([])
    setFlipped(new Set())
    setReading("")
    setShownLen(0)
    setTurns([])
    setBlocked(null)
    setError(null)
    setAskedQuestion("")
    setExpression(DEFAULT_EXPRESSION)
  }

  const shown = reading.slice(0, shownLen)
  const typing = allFlipped && (shownLen < reading.length || streaming)
  const busy = phase === "dealing" || followupBusy || typing

  /** 루나가 지금 무슨 상태인지 한 줄 — 무대의 자막이자 채팅 헤더의 상태 */
  const status = blocked
    ? "잠깐, 그건 카드로 볼 일이 아니에요"
    : phase === "intro"
      ? "타로 리더"
      : phase === "dealing"
        ? "카드를 고르는 중…"
        : phase === "stage"
          ? flipped.size === 0
            ? "카드를 깔았어요 — 한 장씩 뒤집어 보세요"
            : `${cards.length - flipped.size}장 남았어요`
          : typing
            ? "카드를 읽는 중…"
            : "타로 리더"

  /** 입력창 하나가 질문과 후속 질문을 모두 받는다 — 그래야 대화로 읽힌다 */
  const canSend = phase === "intro" ? question.trim().length >= 2 : phase === "chat" && !typing
  const send = () => {
    if (phase === "intro") void submit()
    else if (phase === "chat" && !typing) void askFollowup()
  }

  return (
    <div className={inModal ? "" : "mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6"}>
      <div
        className="overflow-hidden rounded-2xl lg:flex"
        style={{
          border: "1px solid var(--wc-line)",
          boxShadow: "var(--wc-shadow-2)",
          height: undefined,
        }}
      >
        {/* ── 좌: 무대 ──
            데스크톱은 왼쪽 절반을 차지해 오른쪽 채팅과 마주 본다.
            좁은 화면에서는 채팅 위에 얹히는 가로 띠가 된다. */}
        <StagePanel
          expression={expression}
          cards={cards}
          flipped={flipped}
          onFlip={flip}
          caption={phase === "intro" ? "궁금한 걸 물어보세요" : status}
          dealing={phase === "dealing"}
          className={`h-[260px] w-full shrink-0 lg:h-auto lg:w-1/2 ${inModal ? "lg:min-h-[460px]" : "lg:min-h-[560px]"}`}
        />

        {/* ── 우: 채팅 ── */}
        <div className="flex min-w-0 flex-1 flex-col" style={{ background: "var(--wc-paper)" }}>
          {/* 헤더 — 이게 있어야 "루나와의 방"으로 읽힌다 */}
          <div
            className="flex flex-none items-center gap-2.5 px-4 py-3"
            style={{ borderBottom: "1px solid var(--wc-line)", background: "var(--wc-card)" }}
          >
            <span
              className="relative block h-9 w-9 shrink-0 overflow-hidden rounded-full"
              style={{ border: "1.5px solid var(--wc-burgundy)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={expressionSrc(expression)}
                alt=""
                className="h-full w-full object-cover"
                style={{ objectPosition: "center 18%" }}
              />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[14.5px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
                루나 <span className="align-[1px] text-[10px] text-[var(--wc-burgundy)]">✦</span>
              </span>
              <span className="truncate text-[11.5px]" style={{ color: "var(--wc-mute)" }}>
                {status}
              </span>
            </span>
            {phase !== "intro" && (
              <button
                type="button"
                onClick={reset}
                className="ml-auto shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] font-bold"
                style={{
                  background: "var(--wc-card)",
                  border: "1px solid var(--wc-line)",
                  color: "var(--wc-mute)",
                }}
              >
                새 질문
              </button>
            )}
          </div>

          {/* 메시지 */}
          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
            style={{ maxHeight: inModal ? 340 : 460 }}
          >
            {phase === "intro" && !blocked && (
              <>
                <Bubble role="luna">
                  안녕, 나는 루나예요. 축구 얘기라면 뭐든 카드로 봐줄게요. 무엇이 궁금한가요?
                </Bubble>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setQuestion(p)}
                      className="rounded-full px-2.5 py-1.5 text-[12px] font-semibold"
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
              </>
            )}

            {blocked && (
              <Bubble role="luna">
                <p className="text-[14px] leading-relaxed" style={{ wordBreak: "keep-all" }}>
                  {blocked.message}
                </p>
                {blocked.resources && (
                  <ul className="mt-2 space-y-1">
                    {blocked.resources.map((r) => (
                      <li key={r.name} className="text-[13px]">
                        <span className="font-bold">{r.name}</span> · {r.contact}
                      </li>
                    ))}
                  </ul>
                )}
              </Bubble>
            )}

            {askedQuestion && <Bubble role="user">{askedQuestion}</Bubble>}

            {phase === "stage" && (
              <Bubble role="luna" muted>
                {flipped.size === 0
                  ? "카드를 깔았어요. 왼쪽에서 한 장씩 뒤집어 보세요."
                  : reading.length > 0 && !streaming
                    ? "이야기는 다 준비했어요. 남은 카드를 뒤집어 주세요."
                    : "…"}
              </Bubble>
            )}

            {allFlipped && (
              <Bubble role="luna">
                {shown.split("\n").map((l, i) => {
                  const t = l.trim()
                  if (!t) return null
                  if (t.startsWith("#")) {
                    return (
                      <p
                        key={i}
                        className="mt-3 mb-1 text-[13px] font-extrabold first:mt-0"
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
                      style={{ wordBreak: "keep-all" }}
                    >
                      {t}
                    </p>
                  )
                })}
                {typing && (
                  <span
                    aria-hidden
                    className="ml-0.5 inline-block h-[14px] w-[2px] animate-pulse align-middle"
                    style={{ background: "var(--wc-burgundy)" }}
                  />
                )}
              </Bubble>
            )}

            {turns.map((t, i) => (
              <Bubble key={i} role={t.role}>
                {t.role === "luna" && !t.text ? "…" : t.text}
              </Bubble>
            ))}

            {error && (
              <p className="text-center text-[13px]" style={{ color: "var(--wc-burgundy)" }}>
                {error}
              </p>
            )}
          </div>

          {/* 스프레드 — 질문 전에만. 알약 대신 작은 선택 줄 */}
          {phase === "intro" && (
            <div
              className="flex flex-none items-center gap-2 px-4 py-2"
              style={{ borderTop: "1px solid var(--wc-line)" }}
            >
              <span
                className="shrink-0 text-[11.5px] font-bold"
                style={{ color: "var(--wc-mute)" }}
              >
                몇 장
              </span>
              {SPREAD_IDS.map((id) => {
                const active = spreadId === id
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSpreadId(id)}
                    aria-pressed={active}
                    className="rounded-full px-2.5 py-1 text-[12px] font-bold"
                    style={{
                      background: active ? "var(--wc-burgundy)" : "var(--wc-card)",
                      border: `1px solid ${active ? "var(--wc-burgundy)" : "var(--wc-line)"}`,
                      color: active ? "#fff" : "var(--wc-mute)",
                    }}
                  >
                    {SPREADS[id].name}
                  </button>
                )
              })}
            </div>
          )}

          {/* 입력 — 질문과 후속 질문을 같은 자리에서 받는다 */}
          <div
            className="flex flex-none items-end gap-2 px-3 py-3"
            style={{ borderTop: "1px solid var(--wc-line)", background: "var(--wc-card)" }}
          >
            <textarea
              value={phase === "intro" ? question : followup}
              onChange={(e) => {
                const v = e.target.value.slice(0, 200)
                if (phase === "intro") setQuestion(v)
                else setFollowup(v)
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  if (canSend) send()
                }
              }}
              rows={1}
              disabled={phase === "dealing" || phase === "stage"}
              placeholder={
                phase === "intro"
                  ? "무엇이 궁금한가요? (날짜·상대까지 적으면 더 잘 읽혀요)"
                  : phase === "stage"
                    ? "카드를 다 뒤집으면 이어서 물어볼 수 있어요"
                    : "루나에게 더 물어보기…"
              }
              className="max-h-24 min-w-0 flex-1 resize-none rounded-xl px-3.5 py-2.5 text-[14px] outline-none disabled:opacity-50"
              style={{
                background: "var(--wc-paper)",
                border: "1px solid var(--wc-line)",
                color: "var(--wc-ink)",
              }}
            />
            <button
              type="button"
              onClick={send}
              disabled={!canSend || busy}
              className="h-10 shrink-0 rounded-xl px-4 text-[13px] font-bold disabled:opacity-45"
              style={{ background: "var(--wc-burgundy)", color: "#fff" }}
            >
              {phase === "intro" ? "카드 뽑기" : busy ? "…" : "묻기"}
            </button>
          </div>
        </div>
      </div>

      {/* 오락 목적 고지 — 상시 노출 */}
      <p className="mt-4 text-center text-[11.5px]" style={{ color: "var(--wc-mute)" }}>
        타로 리딩은 오락 목적의 콘텐츠예요. 경기 결과나 이적을 예측하지 않으며,
        <br />
        어떤 형태의 금전적 판단에도 사용할 수 없어요.
      </p>
    </div>
  )
}

/** 대화 말풍선 — 루나는 왼쪽, 상담자는 오른쪽 */
function Bubble({
  role,
  muted = false,
  children,
}: {
  role: "user" | "luna"
  muted?: boolean
  children: React.ReactNode
}) {
  const isUser = role === "user"
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className="max-w-[88%] rounded-2xl px-3.5 py-2.5"
        style={{
          background: isUser ? "var(--wc-burgundy)" : "var(--wc-card)",
          border: isUser ? "none" : "1px solid var(--wc-line)",
          color: isUser ? "#fff" : "var(--wc-ink-2)",
          opacity: muted ? 0.75 : 1,
          borderBottomRightRadius: isUser ? 6 : undefined,
          borderBottomLeftRadius: isUser ? undefined : 6,
        }}
      >
        {typeof children === "string" ? (
          <p className="text-[14px] leading-relaxed" style={{ wordBreak: "keep-all" }}>
            {children}
          </p>
        ) : (
          children
        )}
      </div>
    </div>
  )
}
