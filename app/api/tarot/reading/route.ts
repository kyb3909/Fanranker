import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { apiBadRequest, apiError, checkRateLimit } from "@/lib/api-error"
import { chatParams } from "@/lib/llm/openai-params"
import { logUsageFailure, logUsageTokens, readUsage, type LlmUsage } from "@/lib/llm/usage-log"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { CARD_MEANINGS } from "@/lib/tarot/cards"
import { drawCards } from "@/lib/tarot/draw"
import { findFixtureLine } from "@/lib/tarot/fixture"
import { getSpread, isSpreadId } from "@/lib/tarot/spreads"
import { buildUserPrompt, splitExpressionTag, SYSTEM_PROMPT } from "@/lib/tarot/prompt"
import { CRISIS_MESSAGE, CRISIS_RESOURCES, GAMBLING_MESSAGE, checkSafety } from "@/lib/tarot/safety"
import {
  DEFAULT_EXPRESSION,
  inferExpression,
  parseExpression,
  type Expression,
} from "@/lib/tarot/expression"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * POST /api/tarot/reading — 축구 타로 리딩 (비로그인 가능). **NDJSON 스트림**.
 *
 * ## 설계 (타로 서비스 D:/Projects/tarot 의 규약을 따름)
 * - **카드는 서버가 뽑는다.** 클라이언트가 보낸 카드 값은 받지 않는다 — 받는 순간
 *   유저가 원하는 결과를 만들 수 있고 "점"이 아니라 장난감이 된다.
 * - 카드 의미는 코드(cards.ts)에서 프롬프트로 주입 — 모델의 의미 창작 차단.
 * - 안전 가드는 서버 사전 필터 + 프롬프트 규칙 **이중 방어**.
 *
 * ## 왜 스트림인가 (2026-08-15 전면 개편)
 * 종전엔 해석이 완성될 때까지 기다렸다가 결과를 통째로 떨궜다. 그 사이 화면은 스피너였고,
 * 리딩이 **사건**이 아니라 **조회**로 읽혔다("삭막하다"의 정체). 원본 서비스는 카드를 먼저
 * 깔아 사용자가 한 장씩 뒤집게 하고 그동안 해석을 흘린다.
 *
 * 그래서 엔드포인트를 쪼개지 않고 **한 스트림 안에서 카드를 먼저 보낸다.** 쪼개면
 * (draw → interpret) 클라가 카드를 되돌려줘야 해서 위 첫 번째 원칙이 깨진다.
 *
 * 프로토콜 — 한 줄에 JSON 하나:
 *   {"type":"blocked", ...}                  안전 가드에 걸림 (이후 줄 없음)
 *   {"type":"cards", question, spread, cards} 카드 확정 — 무대를 열 수 있다
 *   {"type":"expression", value}             루나 표정 (모델 첫 줄에서 뽑히는 즉시)
 *   {"type":"delta", t}                      해석 조각 (여러 번)
 *   {"type":"done"}                          정상 종료
 *   {"type":"error", message}                해석 실패 (카드는 이미 갔을 수 있다)
 */

const BodySchema = z.object({
  question: z.string().trim().min(2, "질문을 조금만 더 적어주세요.").max(200),
  spreadId: z.string().refine(isSpreadId, "알 수 없는 스프레드입니다."),
})

interface ReadingCard {
  position: number
  positionName: string
  arcana: number
  nameKo: string
  name: string
  reversed: boolean
  image: string
}

export async function POST(request: NextRequest) {
  // 리딩 1회가 LLM 호출 1회다 — 표준(60/분)보다 빡빡하게
  const limited = checkRateLimit(request, "STRICT")
  if (limited) return limited

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return apiBadRequest("잘못된 요청 본문입니다.")
  }
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) {
    return apiBadRequest(parsed.error.issues[0]?.message ?? "잘못된 입력입니다.")
  }
  const { question, spreadId } = parsed.data

  // ── 안전 가드 (카드를 뽑기 전에) ──
  // 스트림을 열기 전에 처리한다 — 차단은 연출 없이 즉시 도달해야 한다.
  const verdict = checkSafety(question)
  if (verdict === "crisis" || verdict === "gambling") {
    const payload =
      verdict === "crisis"
        ? {
            type: "blocked" as const,
            blocked: "crisis" as const,
            message: CRISIS_MESSAGE,
            resources: CRISIS_RESOURCES,
            expression: "worried" satisfies Expression,
          }
        : {
            type: "blocked" as const,
            blocked: "gambling" as const,
            message: GAMBLING_MESSAGE,
            expression: "tilt" satisfies Expression,
          }
    return new NextResponse(JSON.stringify(payload) + "\n", {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
      },
    })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return apiError("해석 기능이 잠시 쉬는 중이에요.", 503)

  // ── 카드 추출 (서버 확정) ──
  const spread = getSpread(spreadId)
  const drawn = drawCards(spreadId)
  const cards: ReadingCard[] = drawn.map((c) => {
    const m = CARD_MEANINGS.find((x) => x.arcana === c.arcanaNumber)!
    return {
      position: c.position,
      positionName: spread.positions[c.position]?.name ?? "",
      arcana: c.arcanaNumber,
      nameKo: m.nameKo,
      name: m.name,
      reversed: c.reversed,
      image: `/tarot/cards/${c.arcanaNumber}.webp`,
    }
  })

  const encoder = new TextEncoder()
  const line = (o: unknown) => encoder.encode(JSON.stringify(o) + "\n")

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // 카드를 먼저 보낸다 — 클라이언트는 이 시점에 무대를 열고 뒤집기를 시작한다.
      controller.enqueue(
        line({
          type: "cards",
          question,
          spread: { id: spread.id, name: spread.name },
          cards,
        })
      )

      // 무대 배경 (내부 경기 일정 — 전력 정보 없음, 실패해도 리딩은 성립)
      let fixtureLine: string | undefined
      try {
        fixtureLine =
          (await findFixtureLine(createServiceRoleClient(), question, new Date())) ?? undefined
      } catch {
        // fail-open: 배경 없이 진행
      }

      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            // chatParams 필수 — 모델 세대별 파라미터 차이를 여기서 흡수한다(lib/llm/openai-params)
            ...chatParams("gpt-5.6-luna", { temperature: 0.85, max_tokens: 1400 }),
            stream: true,
            // ⚠️ stream 응답은 본문에 usage 가 없다 — include_usage 를 켜야 **마지막
            //    청크**로 따로 온다. 그 청크는 choices 가 비어 있어서 아래 델타 파싱이
            //    자연히 건너뛴다(기존 동작 그대로).
            stream_options: { include_usage: true },
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              {
                role: "user",
                content: buildUserPrompt({ question, spreadId, cards: drawn, fixtureLine }),
              },
            ],
          }),
          signal: AbortSignal.timeout(55000),
        })
        if (!res.ok || !res.body) {
          logUsageFailure("tarot-reading", "gpt-5.6-luna", `http_${res.status}`)
          console.error("[tarot] LLM HTTP", res.status)
          controller.enqueue(
            line({
              type: "error",
              message: "카드는 뽑혔는데 루나가 말을 고르다 멈췄어요. 다시 시도해주세요.",
            })
          )
          controller.close()
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let sseBuf = ""
        // 표정 태그는 응답 **첫 줄**에 온다. 첫 줄이 확정될 때까지만 붙들었다가 한 번에 흘린다.
        let head = ""
        let expressionSent = false
        let sawAnyText = false
        let usage: LlmUsage | null = null

        const flushHead = () => {
          const [tag, body] = splitExpressionTag(head)
          const expression = parseExpression(tag) ?? inferExpression(drawn) ?? DEFAULT_EXPRESSION
          controller.enqueue(line({ type: "expression", value: expression }))
          expressionSent = true
          if (body) controller.enqueue(line({ type: "delta", t: body }))
          head = ""
        }

        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          sseBuf += decoder.decode(value, { stream: true })
          const chunks = sseBuf.split("\n")
          sseBuf = chunks.pop() ?? ""
          for (const c of chunks) {
            const t = c.trim()
            if (!t.startsWith("data:")) continue
            const payload = t.slice(5).trim()
            if (payload === "[DONE]") continue
            let delta = ""
            try {
              const j = JSON.parse(payload) as {
                choices?: { delta?: { content?: string } }[]
                usage?: unknown
              }
              if (j.usage) usage = readUsage(j)
              delta = j.choices?.[0]?.delta?.content ?? ""
            } catch {
              continue
            }
            if (!delta) continue
            sawAnyText = true
            if (!expressionSent) {
              head += delta
              // 첫 줄이 끝났거나(개행) 태그가 없는 게 확실해질 만큼(60자) 모이면 방출
              if (head.includes("\n") || head.length > 60) flushHead()
              continue
            }
            controller.enqueue(line({ type: "delta", t: delta }))
          }
        }
        // 개행 없이 끝난 짧은 응답 처리
        if (!expressionSent && head) flushHead()
        if (usage) logUsageTokens("tarot-reading", "gpt-5.6-luna", usage)
        if (!sawAnyText) {
          controller.enqueue(
            line({ type: "error", message: "해석을 받지 못했어요. 다시 시도해주세요." })
          )
        } else {
          controller.enqueue(line({ type: "done" }))
        }
      } catch (e) {
        console.error("[tarot] stream failed", e)
        controller.enqueue(
          line({ type: "error", message: "리딩이 중간에 끊겼어요. 다시 시도해주세요." })
        )
      }
      controller.close()
    },
  })

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      // 프록시가 스트림을 모아 보내면 연출이 통째로 죽는다
      "X-Accel-Buffering": "no",
    },
  })
}
